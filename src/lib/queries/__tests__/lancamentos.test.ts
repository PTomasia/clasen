import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";
import { getRecentLancamentos } from "../lancamentos";

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
  `);
  return db;
}

async function seedClientPlan(db: ReturnType<typeof createTestDb>, name: string, planType = "Essential", planValue = 400) {
  const client = await db.insert(schema.clients).values({ name }).returning().get();
  const plan = await db
    .insert(schema.subscriptionPlans)
    .values({ clientId: client.id, planType, planValue, startDate: "2026-01-01" })
    .returning()
    .get();
  return { clientId: client.id, planId: plan.id };
}

describe("getRecentLancamentos", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    db = createTestDb();
  });

  it("combina pagamentos de plano e receitas avulsas, ordenado por data desc", async () => {
    const { clientId, planId } = await seedClientPlan(db, "Ana Silva");
    await db.insert(schema.planPayments).values({ planId, clientId, paymentDate: "2026-05-10", amount: 400 }).run();
    await db.insert(schema.planPayments).values({ planId, clientId, paymentDate: "2026-04-10", amount: 400 }).run();
    await db.insert(schema.oneTimeRevenues).values({ clientId, date: "2026-06-01", amount: 150, product: "Carrossel avulso" }).run();

    const rows = await getRecentLancamentos(db);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.date)).toEqual(["2026-06-01", "2026-05-10", "2026-04-10"]);
    expect(rows[0]).toMatchObject({ kind: "avulso", label: "Carrossel avulso", clientName: "Ana Silva" });
    expect(rows[1]).toMatchObject({ kind: "plano", label: "Essential", amount: 400 });
  });

  it("exclui pagamentos congelados (skipped)", async () => {
    const { clientId, planId } = await seedClientPlan(db, "Bia");
    await db.insert(schema.planPayments).values({ planId, clientId, paymentDate: "2026-05-10", amount: 400 }).run();
    await db.insert(schema.planPayments).values({ planId, clientId, paymentDate: "2026-03-10", amount: 0, skipped: true }).run();

    const rows = await getRecentLancamentos(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-05-10");
  });

  it("receita avulsa sem cliente → clientName null", async () => {
    await db.insert(schema.oneTimeRevenues).values({ clientId: null, date: "2026-06-01", amount: 99, product: "PDF" }).run();
    const rows = await getRecentLancamentos(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].clientName).toBeNull();
    expect(rows[0].kind).toBe("avulso");
  });

  it("marca pago corretamente para plano (status) e avulso (isPaid)", async () => {
    const { clientId, planId } = await seedClientPlan(db, "Carla");
    await db.insert(schema.planPayments).values({ planId, clientId, paymentDate: "2026-05-10", amount: 400, status: "pendente" }).run();
    await db.insert(schema.oneTimeRevenues).values({ clientId, date: "2026-05-11", amount: 50, product: "PDF", isPaid: false }).run();

    const rows = await getRecentLancamentos(db);
    expect(rows.find((r) => r.kind === "plano")!.pago).toBe(false);
    expect(rows.find((r) => r.kind === "avulso")!.pago).toBe(false);
  });

  it("respeita o limite", async () => {
    const { clientId, planId } = await seedClientPlan(db, "Dani");
    for (let i = 1; i <= 5; i++) {
      await db.insert(schema.planPayments).values({ planId, clientId, paymentDate: `2026-0${i}-10`, amount: 400 }).run();
    }
    const rows = await getRecentLancamentos(db, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0].date).toBe("2026-05-10"); // mais recente primeiro
  });
});
