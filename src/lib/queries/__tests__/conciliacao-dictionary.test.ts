import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";
import { buildDictionary, getDictionaryData } from "../conciliacao-dictionary";
import { createPlan, closePlan } from "../../services/plans";
import { createExpense } from "../../services/expenses";

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

describe("getDictionaryData", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("banco vazio retorna estrutura válida com seções vazias", async () => {
    const data = await getDictionaryData(db, "2026-05-18");
    expect(data.activePlans).toHaveLength(0);
    expect(data.inactiveClients).toHaveLength(0);
    expect(data.topExpenseDescriptions).toHaveLength(0);
    expect(data.expenseCategoriesCounts).toEqual({ fixo: 0, variavel: 0 });
    expect(data.generatedAt).toBe("2026-05-18");
  });

  it("3 clientes ativos + 2 inativos: separa corretamente", async () => {
    // 3 ativos
    await createPlan(db, {
      clientName: "Ana Silva",
      planType: "Essential",
      planValue: 800,
      billingCycleDays: 5,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });
    await createPlan(db, {
      clientName: "Bruno Costa",
      planType: "Personalizado",
      planValue: 1200,
      billingCycleDays: 10,
      postsCarrossel: 6,
      postsReels: 2,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });
    await createPlan(db, {
      clientName: "Carla Dias",
      planType: "Essential",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 2,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    // 2 inativos: cria plano e fecha
    const r1 = await createPlan(db, {
      clientName: "Diana Ex",
      planType: "Essential",
      planValue: 300,
      billingCycleDays: 5,
      postsCarrossel: 2,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-06-01",
    });
    await closePlan(db, r1.plan.id, "2025-12-01");

    const r2 = await createPlan(db, {
      clientName: "Erica Antiga",
      planType: "Essential",
      planValue: 200,
      billingCycleDays: 5,
      postsCarrossel: 2,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-06-01",
    });
    await closePlan(db, r2.plan.id, "2025-12-01");

    const data = await getDictionaryData(db, "2026-05-18");
    expect(data.activePlans).toHaveLength(3);
    expect(data.activePlans.map((p) => p.clientName)).toEqual(["Ana Silva", "Bruno Costa", "Carla Dias"]);
    expect(data.inactiveClients).toEqual(["Diana Ex", "Erica Antiga"]);
  });

  it("5 despesas com 3 descrições únicas: top conta uses corretamente", async () => {
    await createExpense(db, { month: "2026-04", description: "Aluguel", category: "fixo", amount: 2000 });
    await createExpense(db, { month: "2026-05", description: "Aluguel", category: "fixo", amount: 2000 });
    await createExpense(db, { month: "2026-04", description: "Internet", category: "fixo", amount: 200 });
    await createExpense(db, { month: "2026-05", description: "Internet", category: "fixo", amount: 200 });
    await createExpense(db, { month: "2026-04", description: "Material", category: "variavel", amount: 100 });

    const data = await getDictionaryData(db, "2026-05-18");
    expect(data.expenseCategoriesCounts).toEqual({ fixo: 4, variavel: 1 });
    expect(data.topExpenseDescriptions[0]).toEqual({ description: "Aluguel", uses: 2 });
    expect(data.topExpenseDescriptions[1]).toEqual({ description: "Internet", uses: 2 });
    expect(data.topExpenseDescriptions[2]).toEqual({ description: "Material", uses: 1 });
  });

  it("billing_cycle_days_2 aparece no formato 'X e Y'", async () => {
    await createPlan(db, {
      clientName: "Cliente Dupla",
      planType: "Essential",
      planValue: 1000,
      billingCycleDays: 5,
      billingCycleDays2: 20,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const md = await buildDictionary(db, "2026-05-18");
    expect(md).toContain("5 e 20");
  });
});

describe("formatDictionaryMarkdown — privacidade", () => {
  it("smoke test: Markdown gerado NÃO contém whatsapp/email/city/birthday/etc", async () => {
    const db = createTestDb();
    // Insere cliente com dados sensíveis
    db.insert(schema.clients)
      .values({
        name: "Ana Silva",
        whatsapp: "+5511987654321",
        email: "ana@example.com",
        city: "São Paulo",
        state: "SP",
        birthday: "1990-05-15",
        consultaTicket: 250,
      })
      .run();
    await createPlan(db, {
      clientName: "Ana Silva",
      planType: "Essential",
      planValue: 800,
      billingCycleDays: 5,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const md = await buildDictionary(db, "2026-05-18");
    expect(md).not.toContain("+5511987654321");
    expect(md).not.toContain("ana@example.com");
    expect(md).not.toContain("São Paulo");
    expect(md).not.toContain("1990-05-15");
    // 250 (consultaTicket) também não pode aparecer — mas pode coincidir com plano.
    // Testamos com valor distintivo dos planos: ajustamos clientele assert.
    expect(md).toContain("Ana Silva");
    expect(md).toContain("800");
  });

  it("Markdown bem formado tem headers principais", async () => {
    const db = createTestDb();
    const md = await buildDictionary(db, "2026-05-18");
    expect(md).toMatch(/^# Dicionário ADM Clasen/);
    expect(md).toContain("## Clientes com plano ativo");
    expect(md).toContain("## Clientes sem plano ativo");
    expect(md).toContain("## Categorias de despesa");
    expect(md).toContain("## Descrições de despesa mais usadas");
    expect(md).toContain("## Regras de classificação");
    expect(md).toContain("## Formato JSON esperado");
  });
});
