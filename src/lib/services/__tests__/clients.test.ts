import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";

import {
  createPlan,
  closePlan,
  updateClient,
} from "../plans";
import {
  getClientStatus,
  getClientsList,
  getClientDetail,
  findOrCreateClient,
} from "../clients";
import { eq } from "drizzle-orm";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_origin TEXT,
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
  `);

  return db;
}

// Mock de data fixa para testes de permanência
const MOCK_TODAY = "2026-04-13";

describe("getClientsList", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("retorna lista vazia quando não há clientes", async () => {
    const clients = await getClientsList(db, MOCK_TODAY);
    expect(clients).toHaveLength(0);
  });

  it("retorna cliente ativo com permanência desde o primeiro plano", async () => {
    // Cliente com 1 plano ativo desde jan/2025
    await createPlan(db, {
      clientName: "Ana Silva",
      contactOrigin: "Instagram",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 2,
      postsTrafego: 0,
      startDate: "2025-01-01",
    });

    const clients = await getClientsList(db, MOCK_TODAY);

    expect(clients).toHaveLength(1);
    expect(clients[0].name).toBe("Ana Silva");
    expect(clients[0].status).toBe("ativo");
    expect(clients[0].contactOrigin).toBe("Instagram");
    // Jan 2025 → Abr 2026 = 15 meses
    expect(clients[0].permanencia).toBe(15);
  });

  it("permanência sobrevive a upgrade (usa primeiro plano)", async () => {
    // Plano original em jan/2025
    const { client, plan: oldPlan } = await createPlan(db, {
      clientName: "Upgrade Client",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-01-01",
    });

    // Encerra plano antigo em mar/2026
    await closePlan(db, oldPlan.id, "2026-03-01");

    // Novo plano (upgrade) em mar/2026
    await createPlan(db, {
      clientId: client.id,
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 2,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-01",
      movementType: "Upgrade",
    });

    const clients = await getClientsList(db, MOCK_TODAY);

    expect(clients).toHaveLength(1);
    expect(clients[0].status).toBe("ativo");
    // Permanência desde jan/2025, NÃO desde mar/2026
    expect(clients[0].permanencia).toBe(15);
  });

  it("cliente inativo usa end_date do último plano para permanência", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Ex Cliente",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-06-01",
    });

    await closePlan(db, plan.id, "2026-02-01");

    const clients = await getClientsList(db, MOCK_TODAY);

    expect(clients[0].status).toBe("inativo");
    // Jun/2025 → Fev/2026 = 8 meses
    expect(clients[0].permanencia).toBe(8);
  });

  it("agrega valor mensal e planos ativos", async () => {
    const { client } = await createPlan(db, {
      clientName: "Multi Plano",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-01-01",
    });

    await createPlan(db, {
      clientId: client.id,
      planType: "Tráfego",
      planValue: 300,
      postsCarrossel: 0,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 1,
      startDate: "2025-03-01",
    });

    const clients = await getClientsList(db, MOCK_TODAY);

    expect(clients[0].planosAtivos).toBe(2);
    expect(clients[0].valorMensal).toBe(800);
  });

  it("calcula $/post médio dos planos ativos", async () => {
    const { client } = await createPlan(db, {
      clientName: "Custo Post",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 2,
      postsTrafego: 0,
      startDate: "2025-01-01",
    });

    // 500 / (4+0+1) = 100

    await createPlan(db, {
      clientId: client.id,
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 2,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-03-01",
    });

    // 790 / (4+2+0) = 131.67

    const clients = await getClientsList(db, MOCK_TODAY);

    // Média: (100 + 131.67) / 2 ≈ 115.83
    expect(clients[0].custoPostMedio).toBeCloseTo(115.83, 0);
  });

  it("$/post médio é null quando só tem tráfego", async () => {
    await createPlan(db, {
      clientName: "Só Tráfego",
      planType: "Tráfego",
      planValue: 400,
      postsCarrossel: 0,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 1,
      startDate: "2025-01-01",
    });

    const clients = await getClientsList(db, MOCK_TODAY);

    expect(clients[0].custoPostMedio).toBeNull();
  });

  it("múltiplos clientes retornam corretamente", async () => {
    await createPlan(db, {
      clientName: "Alpha",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-01-01",
    });

    await createPlan(db, {
      clientName: "Beta",
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-06-01",
    });

    const clients = await getClientsList(db, MOCK_TODAY);

    expect(clients).toHaveLength(2);
    const names = clients.map((c: any) => c.name);
    expect(names).toContain("Alpha");
    expect(names).toContain("Beta");
  });

  it("plano encerrado não conta no valor mensal nem planos ativos", async () => {
    const { client, plan } = await createPlan(db, {
      clientName: "Encerrou",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-01-01",
    });

    await closePlan(db, plan.id, "2026-02-01");

    // Novo plano ativo
    await createPlan(db, {
      clientId: client.id,
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-02-01",
    });

    const clients = await getClientsList(db, MOCK_TODAY);

    expect(clients[0].planosAtivos).toBe(1);
    expect(clients[0].valorMensal).toBe(790); // só o ativo
  });

  it("usa client_since para permanência quando preenchido", async () => {
    // Plano começou em jan/2026, mas cliente é de 2023
    const { client } = await createPlan(db, {
      clientName: "Veterana",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    // Setar client_since manualmente
    await updateClient(db, {
      clientId: client.id,
      name: "Veterana",
      clientSince: "2023-06-01",
    });

    const clients = await getClientsList(db, MOCK_TODAY);

    // Jun/2023 → Abr/2026 = 34 meses (não 3 que seria pelo plano)
    expect(clients[0].permanencia).toBe(34);
  });

  it("ignora client_since quando é null (usa primeiro plano)", async () => {
    await createPlan(db, {
      clientName: "Normal",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-01-01",
    });

    const clients = await getClientsList(db, MOCK_TODAY);

    // Sem client_since → usa start_date do plano: Jan/2025 → Abr/2026 = 15
    expect(clients[0].permanencia).toBe(15);
  });

  it("client_since funciona também para clientes inativos", async () => {
    const { client, plan } = await createPlan(db, {
      clientName: "Ex Veterana",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-06-01",
    });

    await closePlan(db, plan.id, "2026-02-01");

    await updateClient(db, {
      clientId: client.id,
      name: "Ex Veterana",
      clientSince: "2023-01-01",
    });

    const clients = await getClientsList(db, MOCK_TODAY);

    // Inativa: client_since (Jan/2023) → end_date último plano (Fev/2026) = 37 meses
    expect(clients[0].status).toBe("inativo");
    expect(clients[0].permanencia).toBe(37);
  });

  it("clientSince posterior ao startDate ainda prevalece (não usa min)", async () => {
    // Plano criado em Jan/2025, mas clientSince = Set/2025 (posterior)
    // Deve usar clientSince, não o startDate mais antigo
    const { client } = await createPlan(db, {
      clientName: "Posterior",
      planType: "Essential",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-01-01",
    });

    await db.update(schema.clients)
      .set({ clientSince: "2025-09-01" })
      .where(eq(schema.clients.id, client.id))
      .run();

    // referenceDate = Abr/2026
    const clients = await getClientsList(db, "2026-04-15");
    const c = clients.find((x) => x.id === client.id)!;

    // clientSince (Set/2025) → hoje (Abr/2026) = 7 meses
    // se usasse min(startDate, clientSince) seria Jan/2025 → 15 meses
    expect(c.permanencia).toBe(7);
  });

  it("clientSince + multi-plan (1 closed + 1 active) usa clientSince", async () => {
    const { client, plan: plan1 } = await createPlan(db, {
      clientName: "Multi CS",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-01-01",
    });

    await closePlan(db, plan1.id, "2025-12-01");

    await createPlan(db, {
      clientId: client.id,
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 2,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-12-01",
      movementType: "Upgrade",
    });

    await db.update(schema.clients)
      .set({ clientSince: "2024-06-01" })
      .where(eq(schema.clients.id, client.id))
      .run();

    // referenceDate = Abr/2026
    const clients = await getClientsList(db, "2026-04-15");
    const c = clients.find((x) => x.id === client.id)!;

    // clientSince (Jun/2024) → hoje (Abr/2026) = 22 meses (ativo, pq plan2 está ativo)
    expect(c.status).toBe("ativo");
    expect(c.permanencia).toBe(22);
  });
});

describe("getClientDetail", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("retorna dados do cliente com lista de todos os planos", async () => {
    const { client, plan: oldPlan } = await createPlan(db, {
      clientName: "Detail Test",
      contactOrigin: "Indicação",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-01-01",
    });

    await closePlan(db, oldPlan.id, "2026-02-01");

    await createPlan(db, {
      clientId: client.id,
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 2,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-02-01",
      movementType: "Upgrade",
    });

    const detail = await getClientDetail(db, client.id, MOCK_TODAY);

    expect(detail!.name).toBe("Detail Test");
    expect(detail!.contactOrigin).toBe("Indicação");
    expect(detail!.status).toBe("ativo");
    expect(detail!.permanencia).toBe(15); // jan/2025 → abr/2026
    expect(detail!.plans).toHaveLength(2);
    // Planos ordenados por start_date desc (mais recente primeiro)
    expect(detail!.plans[0].planType).toBe("Essential");
    expect(detail!.plans[0].status).toBe("ativo");
    expect(detail!.plans[1].planType).toBe("Personalizado");
    expect(detail!.plans[1].status).toBe("cancelado");
  });

  it("retorna null para cliente inexistente", async () => {
    const detail = await getClientDetail(db, 9999, MOCK_TODAY);
    expect(detail).toBeNull();
  });

  it("calcula LTV = pagamentos pagos + avulsas pagas", async () => {
    const { client, plan } = await createPlan(db, {
      clientName: "LTV Test",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    // 2 pagamentos pagos + 1 pendente (ignorado)
    await db.insert(schema.planPayments).values([
      { planId: plan.id, clientId: client.id, paymentDate: "2026-01-15", amount: 500, status: "pago" },
      { planId: plan.id, clientId: client.id, paymentDate: "2026-02-15", amount: 500, status: "pago" },
      { planId: plan.id, clientId: client.id, paymentDate: "2026-03-15", amount: 500, status: "pendente" },
    ]).run();

    // 1 avulsa paga + 1 pendente (ignorada)
    await db.insert(schema.oneTimeRevenues).values([
      { clientId: client.id, date: "2026-02-20", amount: 200, product: "PDF", isPaid: true },
      { clientId: client.id, date: "2026-03-20", amount: 999, product: "Arte", isPaid: false },
    ]).run();

    const detail = await getClientDetail(db, client.id, MOCK_TODAY);

    expect(detail!.ltvRecorrente).toBe(1000); // 500 + 500
    expect(detail!.ltvAvulsas).toBe(200);
    expect(detail!.ltv).toBe(1200);
    // Lista retornada inclui todas as avulsas (pagas e pendentes) — UI decide como exibir
    expect(detail!.avulsas).toHaveLength(2);
  });

  it("LTV é zero quando não há pagamentos nem avulsas pagas", async () => {
    const { client } = await createPlan(db, {
      clientName: "No Payments",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-01",
    });

    const detail = await getClientDetail(db, client.id, MOCK_TODAY);
    expect(detail!.ltv).toBe(0);
    expect(detail!.ltvRecorrente).toBe(0);
    expect(detail!.ltvAvulsas).toBe(0);
    expect(detail!.avulsas).toHaveLength(0);
  });
});

// ─── findOrCreateClient ───────────────────────────────────────────────────────

describe("findOrCreateClient", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("cria cliente novo quando não existe", async () => {
    const client = await findOrCreateClient(db, "Ana Silva");

    expect(client.id).toBeDefined();
    expect(client.name).toBe("Ana Silva");

    const all = db.select().from(schema.clients).all();
    expect(all).toHaveLength(1);
  });

  it("reutiliza cliente existente pelo nome (case-insensitive)", async () => {
    await findOrCreateClient(db, "Ana Silva");
    const second = await findOrCreateClient(db, "ana silva");

    const all = db.select().from(schema.clients).all();
    expect(all).toHaveLength(1);
    expect(second.name).toBe("Ana Silva"); // mantém o original
  });

  it("reutiliza cliente existente ignorando espaços extras", async () => {
    await findOrCreateClient(db, "Ana Silva");
    const second = await findOrCreateClient(db, "  Ana Silva  ");

    const all = db.select().from(schema.clients).all();
    expect(all).toHaveLength(1);
    expect(second.id).toBe(all[0].id);
  });

  it("salva contactOrigin ao criar cliente novo", async () => {
    const client = await findOrCreateClient(db, "Beatriz Lima", "Instagram");

    const row = db.select().from(schema.clients).all()[0];
    expect(row.contactOrigin).toBe("Instagram");
    expect(client.contactOrigin).toBe("Instagram");
  });

  it("não sobrescreve contactOrigin de cliente já existente", async () => {
    await findOrCreateClient(db, "Beatriz Lima", "Instagram");
    await findOrCreateClient(db, "Beatriz Lima", "Google");

    const row = db.select().from(schema.clients).all()[0];
    expect(row.contactOrigin).toBe("Instagram"); // primeiro valor preservado
  });

  it("rejeita nome vazio", async () => {
    await expect(findOrCreateClient(db, "   ")).rejects.toThrow(
      "nome do cliente é obrigatório"
    );
  });
});
