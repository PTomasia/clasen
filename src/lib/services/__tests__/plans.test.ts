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
  updatePlan,
  deletePlan,
  changePlan,
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

  it("cliente sobrevive quando seu plano é deletado", async () => {
    const { plan, client } = await createPlan(db, {
      clientName: "Cliente Sobrevive",
      planType: "Personalizado",
      planValue: 500,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      postsTrafego: 0,
      startDate: "2026-04-01",
    });

    await deletePlan(db, plan.id);

    // Cliente ainda existe
    const clientSaved = db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, client.id))
      .get();

    expect(clientSaved).toBeDefined();
    expect(clientSaved!.name).toBe("Cliente Sobrevive");
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
