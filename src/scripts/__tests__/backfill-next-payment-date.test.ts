import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../lib/db/schema";
import { runBackfill } from "../backfill-next-payment-date";

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
  `);

  return db;
}

describe("runBackfill", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("corrige plano órfão: next_payment_date null com last e billing preenchidos", async () => {
    const client = db.insert(schema.clients).values({ name: "Paula" }).returning().get();
    db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
      lastPaymentDate: "2026-03-10",
      nextPaymentDate: null,
    }).run();

    const count = await runBackfill(db);

    expect(count).toBe(1);
    const plan = db.select().from(schema.subscriptionPlans).get();
    expect(plan!.nextPaymentDate).toBe("2026-04-10");
  });

  it("não toca plano completo: next_payment_date já preenchido", async () => {
    const client = db.insert(schema.clients).values({ name: "Thauane" }).returning().get();
    db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
      lastPaymentDate: "2026-03-15",
      nextPaymentDate: "2026-04-15",
    }).run();

    const count = await runBackfill(db);

    expect(count).toBe(0);
    const plan = db.select().from(schema.subscriptionPlans).get();
    expect(plan!.nextPaymentDate).toBe("2026-04-15");
  });

  it("não toca plano sem billing_cycle_days: impossível calcular vencimento", async () => {
    const client = db.insert(schema.clients).values({ name: "Isabela" }).returning().get();
    db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Site",
      planValue: 1200,
      billingCycleDays: null,
      postsCarrossel: 0,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
      lastPaymentDate: "2026-03-01",
      nextPaymentDate: null,
    }).run();

    const count = await runBackfill(db);

    expect(count).toBe(0);
    const plan = db.select().from(schema.subscriptionPlans).get();
    expect(plan!.nextPaymentDate).toBeNull();
  });

  it("é idempotente: segunda execução não altera nada", async () => {
    const client = db.insert(schema.clients).values({ name: "Maju" }).returning().get();
    db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 5,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
      lastPaymentDate: "2026-03-05",
      nextPaymentDate: null,
    }).run();

    await runBackfill(db);
    const secondCount = await runBackfill(db);

    expect(secondCount).toBe(0);
    const plan = db.select().from(schema.subscriptionPlans).get();
    expect(plan!.nextPaymentDate).toBe("2026-04-05");
  });

  it("respeita billingCycleDays2 em planos com dois vencimentos por mês", async () => {
    const client = db.insert(schema.clients).values({ name: "Michelle" }).returning().get();
    db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Personalizado",
      planValue: 800,
      billingCycleDays: 5,
      billingCycleDays2: 20,
      postsCarrossel: 4,
      postsReels: 2,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
      lastPaymentDate: "2026-03-20",
      nextPaymentDate: null,
    }).run();

    await runBackfill(db);

    const plan = db.select().from(schema.subscriptionPlans).get();
    // pagou dia 20, próximo vencimento é dia 5 do mês seguinte
    expect(plan!.nextPaymentDate).toBe("2026-04-05");
  });

  it("processa múltiplos planos órfãos em lote", async () => {
    const c1 = db.insert(schema.clients).values({ name: "Maju" }).returning().get();
    const c2 = db.insert(schema.clients).values({ name: "Michelle" }).returning().get();

    db.insert(schema.subscriptionPlans).values({
      clientId: c1.id, planType: "Personalizado", planValue: 500,
      billingCycleDays: 10, postsCarrossel: 4, postsReels: 1, postsEstatico: 0, postsTrafego: 0,
      startDate: "2026-01-01", lastPaymentDate: "2026-03-10", nextPaymentDate: null,
    }).run();
    db.insert(schema.subscriptionPlans).values({
      clientId: c2.id, planType: "Essential", planValue: 790,
      billingCycleDays: 20, postsCarrossel: 4, postsReels: 1, postsEstatico: 0, postsTrafego: 0,
      startDate: "2026-01-01", lastPaymentDate: "2026-03-20", nextPaymentDate: null,
    }).run();

    const count = await runBackfill(db);

    expect(count).toBe(2);
    const plans = db.select().from(schema.subscriptionPlans).all();
    const dates = plans.map((p) => p.nextPaymentDate).sort();
    expect(dates).toEqual(["2026-04-10", "2026-04-20"]);
  });
});
