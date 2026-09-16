// Testes da idempotência do applyBulkImport (chave de lote em agency_settings).
// Spec: docs/specs/fix-conciliacao-aplicar-idempotente.md
// Incidente: 16/09/2026 — "Aplicar" 2x re-inseriu o lote inteiro (14 pagamentos,
// 8 avulsas, 2 clientes duplicados). As decisions reenviadas com include=true
// atropelavam a detecção de duplicatas por chave natural.

import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";
import {
  resolveBulkImport,
  applyBulkImport,
  computeBulkImportKey,
  BulkImportAlreadyAppliedError,
  BULK_IMPORT_APPLIED_KEY_PREFIX,
} from "../bulk-import";
import type { Decision } from "../bulk-import";
import { createPlan } from "../plans";

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
      description TEXT,
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
      expense_type TEXT,
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

    CREATE TABLE agency_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

async function countRows(db: ReturnType<typeof createTestDb>) {
  return {
    clients: (await db.select().from(schema.clients).all()).length,
    payments: (await db.select().from(schema.planPayments).all()).length,
    revenues: (await db.select().from(schema.oneTimeRevenues).all()).length,
    expenses: (await db.select().from(schema.expenses).all()).length,
    settings: (await db.select().from(schema.agencySettings).all()).length,
  };
}

// JSON do "replay do incidente": pagamento de plano + avulsa com cliente novo + despesa
const INCIDENT_JSON = JSON.stringify({
  source: "extrato set/2026",
  entries: [
    { type: "plan_payment", date: "2026-09-05", amount: 800, clientName: "Ana Silva" },
    {
      type: "one_time_revenue",
      date: "2026-09-10",
      amount: 300,
      clientName: "Cliente Novo",
      product: "Carrossel",
    },
    { type: "expense", month: "2026-09", amount: 100, description: "Canva", category: "fixo" },
  ],
});

const INCIDENT_DECISIONS: Decision[] = [
  { index: 0, include: true },
  { index: 1, include: true, createClient: true },
  { index: 2, include: true },
];

// ─── computeBulkImportKey ─────────────────────────────────────────────────────

describe("computeBulkImportKey", () => {
  const decisions: Decision[] = [
    { index: 0, include: true },
    { index: 1, include: false, createClient: true },
  ];

  it("é determinística e usa o prefixo bulk_import_applied:", () => {
    const k1 = computeBulkImportKey(INCIDENT_JSON, decisions);
    const k2 = computeBulkImportKey(INCIDENT_JSON, decisions);
    expect(k1).toBe(k2);
    expect(k1.startsWith(BULK_IMPORT_APPLIED_KEY_PREFIX)).toBe(true);
    // sha256 hex após o prefixo
    expect(k1.slice(BULK_IMPORT_APPLIED_KEY_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ordem das decisions não altera a chave", () => {
    const reversed = [...decisions].reverse();
    expect(computeBulkImportKey(INCIDENT_JSON, reversed)).toBe(
      computeBulkImportKey(INCIDENT_JSON, decisions)
    );
  });

  it("espaço em volta do rawJson não altera a chave (trim)", () => {
    expect(computeBulkImportKey(`  ${INCIDENT_JSON}\n`, decisions)).toBe(
      computeBulkImportKey(INCIDENT_JSON, decisions)
    );
  });

  it("decisions diferentes ⇒ chave diferente", () => {
    const other: Decision[] = [
      { index: 0, include: true },
      { index: 1, include: true, createClient: true },
    ];
    expect(computeBulkImportKey(INCIDENT_JSON, other)).not.toBe(
      computeBulkImportKey(INCIDENT_JSON, decisions)
    );
  });

  it("rawJson diferente ⇒ chave diferente", () => {
    const otherJson = JSON.stringify({ entries: [] });
    expect(computeBulkImportKey(otherJson, decisions)).not.toBe(
      computeBulkImportKey(INCIDENT_JSON, decisions)
    );
  });
});

// ─── applyBulkImport com idempotencyKey ───────────────────────────────────────

describe("applyBulkImport com idempotencyKey", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
    await seedClientWithPlan(db, "Ana Silva", 800);
  });

  it("primeira aplicação insere e registra a chave com { appliedAt, applied, source }", async () => {
    const key = computeBulkImportKey(INCIDENT_JSON, INCIDENT_DECISIONS);
    const preview = await resolveBulkImport(db, INCIDENT_JSON);
    const result = await applyBulkImport(db, preview, INCIDENT_DECISIONS, "2026-09-16", key);

    expect(result.applied).toBe(3);
    expect(result.errors).toHaveLength(0);

    const row = await db.select().from(schema.agencySettings).all();
    expect(row).toHaveLength(1);
    expect(row[0].key).toBe(key);
    const value = JSON.parse(row[0].value) as {
      appliedAt: string;
      applied: number;
      source: string;
    };
    expect(value.appliedAt).toBe("2026-09-16");
    expect(value.applied).toBe(3);
    expect(value.source).toBe("extrato set/2026");
  });

  it("replay do incidente: segunda aplicação idêntica lança erro e não insere NADA (nem cliente)", async () => {
    const key = computeBulkImportKey(INCIDENT_JSON, INCIDENT_DECISIONS);
    const p1 = await resolveBulkImport(db, INCIDENT_JSON);
    await applyBulkImport(db, p1, INCIDENT_DECISIONS, "2026-09-16", key);

    const before = await countRows(db);
    expect(before).toMatchObject({ clients: 2, payments: 1, revenues: 1, expenses: 1 });

    // Como na UI: a action re-resolve o preview antes de aplicar. O preview novo
    // até marca duplicatas, mas as decisions com include=true atropelariam —
    // a chave de idempotência precisa segurar sozinha.
    const p2 = await resolveBulkImport(db, INCIDENT_JSON);
    await expect(
      applyBulkImport(db, p2, INCIDENT_DECISIONS, "2026-09-16", key)
    ).rejects.toThrow(BulkImportAlreadyAppliedError);

    const after = await countRows(db);
    expect(after).toEqual(before);
  });

  it("mensagem do erro é amigável e inclui data e nº de linhas", async () => {
    const key = computeBulkImportKey(INCIDENT_JSON, INCIDENT_DECISIONS);
    const p1 = await resolveBulkImport(db, INCIDENT_JSON);
    await applyBulkImport(db, p1, INCIDENT_DECISIONS, "2026-09-16", key);

    const p2 = await resolveBulkImport(db, INCIDENT_JSON);
    await expect(
      applyBulkImport(db, p2, INCIDENT_DECISIONS, "2026-09-16", key)
    ).rejects.toThrow(/Este lote já foi aplicado em 16\/09\/2026 \(3 linhas\)/);
  });

  it("chave já reivindicada (status applying — request concorrente) bloqueia sem inserir", async () => {
    const key = computeBulkImportKey(INCIDENT_JSON, INCIDENT_DECISIONS);
    await db
      .insert(schema.agencySettings)
      .values({ key, value: JSON.stringify({ status: "applying", appliedAt: "2026-09-16" }) })
      .run();

    const preview = await resolveBulkImport(db, INCIDENT_JSON);
    await expect(
      applyBulkImport(db, preview, INCIDENT_DECISIONS, "2026-09-16", key)
    ).rejects.toThrow(/Este lote já foi aplicado/);

    const counts = await countRows(db);
    expect(counts).toMatchObject({ payments: 0, revenues: 0, expenses: 0 });
  });

  it("aplicação onde tudo falha (applied=0) libera a chave e permite retry", async () => {
    // "Beatriz Costa" não existe ⇒ include forçado sem override falha no applyOne
    const json = JSON.stringify({
      entries: [
        { type: "plan_payment", date: "2026-09-08", amount: 500, clientName: "Beatriz Costa" },
      ],
    });
    const decisions: Decision[] = [{ index: 0, include: true }];
    const key = computeBulkImportKey(json, decisions);

    const p1 = await resolveBulkImport(db, json);
    const r1 = await applyBulkImport(db, p1, decisions, "2026-09-16", key);
    expect(r1.applied).toBe(0);
    expect(r1.errors).toHaveLength(1);

    // Nada aplicado ⇒ chave não pode ficar registrada
    const settings = await db.select().from(schema.agencySettings).all();
    expect(settings).toHaveLength(0);

    // Pedro corrige (cadastra a cliente com plano) e re-aplica o MESMO lote
    await seedClientWithPlan(db, "Beatriz Costa", 500);
    const p2 = await resolveBulkImport(db, json);
    const r2 = await applyBulkImport(db, p2, decisions, "2026-09-16", key);
    expect(r2.applied).toBe(1);
  });

  it("sem idempotencyKey (chamada legada): nada em agency_settings e re-aplicar segue possível", async () => {
    const json = JSON.stringify({
      entries: [{ type: "expense", month: "2026-09", amount: 50, description: "Domínio" }],
    });
    const p1 = await resolveBulkImport(db, json);
    const r1 = await applyBulkImport(db, p1, [], "2026-09-16");
    expect(r1.applied).toBe(1);

    // Re-aplicar com include forçado (fluxo legítimo de duplicata confirmada)
    const p2 = await resolveBulkImport(db, json);
    const r2 = await applyBulkImport(db, p2, [{ index: 0, include: true }], "2026-09-16");
    expect(r2.applied).toBe(1);

    const counts = await countRows(db);
    expect(counts.expenses).toBe(2);
    expect(counts.settings).toBe(0);
  });

  it("decisions diferentes ⇒ chave nova ⇒ 'aplicar o resto' continua possível", async () => {
    const json = JSON.stringify({
      entries: [
        { type: "expense", month: "2026-09", amount: 120, description: "Meta Ads" },
        { type: "expense", month: "2026-09", amount: 90, description: "CapCut" },
      ],
    });

    // 1ª aplicação: só a linha 0
    const dA: Decision[] = [
      { index: 0, include: true },
      { index: 1, include: false },
    ];
    const keyA = computeBulkImportKey(json, dA);
    const p1 = await resolveBulkImport(db, json);
    const r1 = await applyBulkImport(db, p1, dA, "2026-09-16", keyA);
    expect(r1.applied).toBe(1);

    // 2ª aplicação: só a linha 1 — decisions diferentes, chave diferente
    const dB: Decision[] = [
      { index: 0, include: false },
      { index: 1, include: true },
    ];
    const keyB = computeBulkImportKey(json, dB);
    expect(keyB).not.toBe(keyA);
    const p2 = await resolveBulkImport(db, json);
    const r2 = await applyBulkImport(db, p2, dB, "2026-09-16", keyB);
    expect(r2.applied).toBe(1);

    const counts = await countRows(db);
    expect(counts.expenses).toBe(2);
    expect(counts.settings).toBe(2);
  });
});
