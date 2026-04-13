import { describe, it, expect, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";

import {
  createPlan,
  closePlan,
} from "../plans";
import {
  getClientStatus,
  getClientsList,
  getClientDetail,
} from "../clients";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_origin TEXT,
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
});
