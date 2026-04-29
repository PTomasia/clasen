import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";

// Helpers para criar o DB em memória e os services
function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  // Criar tabelas manualmente (sem migration files)
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

    CREATE TABLE agency_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

// ─── Services que serão implementados ──────────────────────────────────────────
// Importações dinâmicas — os services AINDA NÃO EXISTEM (TDD: testes primeiro)
import {
  createPlan,
  closePlan,
  recordPayment,
  getActivePlans,
  getPlanById,
  getPaymentsByPlan,
  getPaymentHistory,
  getPaymentGaps,
  getActualLastPayment,
  updatePayment,
  deletePayment,
  updateClient,
  updatePlan,
  updateBillingDays,
  deletePlan,
  changePlan,
  skipBillingCycle,
  skipPaymentMonth,
} from "../plans";
import { getClientStatus } from "../clients";

describe("createPlan", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("cria plano e cliente novo em uma operação", async () => {
    const result = await createPlan(db, {
      clientName: "Ana Silva",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 30,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 2,
      postsTrafego: 0,
      startDate: "2026-04-01",
      movementType: "New",
    });

    expect(result.plan.id).toBeDefined();
    expect(result.client.name).toBe("Ana Silva");

    // Cliente foi criado no banco
    const allClients = db.select().from(schema.clients).all();
    expect(allClients).toHaveLength(1);
  });

  it("reutiliza cliente existente ao criar segundo plano", async () => {
    const first = await createPlan(db, {
      clientName: "Ana Silva",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
      movementType: "New",
    });

    const second = await createPlan(db, {
      clientId: first.client.id,
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
      movementType: "Upgrade",
    });

    const allClients = db.select().from(schema.clients).all();
    expect(allClients).toHaveLength(1); // NÃO duplicou
    expect(second.client.id).toBe(first.client.id);
  });

  it("rejeita plano sem valor", async () => {
    await expect(
      createPlan(db, {
        clientName: "Test",
        planType: "Personalizado",
        planValue: 0,
        postsCarrossel: 4,
        postsReels: 0,
        postsEstatico: 0,
        postsTrafego: 0,
        startDate: "2026-04-01",
      })
    ).rejects.toThrow("valor deve ser maior que zero");
  });

  it("rejeita plano sem posts quando não é Tráfego", async () => {
    await expect(
      createPlan(db, {
        clientName: "Test",
        planType: "Personalizado",
        planValue: 500,
        postsCarrossel: 0,
        postsReels: 0,
        postsEstatico: 0,
        postsTrafego: 0,
        startDate: "2026-04-01",
      })
    ).rejects.toThrow("plano deve ter ao menos um post ou ser do tipo Tráfego");
  });

  it("rejeita plano com valor negativo", async () => {
    await expect(
      createPlan(db, {
        clientName: "Negativo",
        planType: "Personalizado",
        planValue: -100,
        postsCarrossel: 4,
        postsReels: 0,
        postsEstatico: 0,
        postsTrafego: 0,
        startDate: "2026-04-01",
      })
    ).rejects.toThrow("valor deve ser maior que zero");
  });

  it("rejeita quando não tem clientId nem clientName", async () => {
    await expect(
      createPlan(db, {
        planType: "Personalizado",
        planValue: 500,
        postsCarrossel: 4,
        postsReels: 0,
        postsEstatico: 0,
        postsTrafego: 0,
        startDate: "2026-04-01",
      })
    ).rejects.toThrow("clientId ou clientName é obrigatório");
  });

  it("rejeita clientId inexistente", async () => {
    await expect(
      createPlan(db, {
        clientId: 9999,
        planType: "Personalizado",
        planValue: 500,
        postsCarrossel: 4,
        postsReels: 0,
        postsEstatico: 0,
        postsTrafego: 0,
        startDate: "2026-04-01",
      })
    ).rejects.toThrow("cliente não encontrado");
  });

  it("salva contactOrigin ao criar cliente novo", async () => {
    const { client } = await createPlan(db, {
      clientName: "Via Insta",
      contactOrigin: "Instagram",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    const saved = db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, client.id))
      .get();

    expect(saved!.contactOrigin).toBe("Instagram");
  });

  it("define next_payment_date no próximo mês quando billingCycleDays é informado", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Ana Nova",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-15",
      movementType: "New",
    });

    // startDate 15/04, venc dia 10 → primeiro pagamento 10/05 (próximo mês)
    expect(plan.nextPaymentDate).toBe("2026-05-10");
    expect(plan.lastPaymentDate).toBeNull();
  });

  it("define next_payment_date ajustando para último dia em mês curto", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Ana Fim",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 31,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-15", // próximo mês: fev tem 28 dias em 2026
      movementType: "New",
    });

    expect(plan.nextPaymentDate).toBe("2026-02-28");
  });

  it("não define next_payment_date quando billingCycleDays é null", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Sem Ciclo",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-15",
      movementType: "New",
    });

    expect(plan.nextPaymentDate).toBeNull();
  });

  it("permite plano Tráfego sem posts de conteúdo", async () => {
    const result = await createPlan(db, {
      clientName: "Test Traffic",
      planType: "Tráfego",
      planValue: 400,
      postsCarrossel: 0,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 1,
      startDate: "2026-04-01",
      movementType: "New",
    });

    expect(result.plan.id).toBeDefined();
    expect(result.plan.planType).toBe("Tráfego");
  });

  it("reutiliza cliente existente quando clientName bate (case-insensitive + trim)", async () => {
    const first = await createPlan(db, {
      clientName: "Fernanda Muniz",
      planType: "Personalizado",
      planValue: 1005,
      postsCarrossel: 4,
      postsReels: 2,
      postsEstatico: 4,
      postsTrafego: 0,
      startDate: "2026-02-01",
    });

    // Mesmo nome com caixa diferente e espaços extras
    const second = await createPlan(db, {
      clientName: "  fernanda MUNIZ ",
      planType: "Tráfego",
      planValue: 400,
      postsCarrossel: 0,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 1,
      startDate: "2026-04-01",
      movementType: "New",
    });

    // NÃO criou novo cliente
    const allClients = db.select().from(schema.clients).all();
    expect(allClients).toHaveLength(1);
    expect(second.client.id).toBe(first.client.id);

    // Cliente tem 2 planos agora
    const plans = db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.clientId, first.client.id))
      .all();
    expect(plans).toHaveLength(2);
  });

  it("não confunde nomes diferentes com substring em comum", async () => {
    await createPlan(db, {
      clientName: "Ana",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const result = await createPlan(db, {
      clientName: "Ana Silva",
      planType: "Personalizado",
      planValue: 600,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const allClients = db.select().from(schema.clients).all();
    expect(allClients).toHaveLength(2);
    expect(result.client.name).toBe("Ana Silva");
  });
});

describe("closePlan", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("aceita prorataAmount e gera plan_payment pendente", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Prop Test",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-02-10",
    });

    await closePlan(db, plan.id, "2026-04-20", {
      prorataAmount: 180,
      notes: "3 de 4 posts entregues",
    });

    const payments = await getPaymentsByPlan(db, plan.id);
    const prorata = payments.find((p: any) => p.status === "pendente");
    expect(prorata).toBeDefined();
    expect(prorata!.amount).toBe(180);
    expect(prorata!.paymentDate).toBe("2026-04-20");
    expect(prorata!.notes).toBe("3 de 4 posts entregues");

    const updated = await getPlanById(db, plan.id);
    expect(updated!.endDate).toBe("2026-04-20");
    expect(updated!.status).toBe("cancelado");
  });

  it("não gera plan_payment quando prorataAmount não é informado", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Sem Prop",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await closePlan(db, plan.id, "2026-04-20");

    const payments = await getPaymentsByPlan(db, plan.id);
    expect(payments).toEqual([]);
  });

  it("rejeita prorataAmount negativo ou zero", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Invalido",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await expect(
      closePlan(db, plan.id, "2026-04-20", { prorataAmount: 0 })
    ).rejects.toThrow("valor proporcional deve ser maior que zero");

    await expect(
      closePlan(db, plan.id, "2026-04-20", { prorataAmount: -50 })
    ).rejects.toThrow("valor proporcional deve ser maior que zero");
  });

  it("define end_date no plano", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Test Close",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await closePlan(db, plan.id, "2026-04-10");

    const updated = await getPlanById(db, plan.id);
    expect(updated!.endDate).toBe("2026-04-10");
    expect(updated!.status).toBe("cancelado");
  });

  it("cliente fica inativo quando não tem outros planos ativos", async () => {
    const { plan, client } = await createPlan(db, {
      clientName: "Solo Plan",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await closePlan(db, plan.id, "2026-04-10");

    const status = await getClientStatus(db, client.id);
    expect(status).toBe("inativo");
  });

  it("cliente NÃO é excluído ao encerrar todos os planos (apenas vira inativo)", async () => {
    const { plan, client } = await createPlan(db, {
      clientName: "Encerrado Não Some",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await closePlan(db, plan.id, "2026-04-10");

    const clientSaved = db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, client.id))
      .get();

    expect(clientSaved).toBeDefined();
    expect(clientSaved!.name).toBe("Encerrado Não Some");
  });

  it("plano já encerrado não muda ao fechar novamente", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Double Close",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await closePlan(db, plan.id, "2026-03-01");
    await closePlan(db, plan.id, "2026-04-10"); // segundo close

    const updated = await getPlanById(db, plan.id);
    expect(updated!.endDate).toBe("2026-04-10");
    expect(updated!.status).toBe("cancelado");
  });

  it("cliente permanece ativo quando tem outro plano ativo", async () => {
    const { client } = await createPlan(db, {
      clientName: "Multi Plan",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const { plan: plan2 } = await createPlan(db, {
      clientId: client.id,
      planType: "Tráfego",
      planValue: 300,
      postsCarrossel: 0,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 1,
      startDate: "2026-03-01",
    });

    // Fecha só o segundo plano
    await closePlan(db, plan2.id, "2026-04-10");

    const status = await getClientStatus(db, client.id);
    expect(status).toBe("ativo"); // primeiro plano ainda ativo
  });
});

describe("recordPayment", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("cria registro de pagamento e atualiza last_payment_date", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Payment Test",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 30,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-01",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-05",
      amount: 500,
      status: "pago",
    });

    const updated = await getPlanById(db, plan.id);
    expect(updated!.lastPaymentDate).toBe("2026-04-05");

    const payments = await getPaymentsByPlan(db, plan.id);
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(500);
  });

  it("calcula next_payment_date como dia de vencimento do próximo mês", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Cycle Test",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-01",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-08",
      amount: 500,
      status: "pago",
    });

    // Vencimento dia 10: próximo = 10 de maio
    const updated = await getPlanById(db, plan.id);
    expect(updated!.nextPaymentDate).toBe("2026-05-10");
  });

  it("next_payment_date ajusta para último dia do mês quando dia não existe", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Dia 30 em Fev",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 30,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-01-30",
      amount: 500,
    });

    // Dia 30 em fevereiro não existe → usa 28
    const updated = await getPlanById(db, plan.id);
    expect(updated!.nextPaymentDate).toBe("2026-02-28");
  });

  it("next_payment_date fica null quando plano não tem ciclo", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Sem Ciclo",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-01",
      // billingCycleDays omitido = null
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-05",
      amount: 500,
    });

    const updated = await getPlanById(db, plan.id);
    expect(updated!.lastPaymentDate).toBe("2026-04-05");
    expect(updated!.nextPaymentDate).toBeNull();
  });

  it("rejeita pagamento em plano inexistente", async () => {
    await expect(
      recordPayment(db, {
        planId: 9999,
        paymentDate: "2026-04-05",
        amount: 500,
      })
    ).rejects.toThrow("plano não encontrado");
  });

  it("múltiplos pagamentos acumulam no histórico", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Multi Pgto",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-08", amount: 500 });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-09", amount: 500 });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-04-10", amount: 500 });

    const payments = await getPaymentsByPlan(db, plan.id);
    expect(payments).toHaveLength(3);

    // last reflete último pagamento, next = dia 10 do próximo mês
    const updated = await getPlanById(db, plan.id);
    expect(updated!.lastPaymentDate).toBe("2026-04-10");
    expect(updated!.nextPaymentDate).toBe("2026-05-10");
  });

  it("valor do pagamento pode diferir do plano (reajuste)", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Adjustment Test",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-01",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-05",
      amount: 550, // valor diferente do plano
      status: "pago",
    });

    const payments = await getPaymentsByPlan(db, plan.id);
    expect(payments[0].amount).toBe(550);

    const planData = await getPlanById(db, plan.id);
    expect(planData!.planValue).toBe(500); // plano não mudou
  });

  it("com 2 vencimentos: após pagar antes do 1º, próximo é o 2º do mesmo mês", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Dual Cycle A",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      billingCycleDays2: 25,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-09",
      amount: 250,
    });

    // Pagou antes do dia 10 → próximo vencimento = dia 25 do mesmo mês
    const updated = await getPlanById(db, plan.id);
    expect(updated!.nextPaymentDate).toBe("2026-04-25");
  });

  it("com 2 vencimentos: após pagar entre os dois, próximo é o 2º do mesmo mês", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Dual Cycle B",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      billingCycleDays2: 25,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-12",
      amount: 250,
    });

    // Pagou após dia 10, antes do dia 25 → próximo = dia 25 do mesmo mês
    const updated = await getPlanById(db, plan.id);
    expect(updated!.nextPaymentDate).toBe("2026-04-25");
  });

  it("com 2 vencimentos: após pagar no/após o 2º, próximo é o 1º do próximo mês", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Dual Cycle C",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      billingCycleDays2: 25,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-26",
      amount: 250,
    });

    // Pagou após dia 25 → próximo = dia 10 do próximo mês
    const updated = await getPlanById(db, plan.id);
    expect(updated!.nextPaymentDate).toBe("2026-05-10");
  });

  it("com 2 vencimentos: sequência completa de pagamentos", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Dual Full",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      billingCycleDays2: 25,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    // 1ª parcela abril
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-04-10", amount: 250 });
    let updated = await getPlanById(db, plan.id);
    expect(updated!.nextPaymentDate).toBe("2026-04-25");

    // 2ª parcela abril
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-04-25", amount: 250 });
    updated = await getPlanById(db, plan.id);
    expect(updated!.nextPaymentDate).toBe("2026-05-10");

    // 1ª parcela maio
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-05-10", amount: 250 });
    updated = await getPlanById(db, plan.id);
    expect(updated!.nextPaymentDate).toBe("2026-05-25");
  });
});

describe("getActivePlans", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();

    // Seed: 2 ativos, 1 encerrado
    await createPlan(db, {
      clientName: "Ativo 1",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 2,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await createPlan(db, {
      clientName: "Ativo 2",
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-02-01",
    });

    const { plan: inativoPlan } = await createPlan(db, {
      clientName: "Inativo",
      planType: "Personalizado",
      planValue: 300,
      postsCarrossel: 2,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-06-01",
    });
    await closePlan(db, inativoPlan.id, "2026-03-01");
  });

  it("retorna apenas planos ativos (sem end_date)", async () => {
    const plans = await getActivePlans(db);
    expect(plans).toHaveLength(2);
  });

  it("pode ordenar por custoPost crescente", async () => {
    const plans = await getActivePlans(db);
    // Ativo 1: 500/(4+0+2*0.5) = 500/5 = 100
    // Ativo 2: 790/(4+1+0) = 790/5 = 158
    const custos = plans.map((p: any) => p.custoPost).filter(Boolean) as number[];
    expect(custos).toEqual([...custos].sort((a, b) => a - b));
  });
});

describe("updateClient", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("atualiza nome do cliente e persiste no banco", async () => {
    const { client } = await createPlan(db, {
      clientName: "Nome Antigo",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await updateClient(db, {
      clientId: client.id,
      name: "Nome Novo",
    });

    // Verifica que persistiu
    const updated = db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, client.id))
      .get();

    expect(updated!.name).toBe("Nome Novo");
  });

  it("atualiza origem do contato", async () => {
    const { client } = await createPlan(db, {
      clientName: "Cliente Origem",
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await updateClient(db, {
      clientId: client.id,
      name: "Cliente Origem",
      contactOrigin: "Instagram",
    });

    const updated = db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, client.id))
      .get();

    expect(updated!.contactOrigin).toBe("Instagram");
  });

  it("rejeita nome vazio", async () => {
    const { client } = await createPlan(db, {
      clientName: "Teste",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await expect(
      updateClient(db, { clientId: client.id, name: "   " })
    ).rejects.toThrow("nome do cliente é obrigatório");
  });

  it("rejeita cliente inexistente", async () => {
    await expect(
      updateClient(db, { clientId: 9999, name: "Fantasma" })
    ).rejects.toThrow("cliente não encontrado");
  });

  it("limpa notas quando campo fica vazio", async () => {
    const { client } = await createPlan(db, {
      clientName: "Com Notas",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    // Primeiro set notas
    await updateClient(db, { clientId: client.id, name: "Com Notas", notes: "info importante" });
    let saved = db.select().from(schema.clients).where(eq(schema.clients.id, client.id)).get();
    expect(saved!.notes).toBe("info importante");

    // Depois limpa
    await updateClient(db, { clientId: client.id, name: "Com Notas", notes: "" });
    saved = db.select().from(schema.clients).where(eq(schema.clients.id, client.id)).get();
    expect(saved!.notes).toBeNull();
  });

  it("atualiza data de aniversário", async () => {
    const { client } = await createPlan(db, {
      clientName: "Niver",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await updateClient(db, {
      clientId: client.id,
      name: "Niver",
      birthday: "1990-07-15",
    });

    const saved = db.select().from(schema.clients).where(eq(schema.clients.id, client.id)).get();
    expect(saved!.birthday).toBe("1990-07-15");
  });

  it("atualiza número de WhatsApp", async () => {
    const { client } = await createPlan(db, {
      clientName: "Zap",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await updateClient(db, {
      clientId: client.id,
      name: "Zap",
      whatsapp: "+5511988887777",
    });

    const saved = db.select().from(schema.clients).where(eq(schema.clients.id, client.id)).get();
    expect(saved!.whatsapp).toBe("+5511988887777");
  });

  it("limpa aniversário e whatsapp quando campos ficam vazios", async () => {
    const { client } = await createPlan(db, {
      clientName: "Limpar",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await updateClient(db, {
      clientId: client.id,
      name: "Limpar",
      birthday: "1990-07-15",
      whatsapp: "+5511988887777",
    });

    await updateClient(db, {
      clientId: client.id,
      name: "Limpar",
      birthday: "",
      whatsapp: "",
    });

    const saved = db.select().from(schema.clients).where(eq(schema.clients.id, client.id)).get();
    expect(saved!.birthday).toBeNull();
    expect(saved!.whatsapp).toBeNull();
  });

  it("preserva origem ao atualizar só o nome", async () => {
    const { client } = await createPlan(db, {
      clientName: "Preservar",
      contactOrigin: "Instagram",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await updateClient(db, {
      clientId: client.id,
      name: "Novo Nome",
      contactOrigin: "Instagram", // mantém
    });

    const saved = db.select().from(schema.clients).where(eq(schema.clients.id, client.id)).get();
    expect(saved!.name).toBe("Novo Nome");
    expect(saved!.contactOrigin).toBe("Instagram");
  });

  it("trima espaços do nome", async () => {
    const { client } = await createPlan(db, {
      clientName: "Trim Test",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await updateClient(db, { clientId: client.id, name: "  Nome com Espaços  " });

    const saved = db.select().from(schema.clients).where(eq(schema.clients.id, client.id)).get();
    expect(saved!.name).toBe("Nome com Espaços");
  });
});

describe("updatePlan", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("atualiza valor e tipo do plano", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Update Plan Test",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await updatePlan(db, {
      planId: plan.id,
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
    });

    const updated = await getPlanById(db, plan.id);
    expect(updated!.planType).toBe("Essential");
    expect(updated!.planValue).toBe(790);
    expect(updated!.postsReels).toBe(1);
  });

  it("atualiza composição de posts", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Posts Update",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await updatePlan(db, {
      planId: plan.id,
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 2,
      postsReels: 2,
      postsEstatico: 4,
      postsTrafego: 1,
    });

    const updated = await getPlanById(db, plan.id);
    expect(updated!.postsCarrossel).toBe(2);
    expect(updated!.postsReels).toBe(2);
    expect(updated!.postsEstatico).toBe(4);
    expect(updated!.postsTrafego).toBe(1);
  });

  it("rejeita valor zero", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Zero Value",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await expect(
      updatePlan(db, {
        planId: plan.id,
        planType: "Personalizado",
        planValue: 0,
        postsCarrossel: 4,
        postsReels: 0,
        postsEstatico: 0,
        postsTrafego: 0,
      })
    ).rejects.toThrow("valor deve ser maior que zero");
  });

  it("rejeita plano inexistente", async () => {
    await expect(
      updatePlan(db, {
        planId: 9999,
        planType: "Personalizado",
        planValue: 500,
        postsCarrossel: 4,
        postsReels: 0,
        postsEstatico: 0,
        postsTrafego: 0,
      })
    ).rejects.toThrow("plano não encontrado");
  });

  it("não altera outros campos do plano (startDate, status)", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Preserve Fields",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-15",
      movementType: "New",
    });

    await updatePlan(db, {
      planId: plan.id,
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
    });

    const updated = await getPlanById(db, plan.id);
    expect(updated!.startDate).toBe("2026-01-15");
    expect(updated!.status).toBe("ativo");
    expect(updated!.movementType).toBe("New");
  });

  it("altera startDate quando passado explicitamente", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Start Update",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-01",
    });

    await updatePlan(db, {
      planId: plan.id,
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-01-01", // corrigindo histórico
    });

    const updated = await getPlanById(db, plan.id);
    expect(updated!.startDate).toBe("2025-01-01");
  });

  it("rejeita startDate com formato inválido", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Bad Date",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-01",
    });

    await expect(
      updatePlan(db, {
        planId: plan.id,
        planType: "Personalizado",
        planValue: 500,
        postsCarrossel: 4,
        postsReels: 0,
        postsEstatico: 0,
        postsTrafego: 0,
        startDate: "01/03/2026", // formato brasileiro — rejeitar
      })
    ).rejects.toThrow();
  });

  // ─── FIX-1.1: recalcular nextPaymentDate quando billingCycleDays muda ──────
  // Reproduz bug observado em produção (24/04/2026): planos da Innera/Dara
  // ficaram com next_payment_date NULL após payment + update de billing.

  it("FIX-1.1: ao adicionar billingCycleDays em plano com pagamento, recalcula nextPaymentDate", async () => {
    // Plano criado sem billingCycleDays
    const { plan } = await createPlan(db, {
      clientName: "Innera Repro",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-27",
    });

    // Pagamento registrado (next_payment_date fica null pq não tem billing)
    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-11",
      amount: 500,
    });

    const beforeUpdate = await getPlanById(db, plan.id);
    expect(beforeUpdate!.lastPaymentDate).toBe("2026-04-11");
    expect(beforeUpdate!.nextPaymentDate).toBeNull();

    // Pedro edita e configura billingCycleDays = 30
    await updatePlan(db, {
      planId: plan.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 30,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
    });

    const afterUpdate = await getPlanById(db, plan.id);
    // Próximo vencimento: dia 30 do mês seguinte ao último pagamento (abril → maio/30)
    expect(afterUpdate!.nextPaymentDate).toBe("2026-05-30");
    expect(afterUpdate!.lastPaymentDate).toBe("2026-04-11");
  });

  it("FIX-1.1: ao mudar billingCycleDays existente, recalcula nextPaymentDate", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Mudou Vencimento",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-10",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-10",
      amount: 500,
    });

    // Antes: next = 2026-05-10
    const before = await getPlanById(db, plan.id);
    expect(before!.nextPaymentDate).toBe("2026-05-10");

    // Cliente pediu pra mudar pro dia 20
    await updatePlan(db, {
      planId: plan.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 20,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
    });

    const after = await getPlanById(db, plan.id);
    expect(after!.nextPaymentDate).toBe("2026-05-20");
  });

  it("FIX-1.1: plano sem lastPaymentDate, ao adicionar billing, mantém nextPaymentDate de createPlan", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Sem Pagto Ainda",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    // createPlan já calculou: dia 15 do mês seguinte → 2026-05-15
    const before = await getPlanById(db, plan.id);
    expect(before!.nextPaymentDate).toBe("2026-05-15");
    expect(before!.lastPaymentDate).toBeNull();

    // Update mexe em outras coisas, billingCycleDays não muda
    await updatePlan(db, {
      planId: plan.id,
      planType: "Personalizado",
      planValue: 600,
      billingCycleDays: 15,
      postsCarrossel: 6,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
    });

    const after = await getPlanById(db, plan.id);
    // nextPaymentDate preservado (não há lastPaymentDate pra recalcular)
    expect(after!.nextPaymentDate).toBe("2026-05-15");
  });

  it("FIX-1.1: update sem billingCycleDays não zera nextPaymentDate existente", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Mantém Next",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-10",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-10",
      amount: 500,
    });

    // Update remove billingCycleDays (não passa o campo)
    await updatePlan(db, {
      planId: plan.id,
      planType: "Personalizado",
      planValue: 500,
      // billingCycleDays: omitido → vira null
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
    });

    const after = await getPlanById(db, plan.id);
    // billingCycleDays virou null (comportamento atual de updatePlan), mas
    // nextPaymentDate é PRESERVADO (não destruir histórico sem necessidade).
    expect(after!.billingCycleDays).toBeNull();
    expect(after!.nextPaymentDate).toBe("2026-05-10");
  });

  it("FIX-1.1: 2 vencimentos por mês são respeitados no recálculo", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Dois Vencimentos",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 5,
      billingCycleDays2: 20,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-05",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-05",
      amount: 250,
    });

    // Após pagto dia 5, próximo é dia 20 do mesmo mês
    const before = await getPlanById(db, plan.id);
    expect(before!.nextPaymentDate).toBe("2026-04-20");

    // Pedro muda pra 8 e 22
    await updatePlan(db, {
      planId: plan.id,
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 8,
      billingCycleDays2: 22,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
    });

    const after = await getPlanById(db, plan.id);
    // Recalculou após mudança de billing — agora 22 do mesmo mês
    expect(after!.nextPaymentDate).toBe("2026-04-22");
  });
});

describe("updateBillingDays (inline edit)", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("atualiza apenas billingCycleDays e recalcula nextPaymentDate", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Ana",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-10",
      amount: 500,
    });

    await updateBillingDays(db, plan.id, 25);

    const after = await getPlanById(db, plan.id);
    expect(after!.billingCycleDays).toBe(25);
    expect(after!.billingCycleDays2).toBeNull();
    expect(after!.nextPaymentDate).toBe("2026-05-25"); // 1x/mês: sempre próximo mês após lastPayment
  });

  it("atualiza com 2 dias de vencimento", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Ana",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await updateBillingDays(db, plan.id, 5, 20);

    const after = await getPlanById(db, plan.id);
    expect(after!.billingCycleDays).toBe(5);
    expect(after!.billingCycleDays2).toBe(20);
  });

  it("remove o segundo dia ao passar null", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Ana",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      billingCycleDays2: 25,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await updateBillingDays(db, plan.id, 10, null);

    const after = await getPlanById(db, plan.id);
    expect(after!.billingCycleDays).toBe(10);
    expect(after!.billingCycleDays2).toBeNull();
  });

  it("rejeita dia fora do range 1-31", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Ana",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await expect(updateBillingDays(db, plan.id, 0)).rejects.toThrow("entre 1 e 31");
    await expect(updateBillingDays(db, plan.id, 32)).rejects.toThrow("entre 1 e 31");
    await expect(updateBillingDays(db, plan.id, 15, 50)).rejects.toThrow("entre 1 e 31");
  });

  it("rejeita quando os dois dias são iguais", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Ana",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await expect(updateBillingDays(db, plan.id, 15, 15)).rejects.toThrow("diferentes");
  });

  it("lança erro se o plano não existe", async () => {
    await expect(updateBillingDays(db, 99999, 10)).rejects.toThrow("plano não encontrado");
  });

  it("não altera nextPaymentDate se não há lastPaymentDate", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Ana",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const before = await getPlanById(db, plan.id);
    await updateBillingDays(db, plan.id, 25);
    const after = await getPlanById(db, plan.id);

    expect(after!.billingCycleDays).toBe(25);
    expect(after!.nextPaymentDate).toBe(before!.nextPaymentDate); // não mudou (sem lastPayment)
  });
});

describe("deletePlan", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("remove plano e seus pagamentos do banco", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Delete Test",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 30,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-01",
    });

    // Registra pagamento vinculado
    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-05",
      amount: 500,
    });

    // Confirma que existem antes de deletar
    const paymentsBefore = await getPaymentsByPlan(db, plan.id);
    expect(paymentsBefore).toHaveLength(1);

    await deletePlan(db, plan.id);

    // Plano sumiu
    const deleted = await getPlanById(db, plan.id);
    expect(deleted).toBeNull();

    // Pagamentos vinculados sumiram
    const paymentsAfter = await getPaymentsByPlan(db, plan.id);
    expect(paymentsAfter).toHaveLength(0);
  });

  it("não afeta outros planos do mesmo cliente", async () => {
    const { client } = await createPlan(db, {
      clientName: "Multi Delete",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const { plan: plan2 } = await createPlan(db, {
      clientId: client.id,
      planType: "Tráfego",
      planValue: 300,
      postsCarrossel: 0,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 1,
      startDate: "2026-03-01",
    });

    await deletePlan(db, plan2.id);

    // Primeiro plano continua existindo
    const allPlans = db.select().from(schema.subscriptionPlans).all();
    expect(allPlans).toHaveLength(1);
    expect(allPlans[0].planType).toBe("Personalizado");
  });

  it("rejeita plano inexistente", async () => {
    await expect(deletePlan(db, 9999)).rejects.toThrow("plano não encontrado");
  });

  it("deletar plano sem pagamentos funciona sem erro", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Sem Pgtos",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await deletePlan(db, plan.id);
    const deleted = await getPlanById(db, plan.id);
    expect(deleted).toBeNull();
  });

  it("exclui cliente quando era o último plano", async () => {
    const { plan, client } = await createPlan(db, {
      clientName: "Último Plano",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await deletePlan(db, plan.id);

    // Cliente também foi excluído
    const clientSaved = db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, client.id))
      .get();

    expect(clientSaved).toBeUndefined();
  });

  it("mantém cliente quando ainda há outros planos", async () => {
    const { client } = await createPlan(db, {
      clientName: "Tem Outros",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const { plan: plan2 } = await createPlan(db, {
      clientId: client.id,
      planType: "Tráfego",
      planValue: 300,
      postsCarrossel: 0,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 1,
      startDate: "2026-03-01",
    });

    await deletePlan(db, plan2.id);

    const clientSaved = db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, client.id))
      .get();

    expect(clientSaved).toBeDefined();
    expect(clientSaved!.name).toBe("Tem Outros");
  });

  it("mantém cliente mesmo quando planos restantes estão encerrados", async () => {
    const { client, plan: plan1 } = await createPlan(db, {
      clientName: "Só Encerrados",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const { plan: plan2 } = await createPlan(db, {
      clientId: client.id,
      planType: "Tráfego",
      planValue: 300,
      postsCarrossel: 0,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 1,
      startDate: "2026-02-01",
    });

    // Encerrar o primeiro (ainda existe no DB)
    await closePlan(db, plan1.id, "2026-02-28");

    // Deletar o segundo — cliente ainda tem plano 1 encerrado
    await deletePlan(db, plan2.id);

    const clientSaved = db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, client.id))
      .get();

    expect(clientSaved).toBeDefined();
  });

  it("exclui cliente quando último plano (já encerrado) é deletado", async () => {
    const { client, plan } = await createPlan(db, {
      clientName: "Só Um Encerrado",
      planType: "Personalizado",
      planValue: 600,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    // Encerrar e depois deletar — é o único plano
    await closePlan(db, plan.id, "2026-03-01");
    await deletePlan(db, plan.id);

    const clientSaved = db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, client.id))
      .get();

    expect(clientSaved).toBeUndefined();
  });
});

describe("changePlan (upgrade/downgrade)", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("encerra plano antigo e cria novo com movementType Upgrade", async () => {
    const { plan: oldPlan, client } = await createPlan(db, {
      clientName: "Upgrade Test",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const result = await changePlan(db, {
      oldPlanId: oldPlan.id,
      endDate: "2026-04-12",
      newPlan: {
        planType: "Essential",
        planValue: 790,
        billingCycleDays: 10,
        postsCarrossel: 4,
        postsReels: 2,
        postsEstatico: 0,
        postsTrafego: 0,
        startDate: "2026-04-12",
        movementType: "Upgrade",
      },
    });

    // Plano antigo foi encerrado
    const old = await getPlanById(db, oldPlan.id);
    expect(old!.endDate).toBe("2026-04-12");
    expect(old!.status).toBe("cancelado");

    // Novo plano foi criado para o mesmo cliente
    expect(result.newPlan.clientId).toBe(client.id);
    expect(result.newPlan.planType).toBe("Essential");
    expect(result.newPlan.planValue).toBe(790);
    expect(result.newPlan.movementType).toBe("Upgrade");
    expect(result.newPlan.status).toBe("ativo");
  });

  it("encerra plano antigo e cria novo com movementType Downgrade", async () => {
    const { plan: oldPlan } = await createPlan(db, {
      clientName: "Downgrade Test",
      planType: "Essential",
      planValue: 790,
      postsCarrossel: 4,
      postsReels: 2,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const result = await changePlan(db, {
      oldPlanId: oldPlan.id,
      endDate: "2026-04-12",
      newPlan: {
        planType: "Personalizado",
        planValue: 500,
        postsCarrossel: 4,
        postsReels: 0,
        postsEstatico: 0,
        postsTrafego: 0,
        startDate: "2026-04-12",
        movementType: "Downgrade",
      },
    });

    expect(result.newPlan.planValue).toBe(500);
    expect(result.newPlan.movementType).toBe("Downgrade");
  });

  it("rejeita upgrade de plano inexistente", async () => {
    await expect(
      changePlan(db, {
        oldPlanId: 9999,
        endDate: "2026-04-12",
        newPlan: {
          planType: "Essential",
          planValue: 790,
          postsCarrossel: 4,
          postsReels: 0,
          postsEstatico: 0,
          postsTrafego: 0,
          startDate: "2026-04-12",
          movementType: "Upgrade",
        },
      })
    ).rejects.toThrow("plano não encontrado");
  });

  it("rejeita upgrade de plano já encerrado", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Already Closed",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await closePlan(db, plan.id, "2026-03-01");

    await expect(
      changePlan(db, {
        oldPlanId: plan.id,
        endDate: "2026-04-12",
        newPlan: {
          planType: "Essential",
          planValue: 790,
          postsCarrossel: 4,
          postsReels: 0,
          postsEstatico: 0,
          postsTrafego: 0,
          startDate: "2026-04-12",
          movementType: "Upgrade",
        },
      })
    ).rejects.toThrow("plano já está encerrado");
  });

  it("novo plano herda o billingCycleDays do antigo se não informado", async () => {
    const { plan: oldPlan } = await createPlan(db, {
      clientName: "Herda Ciclo",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const result = await changePlan(db, {
      oldPlanId: oldPlan.id,
      endDate: "2026-04-12",
      newPlan: {
        planType: "Essential",
        planValue: 790,
        postsCarrossel: 4,
        postsReels: 1,
        postsEstatico: 0,
        postsTrafego: 0,
        startDate: "2026-04-12",
        movementType: "Upgrade",
      },
    });

    expect(result.newPlan.billingCycleDays).toBe(10);
  });

  it("pagamentos do plano antigo permanecem intactos", async () => {
    const { plan: oldPlan } = await createPlan(db, {
      clientName: "Keep Payments",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, {
      planId: oldPlan.id,
      paymentDate: "2026-03-08",
      amount: 500,
    });

    await changePlan(db, {
      oldPlanId: oldPlan.id,
      endDate: "2026-04-12",
      newPlan: {
        planType: "Essential",
        planValue: 790,
        postsCarrossel: 4,
        postsReels: 1,
        postsEstatico: 0,
        postsTrafego: 0,
        startDate: "2026-04-12",
        movementType: "Upgrade",
      },
    });

    // Pagamentos do plano antigo continuam lá
    const payments = await getPaymentsByPlan(db, oldPlan.id);
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(500);
  });

  it("rollback: se createPlan falha, plano antigo permanece ativo e nenhum novo plano é criado", async () => {
    const { plan: oldPlan, client } = await createPlan(db, {
      clientName: "Rollback Test",
      planType: "Essential",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    // newPlan com valor 0 → createPlan vai rejeitar
    await expect(
      changePlan(db, {
        oldPlanId: oldPlan.id,
        endDate: "2026-04-15",
        newPlan: {
          planType: "Personalizado",
          planValue: 0,
          postsCarrossel: 4,
          postsReels: 0,
          postsEstatico: 0,
          postsTrafego: 0,
          startDate: "2026-04-15",
          movementType: "Upgrade",
        },
      })
    ).rejects.toThrow("valor deve ser maior que zero");

    // Plano antigo: estado original preservado
    const oldPlanAfter = db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, oldPlan.id))
      .get();
    expect(oldPlanAfter!.status).toBe(oldPlan.status);
    expect(oldPlanAfter!.endDate).toBe(oldPlan.endDate);

    // Nenhum plano novo do mesmo cliente
    const allPlansForClient = db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.clientId, client.id))
      .all();
    expect(allPlansForClient).toHaveLength(1);
    expect(allPlansForClient[0].id).toBe(oldPlan.id);
  });
});

describe("getPaymentHistory", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("retorna histórico de pagamentos ordenado por data decrescente", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Histórico Test",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-08", amount: 500 });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-09", amount: 500 });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-04-10", amount: 500 });

    const history = await getPaymentHistory(db, plan.id);

    expect(history.payments).toHaveLength(3);
    // Mais recente primeiro
    expect(history.payments[0].paymentDate).toBe("2026-04-10");
    expect(history.payments[1].paymentDate).toBe("2026-03-09");
    expect(history.payments[2].paymentDate).toBe("2026-02-08");
  });

  it("inclui dados do plano no resultado", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Plan Info",
      planType: "Essential",
      planValue: 790,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const history = await getPaymentHistory(db, plan.id);

    expect(history.planValue).toBe(790);
    expect(history.planType).toBe("Essential");
    expect(history.billingCycleDays).toBe(10);
  });

  it("retorna lista vazia quando não há pagamentos", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Sem Pgto",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    const history = await getPaymentHistory(db, plan.id);

    expect(history.payments).toHaveLength(0);
    expect(history.planValue).toBe(500);
  });

  it("rejeita plano inexistente", async () => {
    await expect(getPaymentHistory(db, 9999)).rejects.toThrow("plano não encontrado");
  });

  it("cada pagamento tem amount, status e notes", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Detalhe Pgto",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-03-08",
      amount: 500,
      status: "pago",
      notes: "via pix",
    });

    const history = await getPaymentHistory(db, plan.id);

    expect(history.payments[0].amount).toBe(500);
    expect(history.payments[0].status).toBe("pago");
    expect(history.payments[0].notes).toBe("via pix");
  });
});

describe("persistência após criação (bug fix: await)", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("plano criado aparece imediatamente em getActivePlans", async () => {
    await createPlan(db, {
      clientName: "Novo Imediato",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    const ativos = await getActivePlans(db);
    expect(ativos).toHaveLength(1);
    expect(ativos[0].planValue).toBe(500);
  });

  it("pagamento registrado persiste e atualiza plano na mesma chamada", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Pgto Imediato",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-03-01",
    });

    await recordPayment(db, {
      planId: plan.id,
      paymentDate: "2026-04-10",
      amount: 500,
    });

    // Verifica que o plano foi atualizado NA MESMA chamada
    // Vencimento dia 15 → próximo = 15 de maio
    const updated = await getPlanById(db, plan.id);
    expect(updated!.lastPaymentDate).toBe("2026-04-10");
    expect(updated!.nextPaymentDate).toBe("2026-05-15");
  });

  it("exclusão remove dados imediatamente", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Excluir Imediato",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await deletePlan(db, plan.id);

    const ativos = await getActivePlans(db);
    expect(ativos).toHaveLength(0);
  });
});

describe("skipBillingCycle", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("avança nextPaymentDate em 1 ciclo", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Pular Test",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    // createPlan com startDate 2026-04-01 e billing dia 10 → nextPaymentDate = 2026-05-10
    const before = await getPlanById(db, plan.id);
    expect(before!.nextPaymentDate).toBe("2026-05-10");

    await skipBillingCycle(db, plan.id);

    const after = await getPlanById(db, plan.id);
    expect(after!.nextPaymentDate).toBe("2026-06-10");
  });

  it("com 2 vencimentos por mês: avança nextPaymentDate para o próximo vencimento", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Skip Dual",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      billingCycleDays2: 25,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    // createPlan com startDate 2026-04-01 e billing 10/25:
    // calcularProximoVencimento("2026-04-01", 10, 25) → April 1 < 25 → "2026-04-25"
    const initial = await getPlanById(db, plan.id);
    expect(initial!.nextPaymentDate).toBe("2026-04-25");

    await skipBillingCycle(db, plan.id);

    const after = await getPlanById(db, plan.id);
    // Pulou 2026-04-25 → próximo = 2026-05-10 (1º vencimento do mês seguinte)
    expect(after!.nextPaymentDate).toBe("2026-05-10");
  });

  it("respeita mês curto (dia 30 em fevereiro → dia 28)", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Skip Fev",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 30,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, { planId: plan.id, paymentDate: "2026-01-30", amount: 500 });
    // Após pagamento em 30/jan → nextPaymentDate = 2026-02-28 (dia 30 em fev = 28)
    const before = await getPlanById(db, plan.id);
    expect(before!.nextPaymentDate).toBe("2026-02-28");

    await skipBillingCycle(db, plan.id);

    const after = await getPlanById(db, plan.id);
    // Pulou 2026-02-28 → próximo = 2026-03-30
    expect(after!.nextPaymentDate).toBe("2026-03-30");
  });

  it("registra log nas notes do plano", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Log Test",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await skipBillingCycle(db, plan.id);

    const after = await getPlanById(db, plan.id);
    expect(after!.notes).toMatch(/Cobrança pulada em \d{4}-\d{2}-\d{2}/);
  });

  it("preserva notes existentes ao adicionar log", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Notas Preserv",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
      notes: "nota original",
    });

    await skipBillingCycle(db, plan.id);

    const after = await getPlanById(db, plan.id);
    expect(after!.notes).toContain("nota original");
    expect(after!.notes).toContain("Cobrança pulada em");
  });

  it("rejeita plano inexistente", async () => {
    await expect(skipBillingCycle(db, 9999)).rejects.toThrow("plano não encontrado");
  });

  it("rejeita plano sem billingCycleDays", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Sem Ciclo",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await expect(skipBillingCycle(db, plan.id)).rejects.toThrow(
      "plano não tem ciclo de cobrança definido"
    );
  });

  it("rejeita plano cancelado", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Cancelado Skip",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await closePlan(db, plan.id, "2026-03-01");

    await expect(skipBillingCycle(db, plan.id)).rejects.toThrow("plano não está ativo");
  });
});

describe("getPaymentGaps", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("retorna vazio quando plano foi pago em todos os meses até hoje", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Em Dia",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    // Pagou fev, mar, abr (3 meses já passados a partir de 15/04/2026)
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-10", amount: 500 });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-10", amount: 500 });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-04-10", amount: 500 });

    const gaps = await getPaymentGaps(db, plan.id, "2026-04-15");
    expect(gaps).toEqual([]);
  });

  it("detecta mês faltante entre dois pagamentos", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Gap Middle",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    // Pagou fev e abr, pulou mar
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-10", amount: 500 });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-04-10", amount: 500 });

    const gaps = await getPaymentGaps(db, plan.id, "2026-04-15");
    expect(gaps).toEqual(["2026-03-10"]);
  });

  it("detecta múltiplos meses faltantes", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Many Gaps",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    // Pagou só fev
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-15", amount: 500 });

    // Hoje é 20/05/2026, venc. de maio é dia 15 (já passou) → mar, abr, mai
    const gaps = await getPaymentGaps(db, plan.id, "2026-05-20");
    expect(gaps).toEqual(["2026-03-15", "2026-04-15", "2026-05-15"]);
  });

  it("não acusa gap para o mês corrente se vencimento ainda não chegou", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Ainda Em Dia",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 20,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-20", amount: 500 });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-20", amount: 500 });

    // Hoje é 15/04 — venc. de abril é dia 20, ainda não chegou
    const gaps = await getPaymentGaps(db, plan.id, "2026-04-15");
    expect(gaps).toEqual([]);
  });

  it("retorna vazio quando plano não tem billingCycleDays", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Sem Ciclo",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const gaps = await getPaymentGaps(db, plan.id, "2026-04-15");
    expect(gaps).toEqual([]);
  });

  it("para em end_date quando plano foi encerrado", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Encerrada",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    // Pagou só fev; encerrou antes de março
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-10", amount: 500 });
    await closePlan(db, plan.id, "2026-02-20");

    // Hoje é 15/05, mas o plano acabou em 20/02 → não há gap
    const gaps = await getPaymentGaps(db, plan.id, "2026-05-15");
    expect(gaps).toEqual([]);
  });

  it("ignora plano sem nenhum pagamento ainda (primeiro mês antes do vencimento)", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Nova",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 25,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-10",
    });

    // Hoje 15/04, primeiro vencimento é 25/05 — sem gap ainda
    const gaps = await getPaymentGaps(db, plan.id, "2026-04-15");
    expect(gaps).toEqual([]);
  });

  it("com 2 vencimentos: detecta 2 gaps por mês se nenhum foi pago", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Dual Gap All",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      billingCycleDays2: 25,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-02-01",
    });

    // Nenhum pagamento — ambos vencimentos de março em aberto
    const gaps = await getPaymentGaps(db, plan.id, "2026-03-28");
    expect(gaps).toContain("2026-03-10");
    expect(gaps).toContain("2026-03-25");
    expect(gaps).toHaveLength(2);
  });

  it("com 2 vencimentos: detecta 1 gap se só o 1º foi pago", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Dual Gap Second",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      billingCycleDays2: 25,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-02-01",
    });

    // Pagou só o 1º vencimento de março
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-10", amount: 250 });

    const gaps = await getPaymentGaps(db, plan.id, "2026-03-28");
    expect(gaps).toEqual(["2026-03-25"]);
  });

  it("com 2 vencimentos: detecta 1 gap se só o 2º foi pago", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Dual Gap First",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      billingCycleDays2: 25,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-02-01",
    });

    // Pagou só o 2º vencimento de março
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-25", amount: 250 });

    const gaps = await getPaymentGaps(db, plan.id, "2026-03-28");
    expect(gaps).toEqual(["2026-03-10"]);
  });

  it("com 2 vencimentos: registro skipped=true fecha ambos os gaps do mês", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Skip Dual Gap",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      billingCycleDays2: 25,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-02-01",
    });

    await skipPaymentMonth(db, plan.id, "2026-03");

    const gaps = await getPaymentGaps(db, plan.id, "2026-03-28");
    expect(gaps).toEqual([]);
  });

  it("registro skipped=true fecha gap de plano com 1 vencimento", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Skip Single Gap",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await skipPaymentMonth(db, plan.id, "2026-03");

    const gaps = await getPaymentGaps(db, plan.id, "2026-04-15");
    // Fevereiro continua gap, março foi congelado
    expect(gaps).toContain("2026-02-10");
    expect(gaps).not.toContain("2026-03-10");
  });

  it("respeita earliest_tracked_month em agency_settings — cutoff histórico", async () => {
    // Cenário: plano desde agosto/2025, sem pagamentos. Hoje = 28/04/2026.
    const { plan } = await createPlan(db, {
      clientName: "Cliente Antigo",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-08-01",
    });

    // SEM cutoff: esperaria todos os gaps desde set/2025 até abr/2026 (~8 meses)
    const gapsSemCutoff = await getPaymentGaps(db, plan.id, "2026-04-28");
    expect(gapsSemCutoff.length).toBe(8); // 8 gaps históricos (set 2025 até abr 2026)
    expect(gapsSemCutoff).toContain("2025-09-15");
    expect(gapsSemCutoff).toContain("2026-01-15");

    // COM cutoff: passa minDate = "2026-02-01"
    // Agora deve retornar apenas gaps de fev, mar, abr/2026
    const gapsComCutoff = await getPaymentGaps(db, plan.id, "2026-04-28", "2026-02-01");
    expect(gapsComCutoff).toContain("2026-02-15");
    expect(gapsComCutoff).toContain("2026-03-15");
    expect(gapsComCutoff).toContain("2026-04-15");

    // Nenhum gap anterior a fevereiro
    expect(gapsComCutoff).not.toContain("2025-09-15");
    expect(gapsComCutoff).not.toContain("2025-12-15");
    expect(gapsComCutoff).not.toContain("2026-01-15");

    expect(gapsComCutoff.length).toBe(3); // Exatamente 3 gaps
  });

  it("regressão: getPaymentGaps detecta gap no mês corrente quando billing já passou", async () => {
    // Sanity check do cenário reportado em /planos: pagou só março, billing 15, hoje 28/04.
    const { plan } = await createPlan(db, {
      clientName: "Cliente Marco",
      planType: "Personalizado",
      planValue: 1005,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-08-01",
    });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-16", amount: 1005 });

    const gaps = await getPaymentGaps(db, plan.id, "2026-04-28");
    expect(gaps).toContain("2026-04-15");
  });
});

describe("getActualLastPayment", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("retorna a data do pagamento mais recente em plan_payments", async () => {
    const { plan } = await createPlan(db, {
      clientName: "MaxPgto",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-15", amount: 500 });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-15", amount: 500 });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-04-15", amount: 500 });

    const result = await getActualLastPayment(db, plan.id);
    expect(result).toBe("2026-04-15");
  });

  it("retorna null quando o plano não tem pagamentos", async () => {
    const { plan } = await createPlan(db, {
      clientName: "SemPgto",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const result = await getActualLastPayment(db, plan.id);
    expect(result).toBeNull();
  });

  it("ignora registros com skipped=true (mês congelado não conta como pagamento real)", async () => {
    const { plan } = await createPlan(db, {
      clientName: "ComSkip",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-15", amount: 500 });
    await skipPaymentMonth(db, plan.id, "2026-04");

    const result = await getActualLastPayment(db, plan.id);
    expect(result).toBe("2026-02-15");
  });

  it("detecta inconsistência: pagamento em plan_payments mais recente que subscription_plans.last_payment_date", async () => {
    // Cenário Fernanda: pagamento de abril foi inserido direto em plan_payments
    // sem atualizar last_payment_date do plano.
    const { plan } = await createPlan(db, {
      clientName: "Inconsistente",
      planType: "Personalizado",
      planValue: 1005,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2025-08-01",
    });
    await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-16", amount: 1005 });

    // Inserir pagamento direto na tabela (simulando inserção via SQL/Studio,
    // sem passar pelo recordPayment que atualiza o plano)
    await db
      .insert(schema.planPayments)
      .values({
        planId: plan.id,
        clientId: plan.clientId,
        paymentDate: "2026-04-17",
        amount: 345,
        status: "pago",
        skipped: false,
        notes: "Inter",
      })
      .run();

    // last_payment_date do plano segue 2026-03-16 (não foi atualizado)
    const planRow = await db
      .select({ lastPaymentDate: schema.subscriptionPlans.lastPaymentDate })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, plan.id))
      .get();
    expect(planRow?.lastPaymentDate).toBe("2026-03-16");

    // Mas getActualLastPayment vê o pagamento real
    const result = await getActualLastPayment(db, plan.id);
    expect(result).toBe("2026-04-17");
  });
});

describe("updatePayment", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  async function setupPlanWithThreePayments() {
    const { plan } = await createPlan(db, {
      clientName: "Edit Test",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });
    const p1 = await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-15", amount: 500 });
    const p2 = await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-15", amount: 500 });
    const p3 = await recordPayment(db, { planId: plan.id, paymentDate: "2026-04-15", amount: 500 });
    return { plan, p1, p2, p3 };
  }

  it("atualiza data, valor, status e notes do pagamento", async () => {
    const { plan, p2 } = await setupPlanWithThreePayments();

    await updatePayment(db, plan.id, p2.id, {
      paymentDate: "2026-03-20",
      amount: 600,
      status: "pago",
      notes: "Ajuste manual",
    });

    const updated = await db
      .select()
      .from(schema.planPayments)
      .where(eq(schema.planPayments.id, p2.id))
      .get();
    expect(updated?.paymentDate).toBe("2026-03-20");
    expect(updated?.amount).toBe(600);
    expect(updated?.status).toBe("pago");
    expect(updated?.notes).toBe("Ajuste manual");
  });

  it("após update, last_payment_date do plano = MAX(payment_date) dos pagamentos restantes", async () => {
    const { plan, p3 } = await setupPlanWithThreePayments();

    // Editar o pagamento mais recente (15/04 → 20/04)
    await updatePayment(db, plan.id, p3.id, {
      paymentDate: "2026-04-20",
      amount: 500,
      status: "pago",
    });

    const planRow = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, plan.id))
      .get();
    expect(planRow?.lastPaymentDate).toBe("2026-04-20");
  });

  it("após update, next_payment_date é recalculado a partir do novo last_payment_date", async () => {
    const { plan, p3 } = await setupPlanWithThreePayments();

    await updatePayment(db, plan.id, p3.id, {
      paymentDate: "2026-04-20",
      amount: 500,
      status: "pago",
    });

    const planRow = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, plan.id))
      .get();
    // billing dia 15, paid em 20/04 → próximo é 15/05
    expect(planRow?.nextPaymentDate).toBe("2026-05-15");
  });

  it("editar pagamento mais recente para data antiga: last volta para o que agora é o mais recente", async () => {
    const { plan, p3 } = await setupPlanWithThreePayments();

    // Mover p3 (15/04) para janeiro/2026 (antes de p1 e p2)
    await updatePayment(db, plan.id, p3.id, {
      paymentDate: "2026-01-15",
      amount: 500,
      status: "pago",
    });

    const planRow = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, plan.id))
      .get();
    // Mais recente agora é p2 (15/03)
    expect(planRow?.lastPaymentDate).toBe("2026-03-15");
    expect(planRow?.nextPaymentDate).toBe("2026-04-15");
  });

  it("erro: data anterior ao start_date do plano", async () => {
    const { plan, p2 } = await setupPlanWithThreePayments();

    await expect(
      updatePayment(db, plan.id, p2.id, {
        paymentDate: "2025-12-01", // antes de 2026-01-01 (start)
        amount: 500,
        status: "pago",
      })
    ).rejects.toThrow(/anterior/i);
  });

  it("erro: tentar editar pagamento com skipped=true", async () => {
    const { plan } = await setupPlanWithThreePayments();
    await skipPaymentMonth(db, plan.id, "2026-05");
    const skipped = await db
      .select()
      .from(schema.planPayments)
      .where(eq(schema.planPayments.planId, plan.id))
      .all();
    const skippedRow = skipped.find((p: { skipped: boolean }) => p.skipped);

    await expect(
      updatePayment(db, plan.id, skippedRow!.id, {
        paymentDate: "2026-05-15",
        amount: 500,
        status: "pago",
      })
    ).rejects.toThrow(/descongelar/i);
  });

  it("erro: paymentId inexistente", async () => {
    const { plan } = await setupPlanWithThreePayments();

    await expect(
      updatePayment(db, plan.id, 99999, {
        paymentDate: "2026-03-20",
        amount: 500,
        status: "pago",
      })
    ).rejects.toThrow(/não encontrado/i);
  });

  it("erro: novo paymentDate cai em mês que já tem outro pagamento não-skipped", async () => {
    const { plan, p2 } = await setupPlanWithThreePayments();

    // Tentar mover p2 (15/03) para 17/04, mas já existe pagamento em 15/04
    await expect(
      updatePayment(db, plan.id, p2.id, {
        paymentDate: "2026-04-17",
        amount: 500,
        status: "pago",
      })
    ).rejects.toThrow(/já existe pagamento neste mês/i);
  });

  it("permite mover pagamento para outra data dentro do mesmo mês (não conflita consigo mesmo)", async () => {
    const { plan, p2 } = await setupPlanWithThreePayments();

    // p2 está em 15/03; mover para 20/03 (mesmo mês, sem conflito com outro)
    await updatePayment(db, plan.id, p2.id, {
      paymentDate: "2026-03-20",
      amount: 500,
      status: "pago",
    });

    const updated = await db
      .select()
      .from(schema.planPayments)
      .where(eq(schema.planPayments.id, p2.id))
      .get();
    expect(updated?.paymentDate).toBe("2026-03-20");
  });
});

describe("deletePayment", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  async function setupPlanWithThreePayments() {
    const { plan } = await createPlan(db, {
      clientName: "Delete Test",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });
    const p1 = await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-15", amount: 500 });
    const p2 = await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-15", amount: 500 });
    const p3 = await recordPayment(db, { planId: plan.id, paymentDate: "2026-04-15", amount: 500 });
    return { plan, p1, p2, p3 };
  }

  it("remove o registro de plan_payments", async () => {
    const { plan, p2 } = await setupPlanWithThreePayments();

    await deletePayment(db, plan.id, p2.id);

    const remaining = await db
      .select()
      .from(schema.planPayments)
      .where(eq(schema.planPayments.planId, plan.id))
      .all();
    expect(remaining.length).toBe(2);
    expect(remaining.find((p: { id: number }) => p.id === p2.id)).toBeUndefined();
  });

  it("após delete, last_payment_date é recalculado para o pagamento restante mais recente", async () => {
    const { plan, p3 } = await setupPlanWithThreePayments();

    await deletePayment(db, plan.id, p3.id);

    const planRow = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, plan.id))
      .get();
    expect(planRow?.lastPaymentDate).toBe("2026-03-15"); // p2 agora é o mais recente
    expect(planRow?.nextPaymentDate).toBe("2026-04-15");
  });

  it("excluir único pagamento: last_payment_date vira null e next_payment_date deriva de start_date", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Single Pgto",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 15,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });
    const p1 = await recordPayment(db, { planId: plan.id, paymentDate: "2026-02-15", amount: 500 });

    await deletePayment(db, plan.id, p1.id);

    const planRow = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, plan.id))
      .get();
    expect(planRow?.lastPaymentDate).toBeNull();
    // next derivado de startDate (2026-01-01) com billing 15 → 15/02 (próximo dia 15 ≥ start)
    expect(planRow?.nextPaymentDate).toBe("2026-02-15");
  });

  it("excluir pagamento intermediário: last_payment_date permanece igual (mais recente não foi tocado)", async () => {
    const { plan, p2 } = await setupPlanWithThreePayments();

    await deletePayment(db, plan.id, p2.id);

    const planRow = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, plan.id))
      .get();
    expect(planRow?.lastPaymentDate).toBe("2026-04-15"); // p3 segue sendo o mais recente
  });

  it("erro: paymentId inexistente", async () => {
    const { plan } = await setupPlanWithThreePayments();

    await expect(deletePayment(db, plan.id, 99999)).rejects.toThrow(/não encontrado/i);
  });

  it("permite excluir pagamento skipped (descongelar)", async () => {
    const { plan } = await setupPlanWithThreePayments();
    await skipPaymentMonth(db, plan.id, "2026-05");
    const skipped = await db
      .select()
      .from(schema.planPayments)
      .where(eq(schema.planPayments.planId, plan.id))
      .all();
    const skippedRow = skipped.find((p: { skipped: boolean }) => p.skipped);

    await deletePayment(db, plan.id, skippedRow!.id);

    const after = await db
      .select()
      .from(schema.planPayments)
      .where(eq(schema.planPayments.id, skippedRow!.id))
      .get();
    expect(after).toBeUndefined();
  });
});

describe("skipPaymentMonth", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("cria registro skipped=true no mês correto com amount=0", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Congelar Test",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await skipPaymentMonth(db, plan.id, "2026-03");

    const payments = await getPaymentsByPlan(db, plan.id);
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(0);
    expect(payments[0].skipped).toBe(true);
    expect(payments[0].status).toBe("pago");
    expect(payments[0].paymentDate).toBe("2026-03-10");
    expect(payments[0].notes).toBe("Mês congelado");
  });

  it("não altera nextPaymentDate nem lastPaymentDate do plano", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Congelar Sem Alterar",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    const before = await getPlanById(db, plan.id);
    await skipPaymentMonth(db, plan.id, "2026-03");
    const after = await getPlanById(db, plan.id);

    expect(after!.nextPaymentDate).toBe(before!.nextPaymentDate);
    expect(after!.lastPaymentDate).toBe(before!.lastPaymentDate);
  });

  it("rejeita mês já registrado com pagamento real", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Já Pago",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await recordPayment(db, { planId: plan.id, paymentDate: "2026-03-08", amount: 500 });

    await expect(
      skipPaymentMonth(db, plan.id, "2026-03")
    ).rejects.toThrow("mês já registrado");
  });

  it("rejeita mês já registrado como pulado", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Já Pulado",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await skipPaymentMonth(db, plan.id, "2026-03");

    await expect(
      skipPaymentMonth(db, plan.id, "2026-03")
    ).rejects.toThrow("mês já registrado");
  });

  it("rejeita plano cancelado", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Cancelado Congelar",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await closePlan(db, plan.id, "2026-03-01");

    await expect(
      skipPaymentMonth(db, plan.id, "2026-03")
    ).rejects.toThrow("plano cancelado");
  });

  it("rejeita formato de mês inválido", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Formato Inválido",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 10,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await expect(skipPaymentMonth(db, plan.id, "03/2026")).rejects.toThrow(
      "formato de mês inválido"
    );
    await expect(skipPaymentMonth(db, plan.id, "2026-3")).rejects.toThrow(
      "formato de mês inválido"
    );
  });

  it("rejeita plano não encontrado", async () => {
    await expect(skipPaymentMonth(db, 9999, "2026-03")).rejects.toThrow(
      "plano não encontrado"
    );
  });

  it("ajusta dia para meses curtos (dia 30 em fevereiro → 28)", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Fev Congelado",
      planType: "Personalizado",
      planValue: 500,
      billingCycleDays: 30,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-01-01",
    });

    await skipPaymentMonth(db, plan.id, "2026-02");

    const payments = await getPaymentsByPlan(db, plan.id);
    expect(payments[0].paymentDate).toBe("2026-02-28");
  });
});
