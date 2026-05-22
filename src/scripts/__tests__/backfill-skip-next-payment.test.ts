import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../lib/db/schema";
import { runBackfillSkipNextPayment } from "../backfill-skip-next-payment";

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

describe("runBackfillSkipNextPayment", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("avança nextPaymentDate quando o mês está congelado (caso Dara)", async () => {
    const client = db.insert(schema.clients).values({ name: "Dara" }).returning().get();
    const plan = db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      startDate: "2026-01-01",
      lastPaymentDate: "2026-04-15",
      nextPaymentDate: "2026-05-15", // congelado mas não avançou
    }).returning().get();
    db.insert(schema.planPayments).values({
      planId: plan.id,
      clientId: client.id,
      paymentDate: "2026-05-15",
      amount: 0,
      status: "pago",
      skipped: true,
      notes: "Mês congelado",
    }).run();

    const report = await runBackfillSkipNextPayment(db, { apply: true });

    expect(report.changes).toHaveLength(1);
    expect(report.changes[0].before).toBe("2026-05-15");
    expect(report.changes[0].after).toBe("2026-06-15");

    const after = db.select().from(schema.subscriptionPlans).get();
    expect(after!.nextPaymentDate).toBe("2026-06-15");
  });

  it("avança através de múltiplos meses congelados consecutivos", async () => {
    const client = db.insert(schema.clients).values({ name: "MultiCongel" }).returning().get();
    const plan = db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      startDate: "2026-01-01",
      lastPaymentDate: "2026-02-15",
      nextPaymentDate: "2026-03-15",
    }).returning().get();
    // Mar, Abr e Mai congelados
    for (const m of ["2026-03-15", "2026-04-15", "2026-05-15"]) {
      db.insert(schema.planPayments).values({
        planId: plan.id, clientId: client.id,
        paymentDate: m, amount: 0, status: "pago", skipped: true, notes: "Mês congelado",
      }).run();
    }

    await runBackfillSkipNextPayment(db, { apply: true });

    const after = db.select().from(schema.subscriptionPlans).get();
    expect(after!.nextPaymentDate).toBe("2026-06-15");
  });

  it("não altera plano sem pagamentos skipped", async () => {
    const client = db.insert(schema.clients).values({ name: "SemCongel" }).returning().get();
    db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      startDate: "2026-01-01",
      lastPaymentDate: "2026-04-10",
      nextPaymentDate: "2026-05-10",
    }).run();

    const report = await runBackfillSkipNextPayment(db, { apply: true });

    expect(report.changes).toHaveLength(0);
    const after = db.select().from(schema.subscriptionPlans).get();
    expect(after!.nextPaymentDate).toBe("2026-05-10");
  });

  it("não altera plano onde nextPaymentDate já está depois do último mês congelado", async () => {
    const client = db.insert(schema.clients).values({ name: "JaResolvido" }).returning().get();
    const plan = db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      startDate: "2026-01-01",
      lastPaymentDate: null,
      nextPaymentDate: "2026-06-15", // já avançado manualmente
    }).returning().get();
    db.insert(schema.planPayments).values({
      planId: plan.id, clientId: client.id,
      paymentDate: "2026-05-15", amount: 0, status: "pago", skipped: true, notes: "Mês congelado",
    }).run();

    const report = await runBackfillSkipNextPayment(db, { apply: true });

    expect(report.changes).toHaveLength(0);
    const after = db.select().from(schema.subscriptionPlans).get();
    expect(after!.nextPaymentDate).toBe("2026-06-15");
  });

  it("dry-run não persiste mudanças mas reporta o que mudaria", async () => {
    const client = db.insert(schema.clients).values({ name: "Maju" }).returning().get();
    const plan = db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 25,
      startDate: "2026-01-01",
      lastPaymentDate: "2026-03-25",
      nextPaymentDate: "2026-04-25",
    }).returning().get();
    db.insert(schema.planPayments).values({
      planId: plan.id, clientId: client.id,
      paymentDate: "2026-04-25", amount: 0, status: "pago", skipped: true, notes: "Mês congelado",
    }).run();

    const report = await runBackfillSkipNextPayment(db, { apply: false });

    expect(report.changes).toHaveLength(1);
    expect(report.changes[0].before).toBe("2026-04-25");
    expect(report.changes[0].after).toBe("2026-05-25");

    // Banco intacto
    const after = db.select().from(schema.subscriptionPlans).get();
    expect(after!.nextPaymentDate).toBe("2026-04-25");
  });

  it("é idempotente: 2ª execução não muda nada", async () => {
    const client = db.insert(schema.clients).values({ name: "Idempotente" }).returning().get();
    const plan = db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      startDate: "2026-01-01",
      lastPaymentDate: "2026-04-15",
      nextPaymentDate: "2026-05-15",
    }).returning().get();
    db.insert(schema.planPayments).values({
      planId: plan.id, clientId: client.id,
      paymentDate: "2026-05-15", amount: 0, status: "pago", skipped: true, notes: "Mês congelado",
    }).run();

    await runBackfillSkipNextPayment(db, { apply: true });
    const second = await runBackfillSkipNextPayment(db, { apply: true });

    expect(second.changes).toHaveLength(0);
    const after = db.select().from(schema.subscriptionPlans).get();
    expect(after!.nextPaymentDate).toBe("2026-06-15");
  });

  it("ignora planos sem billingCycleDays", async () => {
    const client = db.insert(schema.clients).values({ name: "SemBilling" }).returning().get();
    const plan = db.insert(schema.subscriptionPlans).values({
      clientId: client.id,
      planType: "Site",
      planValue: 1200,
      billingCycleDays: null,
      startDate: "2026-01-01",
      lastPaymentDate: null,
      nextPaymentDate: null,
    }).returning().get();
    db.insert(schema.planPayments).values({
      planId: plan.id, clientId: client.id,
      paymentDate: "2026-05-15", amount: 0, status: "pago", skipped: true, notes: "Mês congelado",
    }).run();

    const report = await runBackfillSkipNextPayment(db, { apply: true });
    expect(report.changes).toHaveLength(0);
  });
});
