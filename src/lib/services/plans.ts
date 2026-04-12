import { eq, isNull } from "drizzle-orm";
import { addDays, format, parseISO } from "date-fns";
import * as schema from "../db/schema";
import { calcularCustoPost, calcularPermanencia } from "../utils/calculations";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Db = Parameters<typeof eq> extends never ? never : any; // accepts any drizzle db instance

export interface CreatePlanInput {
  clientId?: number;
  clientName?: string;
  contactOrigin?: string;
  planType: string;
  planValue: number;
  billingCycleDays?: number;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
  startDate: string;
  movementType?: string;
  notes?: string;
}

export interface RecordPaymentInput {
  planId: number;
  paymentDate: string;
  amount: number;
  status?: string;
  notes?: string;
}

// ─── createPlan ────────────────────────────────────────────────────────────────

export async function createPlan(db: any, input: CreatePlanInput) {
  // Validações
  if (!input.planValue || input.planValue <= 0) {
    throw new Error("valor deve ser maior que zero");
  }

  const isTrafegoOnly = input.planType === "Tráfego";
  const hasContentPosts =
    input.postsCarrossel > 0 ||
    input.postsReels > 0 ||
    input.postsEstatico > 0;

  if (!isTrafegoOnly && !hasContentPosts) {
    throw new Error(
      "plano deve ter ao menos um post ou ser do tipo Tráfego"
    );
  }

  // Criar ou reutilizar cliente
  let clientId = input.clientId;
  let client: typeof schema.clients.$inferSelect;

  if (clientId) {
    const existing = await db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.id, clientId))
      .get();

    if (!existing) throw new Error("cliente não encontrado");
    client = existing;
  } else if (input.clientName) {
    const inserted = await db
      .insert(schema.clients)
      .values({
        name: input.clientName,
        contactOrigin: input.contactOrigin ?? null,
      })
      .returning()
      .get();

    client = inserted;
    clientId = inserted.id;
  } else {
    throw new Error("clientId ou clientName é obrigatório");
  }

  // Criar plano
  const plan = await db
    .insert(schema.subscriptionPlans)
    .values({
      clientId: clientId!,
      planType: input.planType,
      planValue: input.planValue,
      billingCycleDays: input.billingCycleDays ?? null,
      postsCarrossel: input.postsCarrossel,
      postsReels: input.postsReels,
      postsEstatico: input.postsEstatico,
      postsTrafego: input.postsTrafego,
      startDate: input.startDate,
      movementType: input.movementType ?? null,
      status: "ativo",
      notes: input.notes ?? null,
    })
    .returning()
    .get();

  return { plan, client };
}

// ─── closePlan ─────────────────────────────────────────────────────────────────

export async function closePlan(db: any, planId: number, endDate: string) {
  await db.update(schema.subscriptionPlans)
    .set({
      endDate,
      status: "cancelado",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.subscriptionPlans.id, planId))
    .run();
}

// ─── recordPayment ─────────────────────────────────────────────────────────────

export async function recordPayment(db: any, input: RecordPaymentInput) {
  // Buscar plano para obter clientId e ciclo
  const plan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, input.planId))
    .get();

  if (!plan) throw new Error("plano não encontrado");

  // Criar pagamento
  const payment = await db
    .insert(schema.planPayments)
    .values({
      planId: input.planId,
      clientId: plan.clientId,
      paymentDate: input.paymentDate,
      amount: input.amount,
      status: input.status ?? "pago",
      notes: input.notes ?? null,
    })
    .returning()
    .get();

  // Atualizar last_payment_date e next_payment_date no plano
  const nextPaymentDate = plan.billingCycleDays
    ? format(
        addDays(parseISO(input.paymentDate), plan.billingCycleDays),
        "yyyy-MM-dd"
      )
    : null;

  await db.update(schema.subscriptionPlans)
    .set({
      lastPaymentDate: input.paymentDate,
      nextPaymentDate,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.subscriptionPlans.id, input.planId))
    .run();

  return payment;
}

// ─── updateClient ─────────────────────────────────────────────────────────────

export interface UpdateClientInput {
  clientId: number;
  name: string;
  contactOrigin?: string;
  notes?: string;
}

export async function updateClient(db: any, input: UpdateClientInput) {
  if (!input.name.trim()) {
    throw new Error("nome do cliente é obrigatório");
  }

  const existing = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, input.clientId))
    .get();

  if (!existing) throw new Error("cliente não encontrado");

  await db.update(schema.clients)
    .set({
      name: input.name.trim(),
      contactOrigin: input.contactOrigin?.trim() || null,
      notes: input.notes?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.clients.id, input.clientId))
    .run();

  return { ...existing, name: input.name.trim() };
}

// ─── deletePlan ───────────────────────────────────────────────────────────────

export async function deletePlan(db: any, planId: number) {
  const plan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .get();

  if (!plan) throw new Error("plano não encontrado");

  // Remove pagamentos vinculados primeiro
  await db.delete(schema.planPayments)
    .where(eq(schema.planPayments.planId, planId))
    .run();

  await db.delete(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .run();

  return plan;
}

// ─── Queries ───────────────────────────────────────────────────────────────────

export async function getPlanById(db: any, planId: number) {
  return await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .get() ?? null;
}

export async function getPaymentsByPlan(db: any, planId: number) {
  return await db
    .select()
    .from(schema.planPayments)
    .where(eq(schema.planPayments.planId, planId))
    .all();
}

export async function getActivePlans(db: any) {
  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(isNull(schema.subscriptionPlans.endDate))
    .all();

  // Enriquecer com campos calculados
  return plans
    .map((plan: typeof schema.subscriptionPlans.$inferSelect) => {
      const custoPost = calcularCustoPost({
        valor: plan.planValue,
        carrossel: plan.postsCarrossel,
        reels: plan.postsReels,
        estatico: plan.postsEstatico,
        trafego: plan.postsTrafego,
      });

      const permanencia = calcularPermanencia(plan.startDate, plan.endDate);

      return {
        ...plan,
        custoPost,
        permanencia,
      };
    })
    .sort((a: any, b: any) => {
      // Ordenar por custoPost crescente (null no final)
      if (a.custoPost === null && b.custoPost === null) return 0;
      if (a.custoPost === null) return 1;
      if (b.custoPost === null) return -1;
      return a.custoPost - b.custoPost;
    });
}
