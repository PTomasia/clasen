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

// ─── Services que serão implementados ──────────────────────────────────────────
// Importações dinâmicas — os services AINDA NÃO EXISTEM (TDD: testes primeiro)
import {
  createPlan,
  closePlan,
  recordPayment,
  getActivePlans,
  getPlanById,
  getPaymentsByPlan,
  updateClient,
  deletePlan,
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
});

describe("closePlan", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
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

  it("calcula next_payment_date baseado no ciclo", async () => {
    const { plan } = await createPlan(db, {
      clientName: "Cycle Test",
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
    expect(updated!.nextPaymentDate).toBe("2026-05-05");
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
    const custos = plans.map((p) => p.custoPost).filter(Boolean) as number[];
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
    const updated = await getPlanById(db, plan.id);
    expect(updated!.lastPaymentDate).toBe("2026-04-10");
    expect(updated!.nextPaymentDate).toBe("2026-04-25"); // +15 dias
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
