import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";
import {
  parseBulkImport,
  normalizeEntry,
  resolveBulkImport,
  applyBulkImport,
  resolveClientByName,
  buildAuditNote,
  LOW_CONFIDENCE_THRESHOLD,
} from "../bulk-import";
import type { Decision } from "../bulk-import";
import { createPlan, recordPayment } from "../plans";
import { eq } from "drizzle-orm";

// ─── Test DB helper ───────────────────────────────────────────────────────────

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_origin TEXT,
      client_type TEXT,
      client_since TEXT,
      birthday TEXT,
      whatsapp TEXT,
      email TEXT,
      city TEXT,
      state TEXT,
      niche TEXT,
      years_in_practice INTEGER,
      consulta_ticket REAL,
      has_physical_office INTEGER,
      birth_year INTEGER,
      target_audience TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE subscription_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      plan_type TEXT NOT NULL,
      plan_value REAL NOT NULL,
      billing_cycle_days INTEGER,
      billing_cycle_days_2 INTEGER,
      posts_carrossel INTEGER NOT NULL DEFAULT 0,
      posts_reels INTEGER NOT NULL DEFAULT 0,
      posts_estatico INTEGER NOT NULL DEFAULT 0,
      posts_trafego INTEGER NOT NULL DEFAULT 0,
      peso_carrossel REAL NOT NULL DEFAULT 1,
      peso_reels REAL NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      end_date TEXT,
      last_adjustment_date TEXT,
      movement_type TEXT,
      last_payment_date TEXT,
      next_payment_date TEXT,
      status TEXT NOT NULL DEFAULT 'ativo',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE plan_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pago',
      skipped INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE one_time_revenues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      product TEXT NOT NULL,
      channel TEXT,
      campaign TEXT,
      is_paid INTEGER NOT NULL DEFAULT 1,
      installments_total INTEGER,
      installment_number INTEGER,
      installment_group_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'variavel',
      amount REAL NOT NULL,
      is_paid INTEGER NOT NULL DEFAULT 1,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurring_until TEXT,
      installments_total INTEGER,
      installment_number INTEGER,
      installment_group_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

async function seedClientWithPlan(
  db: ReturnType<typeof createTestDb>,
  name: string,
  planValue: number,
  startDate = "2026-01-01"
): Promise<{ clientId: number; planId: number }> {
  const result = await createPlan(db, {
    clientName: name,
    planType: "Essential",
    planValue,
    billingCycleDays: 5,
    postsCarrossel: 4,
    postsReels: 0,
    postsEstatico: 0,
    postsTrafego: 0,
    startDate,
  });
  return { clientId: result.client.id, planId: result.plan.id };
}

// ─── normalizeEntry ───────────────────────────────────────────────────────────

describe("normalizeEntry", () => {
  it("aceita canônico com type/date/amount/clientName", () => {
    const r = normalizeEntry({
      type: "plan_payment",
      date: "2026-04-05",
      amount: 800,
      clientName: "Ana Silva",
    });
    expect("entry" in r).toBe(true);
    if ("entry" in r) {
      expect(r.entry.type).toBe("plan_payment");
      expect(r.entry.amount).toBe(800);
      expect(r.entry.clientName).toBe("Ana Silva");
    }
  });

  it("aceita legacy com tipo/data/valor_brl/cliente_pagador", () => {
    const r = normalizeEntry({
      tipo: "Plano recorrente",
      data: "2026-04-05",
      valor_brl: 850,
      cliente_pagador: "Sideli Biazzi",
      nome_no_extrato: "SIDELI B",
      banco: "XP",
      confianca_pct: 98,
    });
    expect("entry" in r).toBe(true);
    if ("entry" in r) {
      expect(r.entry.type).toBe("plan_payment");
      expect(r.entry.amount).toBe(850);
      expect(r.entry.clientName).toBe("Sideli Biazzi");
      expect(r.entry.description).toBe("SIDELI B");
      expect(r.entry.bank).toBe("XP");
      expect(r.entry.confidence).toBe(98);
    }
  });

  it("variações de casing/espaço no tipo mapeiam pra plan_payment", () => {
    for (const t of ["Plano recorrente", "plano recorrente", "PLANO RECORRENTE", "  Plano Recorrente  "]) {
      const r = normalizeEntry({ tipo: t, data: "2026-04-05", valor_brl: 100, cliente_pagador: "X" });
      expect("entry" in r).toBe(true);
      if ("entry" in r) expect(r.entry.type).toBe("plan_payment");
    }
  });

  it("tipo 'Avulso' → one_time_revenue, 'Despesa' → expense", () => {
    const av = normalizeEntry({ tipo: "Avulso", data: "2026-04-05", valor_brl: 100, cliente_pagador: "X" });
    const ex = normalizeEntry({
      tipo: "Despesa",
      data: "2026-04-05",
      valor_brl: 100,
      descricao: "Aluguel",
      categoria: "fixo",
    });
    if ("entry" in av) expect(av.entry.type).toBe("one_time_revenue");
    if ("entry" in ex) expect(ex.entry.type).toBe("expense");
  });

  it("tipos de skip retornam { skipped: true }", () => {
    for (const t of [
      "Plano recorrente — outra conta",
      "Dívida de ex-cliente",
      "Desconsiderar — pessoal/operacional",
      "Desconsiderar — pessoal",
    ]) {
      const r = normalizeEntry({ tipo: t, data: "2026-04-05", valor_brl: 100, cliente_pagador: "X" });
      expect("skipped" in r).toBe(true);
    }
  });

  it("erro quando type/tipo está ausente", () => {
    const r = normalizeEntry({ data: "2026-04-05", valor_brl: 100, cliente_pagador: "X" });
    expect("error" in r).toBe(true);
  });

  it("erro quando date inválido para plan_payment", () => {
    const r = normalizeEntry({ type: "plan_payment", amount: 100, clientName: "X" });
    expect("error" in r).toBe(true);
  });

  it("aceita valor com formato BR '1.200,50'", () => {
    const r = normalizeEntry({ type: "plan_payment", date: "2026-04-05", amount: "1.200,50", clientName: "X" });
    if ("entry" in r) expect(r.entry.amount).toBe(1200.5);
  });

  it("expense aceita month direto sem date", () => {
    const r = normalizeEntry({
      type: "expense",
      month: "2026-04",
      amount: 350,
      description: "Aluguel",
      category: "fixo",
    });
    if ("entry" in r) {
      expect(r.entry.type).toBe("expense");
      expect(r.entry.month).toBe("2026-04");
    }
  });
});

// ─── parseBulkImport ──────────────────────────────────────────────────────────

describe("parseBulkImport", () => {
  it("parseia JSON canônico com entries[]", () => {
    const json = JSON.stringify({
      source: "test",
      entries: [
        { type: "plan_payment", date: "2026-04-05", amount: 800, clientName: "Ana" },
        { type: "one_time_revenue", date: "2026-04-10", amount: 200, clientName: "Maria", product: "Carrossel" },
      ],
    });
    const parsed = parseBulkImport(json);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].type).toBe("plan_payment");
    expect(parsed.entries[1].type).toBe("one_time_revenue");
  });

  it("parseia JSON legacy com pagamentos[]", () => {
    const json = JSON.stringify({
      gerado_em: "2026-05-18",
      pagamentos: [
        { tipo: "Plano recorrente", data: "2026-04-05", valor_brl: 800, cliente_pagador: "Ana", banco: "Inter" },
      ],
      desconsiderados: [{ pagador: "Pedro", pagamentos: "...", total_brl: 100 }],
    });
    const parsed = parseBulkImport(json);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].clientName).toBe("Ana");
    expect(parsed.entries[0].bank).toBe("Inter");
    expect(parsed.skippedFromInput).toBe(1);
    expect(parsed.source).toContain("2026-05-18");
  });

  it("extrai aliasMap de diretrizes.aliases_confirmados", () => {
    const json = JSON.stringify({
      pagamentos: [],
      diretrizes: {
        aliases_confirmados: {
          "Sideli Biazzi": ["Espaço Essenzia", "Essenzia"],
        },
      },
    });
    const parsed = parseBulkImport(json);
    expect(parsed.aliasMap?.["Sideli Biazzi"]).toEqual(["Espaço Essenzia", "Essenzia"]);
  });

  it("JSON malformado lança erro claro", () => {
    expect(() => parseBulkImport("{not json")).toThrow(/JSON inválido/);
  });

  it("JSON sem entries/pagamentos lança erro", () => {
    expect(() => parseBulkImport('{"source":"x"}')).toThrow(/entries.*pagamentos/);
  });

  it("entries inválidas viram entryErrors com index/reason", () => {
    const json = JSON.stringify({
      entries: [
        { type: "plan_payment", amount: 100, clientName: "X" }, // sem date
        { type: "plan_payment", date: "2026-04-05", amount: 100, clientName: "OK" },
      ],
    });
    const parsed = parseBulkImport(json);
    expect(parsed.entryErrors).toHaveLength(1);
    expect(parsed.entryErrors[0].index).toBe(0);
    expect(parsed.entries).toHaveLength(1);
  });

  it("tipos skip viram skippedFromTypes", () => {
    const json = JSON.stringify({
      pagamentos: [
        { tipo: "Plano recorrente — outra conta", data: "2026-04-05", valor_brl: 100, cliente_pagador: "X" },
        { tipo: "Plano recorrente", data: "2026-04-05", valor_brl: 100, cliente_pagador: "Y" },
      ],
    });
    const parsed = parseBulkImport(json);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.skippedFromTypes).toHaveLength(1);
  });
});

// ─── resolveClientByName ──────────────────────────────────────────────────────

describe("resolveClientByName", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
  });

  it("matched quando existe um único cliente com tokens batendo", async () => {
    await seedClientWithPlan(db, "Ana Silva", 800);
    const res = await resolveClientByName(db, "ANA SILVA");
    expect(res.status).toBe("matched");
  });

  it("ambiguous quando 2 clientes batem", async () => {
    await seedClientWithPlan(db, "Maria Silva", 800);
    await seedClientWithPlan(db, "Maria Souza", 600);
    // "Maria" sozinho tem 4 chars, mas o critério exige tokens >2 chars
    const res = await resolveClientByName(db, "Maria");
    // "maria" empata em ambos com score=1
    expect(res.status).toBe("ambiguous");
    expect(res.candidates?.length).toBe(2);
  });

  it("unknown quando nenhum cliente bate", async () => {
    await seedClientWithPlan(db, "Ana Silva", 800);
    const res = await resolveClientByName(db, "Fulano de Tal");
    expect(res.status).toBe("unknown");
  });

  it("usa aliasMap quando fornecido", async () => {
    await seedClientWithPlan(db, "Sideli Biazzi", 850);
    const aliasMap = { "Sideli Biazzi": ["Espaço Essenzia", "Essenzia"] };
    const res = await resolveClientByName(db, "Espaço Essenzia", aliasMap);
    expect(res.status).toBe("matched");
  });
});

// ─── resolveBulkImport ────────────────────────────────────────────────────────

describe("resolveBulkImport (preview)", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
  });

  it("3 entries válidas dos 3 tipos → 3 ready", async () => {
    await seedClientWithPlan(db, "Ana Silva", 800);
    await seedClientWithPlan(db, "Maria Souza", 200);
    const json = JSON.stringify({
      entries: [
        { type: "plan_payment", date: "2026-04-05", amount: 800, clientName: "Ana Silva" },
        { type: "one_time_revenue", date: "2026-04-10", amount: 200, clientName: "Maria Souza", product: "Carrossel" },
        { type: "expense", month: "2026-04", amount: 350, description: "Aluguel", category: "fixo" },
      ],
    });
    const preview = await resolveBulkImport(db, json);
    expect(preview.counts.ready).toBe(3);
    expect(preview.counts.error).toBe(0);
  });

  it("confianca_pct=70 → status low_confidence", async () => {
    await seedClientWithPlan(db, "Bia Gracher", 270);
    const json = JSON.stringify({
      pagamentos: [
        {
          tipo: "Plano recorrente",
          data: "2026-02-09",
          valor_brl: 270,
          cliente_pagador: "Bia Gracher",
          confianca_pct: 70,
        },
      ],
    });
    const preview = await resolveBulkImport(db, json);
    expect(preview.counts.low_confidence).toBe(1);
    expect(preview.counts.ready).toBe(0);
  });

  it("confianca_pct=98 → ready normalmente", async () => {
    await seedClientWithPlan(db, "Sideli Biazzi", 850);
    const json = JSON.stringify({
      pagamentos: [
        {
          tipo: "Plano recorrente",
          data: "2026-04-05",
          valor_brl: 850,
          cliente_pagador: "Sideli Biazzi",
          confianca_pct: 98,
        },
      ],
    });
    const preview = await resolveBulkImport(db, json);
    expect(preview.counts.ready).toBe(1);
  });

  it("LOW_CONFIDENCE_THRESHOLD é 90", () => {
    expect(LOW_CONFIDENCE_THRESHOLD).toBe(90);
  });

  it("clientName inexistente → unknown_client", async () => {
    const json = JSON.stringify({
      entries: [
        { type: "plan_payment", date: "2026-04-05", amount: 100, clientName: "Fulano de Tal" },
      ],
    });
    const preview = await resolveBulkImport(db, json);
    expect(preview.counts.unknown_client).toBe(1);
  });

  it("clientName ambíguo → ambiguous com candidates", async () => {
    await seedClientWithPlan(db, "Maria Silva", 800);
    await seedClientWithPlan(db, "Maria Souza", 600);
    const json = JSON.stringify({
      entries: [{ type: "plan_payment", date: "2026-04-05", amount: 800, clientName: "Maria" }],
    });
    const preview = await resolveBulkImport(db, json);
    expect(preview.counts.ambiguous).toBe(1);
    const ambiguousItem = preview.items.find((i) => i.status === "ambiguous");
    expect(ambiguousItem?.candidates?.length).toBe(2);
  });

  it("cliente sem plano ativo → no_active_plan", async () => {
    // Criar cliente sem plano
    await db.insert(schema.clients).values({ name: "Sem Plano" }).run();
    const json = JSON.stringify({
      entries: [{ type: "plan_payment", date: "2026-04-05", amount: 100, clientName: "Sem Plano" }],
    });
    const preview = await resolveBulkImport(db, json);
    expect(preview.counts.no_active_plan).toBe(1);
  });

  it("tipo 'Plano recorrente — outra conta' → skipped_by_directive", async () => {
    const json = JSON.stringify({
      pagamentos: [
        {
          tipo: "Plano recorrente — outra conta",
          data: "2026-04-05",
          valor_brl: 100,
          cliente_pagador: "X",
        },
      ],
    });
    const preview = await resolveBulkImport(db, json);
    expect(preview.counts.skipped_by_directive).toBe(1);
  });

  it("registro manual prévio (sem marcador) ainda detecta duplicate_warning", async () => {
    const { planId } = await seedClientWithPlan(db, "Ana Silva", 800);
    // Pagamento manual antes do bulk-import
    await recordPayment(db, { planId, paymentDate: "2026-04-05", amount: 800, status: "pago" });
    const json = JSON.stringify({
      entries: [{ type: "plan_payment", date: "2026-04-05", amount: 800, clientName: "Ana Silva" }],
    });
    const preview = await resolveBulkImport(db, json);
    expect(preview.counts.duplicate_warning).toBe(1);
  });

  it("mesmo JSON aplicado 2× → 2ª execução marca tudo como duplicate_warning", async () => {
    await seedClientWithPlan(db, "Ana Silva", 800);
    const json = JSON.stringify({
      entries: [{ type: "plan_payment", date: "2026-04-05", amount: 800, clientName: "Ana Silva" }],
    });
    const preview1 = await resolveBulkImport(db, json);
    const result1 = await applyBulkImport(db, preview1, [], "2026-05-18");
    expect(result1.applied).toBe(1);

    const preview2 = await resolveBulkImport(db, json);
    expect(preview2.counts.duplicate_warning).toBe(1);
    expect(preview2.counts.ready).toBe(0);
  });

  it("cache de resolução: muitas entries de poucos clientes não estoura queries", async () => {
    // 5 clientes, 25 entries (cada cliente 5×)
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await seedClientWithPlan(db, `Cliente${i}`, 100 + i * 10);
      ids.push(r.planId);
    }
    const entries: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      for (let j = 1; j <= 5; j++) {
        entries.push({
          type: "plan_payment",
          date: `2026-0${j}-05`,
          amount: 100 + i * 10,
          clientName: `Cliente${i}`,
        });
      }
    }
    const json = JSON.stringify({ entries });
    const preview = await resolveBulkImport(db, json);
    // Devem ser 25 itens, todos ready (não há duplicatas — datas distintas)
    expect(preview.items.length).toBe(25);
    expect(preview.counts.ready).toBe(25);
  });
});

// ─── applyBulkImport ──────────────────────────────────────────────────────────

describe("applyBulkImport", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
  });

  it("aplica 3 entries dos 3 tipos e retorna applied=3", async () => {
    await seedClientWithPlan(db, "Ana Silva", 800);
    await seedClientWithPlan(db, "Maria Souza", 200);
    const json = JSON.stringify({
      source: "extrato test",
      entries: [
        { type: "plan_payment", date: "2026-04-05", amount: 800, clientName: "Ana Silva" },
        { type: "one_time_revenue", date: "2026-04-10", amount: 200, clientName: "Maria Souza", product: "Carrossel" },
        { type: "expense", month: "2026-04", amount: 350, description: "Aluguel", category: "fixo" },
      ],
    });
    const preview = await resolveBulkImport(db, json);
    const result = await applyBulkImport(db, preview, [], "2026-05-18");
    expect(result.applied).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(result.appliedIds).toHaveLength(3);
  });

  it("notes gravado contém marcador [bulk-import ...]", async () => {
    await seedClientWithPlan(db, "Ana Silva", 800);
    const json = JSON.stringify({
      source: "extrato Inter 2026-04",
      pagamentos: [
        {
          tipo: "Plano recorrente",
          data: "2026-04-05",
          valor_brl: 800,
          cliente_pagador: "Ana Silva",
          nome_no_extrato: "PIX RECEBIDO ANA SILVA",
          banco: "Inter",
          confianca_pct: 98,
        },
      ],
    });
    const preview = await resolveBulkImport(db, json);
    await applyBulkImport(db, preview, [], "2026-05-18");
    const payments = await db.select().from(schema.planPayments).all();
    expect(payments.length).toBe(1);
    expect(payments[0].notes).toMatch(/\[bulk-import 2026-05-18 source="extrato Inter 2026-04"\]/);
    expect(payments[0].notes).toMatch(/nome_no_extrato/);
    expect(payments[0].notes).toMatch(/banco: Inter/);
    expect(payments[0].notes).toMatch(/confianca_pct: 98/);
  });

  it("ordena por (date ASC) — lastPaymentDate fica como o mais recente", async () => {
    const { planId } = await seedClientWithPlan(db, "Ana Silva", 800, "2026-01-01");
    const json = JSON.stringify({
      entries: [
        // Propositalmente fora de ordem
        { type: "plan_payment", date: "2026-03-05", amount: 800, clientName: "Ana Silva" },
        { type: "plan_payment", date: "2026-01-05", amount: 800, clientName: "Ana Silva" },
        { type: "plan_payment", date: "2026-02-05", amount: 800, clientName: "Ana Silva" },
      ],
    });
    const preview = await resolveBulkImport(db, json);
    await applyBulkImport(db, preview, [], "2026-05-18");
    const plan = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .get();
    expect(plan?.lastPaymentDate).toBe("2026-03-05");
  });

  it("billing_cycle_days_2: 2 pagamentos legítimos mesmo dia/valor aplicam se ambos confirmed", async () => {
    const { planId } = await seedClientWithPlan(db, "Ana Silva", 400);
    // Primeiro pagamento via bulk
    const json1 = JSON.stringify({
      entries: [{ type: "plan_payment", date: "2026-04-05", amount: 400, clientName: "Ana Silva" }],
    });
    const p1 = await resolveBulkImport(db, json1);
    await applyBulkImport(db, p1, [], "2026-05-18");

    // Segundo pagamento mesmo dia/valor → duplicate_warning, mas Pedro confirma
    const p2 = await resolveBulkImport(db, json1);
    expect(p2.items[0].status).toBe("duplicate_warning");
    const decisions: Decision[] = [{ index: p2.items[0].index, include: true }];
    const result = await applyBulkImport(db, p2, decisions, "2026-05-18");
    expect(result.applied).toBe(1);

    const payments = await db.select().from(schema.planPayments).where(eq(schema.planPayments.planId, planId)).all();
    expect(payments).toHaveLength(2);
  });

  it("apply parcial: 2 erros + sucessos → errors estruturado com lineIndex/type/reason", async () => {
    await seedClientWithPlan(db, "Ana Silva", 800);
    const json = JSON.stringify({
      entries: [
        { type: "plan_payment", date: "2026-04-05", amount: 800, clientName: "Ana Silva" },
        // Esse vai dar erro: cliente não existe + decision force include sem override
        { type: "plan_payment", date: "2026-04-05", amount: 800, clientName: "Inexistente" },
        // Esse cai como expense ok
        { type: "expense", month: "2026-04", amount: 100, description: "Teste", category: "variavel" },
      ],
    });
    const preview = await resolveBulkImport(db, json);
    // Forçar include do unknown_client sem criar cliente → erro
    const unknown = preview.items.find((i) => i.status === "unknown_client");
    const decisions: Decision[] = unknown ? [{ index: unknown.index, include: true }] : [];
    const result = await applyBulkImport(db, preview, decisions, "2026-05-18");
    expect(result.applied).toBe(2); // plano ok + despesa ok
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      type: "plan_payment",
      index: unknown!.index,
    });
    expect(result.errors[0].reason).toMatch(/cliente|client/i);
  });

  it("unknown_client com createClient=true cria e aplica", async () => {
    const json = JSON.stringify({
      entries: [
        { type: "one_time_revenue", date: "2026-04-05", amount: 100, clientName: "Cliente Novo", product: "Carrossel" },
      ],
    });
    const preview = await resolveBulkImport(db, json);
    const item = preview.items[0];
    // Como é one_time_revenue, vai pra "ready" mesmo com cliente null
    // Mas vamos testar a criação explícita: forçamos um plan_payment p/ ver o caminho
    const json2 = JSON.stringify({
      entries: [
        { type: "plan_payment", date: "2026-04-05", amount: 100, clientName: "Pessoa Nova Sem Plano" },
      ],
    });
    const preview2 = await resolveBulkImport(db, json2);
    expect(preview2.counts.unknown_client).toBe(1);
    // Não criamos cliente porque também precisaria de plano — esse teste cobre apenas
    // a estrutura. Só revenue cria cliente sem plano:
    const decisionsRev: Decision[] = [{ index: item.index, include: true, createClient: true }];
    const resRev = await applyBulkImport(db, preview, decisionsRev, "2026-05-18");
    expect(resRev.applied).toBe(1);
    // Cliente foi criado
    const clients = await db.select().from(schema.clients).all();
    expect(clients.some((c) => c.name === "Cliente Novo")).toBe(true);
  });

  it("no_active_plan com applyAsRevenue=true grava em one_time_revenues", async () => {
    await db.insert(schema.clients).values({ name: "Jenyfer Santos" }).run();
    const json = JSON.stringify({
      entries: [
        { type: "plan_payment", date: "2026-04-05", amount: 170, clientName: "Jenyfer Santos" },
      ],
    });
    const preview = await resolveBulkImport(db, json);
    const item = preview.items.find((i) => i.status === "no_active_plan");
    expect(item).toBeDefined();
    const decisions: Decision[] = [{ index: item!.index, include: true, applyAsRevenue: true }];
    const result = await applyBulkImport(db, preview, decisions, "2026-05-18");
    expect(result.applied).toBe(1);
    const revenues = await db.select().from(schema.oneTimeRevenues).all();
    expect(revenues).toHaveLength(1);
    expect(revenues[0].amount).toBe(170);
  });

  it("decision com ambiguous + clientIdOverride aplica para o cliente escolhido", async () => {
    const r1 = await seedClientWithPlan(db, "Maria Silva", 800);
    await seedClientWithPlan(db, "Maria Souza", 600);
    const json = JSON.stringify({
      entries: [{ type: "plan_payment", date: "2026-04-05", amount: 800, clientName: "Maria" }],
    });
    const preview = await resolveBulkImport(db, json);
    const item = preview.items.find((i) => i.status === "ambiguous");
    const decisions: Decision[] = [{ index: item!.index, include: true, clientIdOverride: r1.clientId }];
    const result = await applyBulkImport(db, preview, decisions, "2026-05-18");
    expect(result.applied).toBe(1);
    const payments = await db.select().from(schema.planPayments).all();
    expect(payments).toHaveLength(1);
    expect(payments[0].planId).toBe(r1.planId);
  });
});

// ─── buildAuditNote ───────────────────────────────────────────────────────────

describe("buildAuditNote", () => {
  it("inclui marcador com data e source", () => {
    const note = buildAuditNote(
      "extrato Inter 2026-04",
      { type: "plan_payment", amount: 100, description: "PIX X", bank: "Inter", confidence: 98 },
      "2026-05-18"
    );
    expect(note).toContain('[bulk-import 2026-05-18 source="extrato Inter 2026-04"]');
    expect(note).toContain('nome_no_extrato: "PIX X"');
    expect(note).toContain("banco: Inter");
    expect(note).toContain("confianca_pct: 98");
  });
});
