import { eq, isNull, sql } from "drizzle-orm";
import { addMonths, format, parseISO, getDaysInMonth } from "date-fns";
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
  billingCycleDays2?: number;
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
    // Match case-insensitive + trim para evitar duplicatas
    const normalized = input.clientName.trim();
    if (!normalized) throw new Error("nome do cliente é obrigatório");

    const existing = await db
      .select()
      .from(schema.clients)
      .where(sql`lower(trim(${schema.clients.name})) = ${normalized.toLowerCase()}`)
      .get();

    if (existing) {
      client = existing;
      clientId = existing.id;
    } else {
      const inserted = await db
        .insert(schema.clients)
        .values({
          name: normalized,
          contactOrigin: input.contactOrigin ?? null,
        })
        .returning()
        .get();

      client = inserted;
      clientId = inserted.id;
    }
  } else {
    throw new Error("clientId ou clientName é obrigatório");
  }

  // Calcular próximo vencimento (primeiro pagamento sempre no próximo mês)
  let nextPaymentDate: string | null = null;
  if (input.billingCycleDays) {
    const startDate = parseISO(input.startDate);
    const nextMonth = addMonths(startDate, 1);
    const maxDay = getDaysInMonth(nextMonth);
    const actualDay = Math.min(input.billingCycleDays, maxDay);
    const dueDate = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      actualDay
    );
    nextPaymentDate = format(dueDate, "yyyy-MM-dd");
  }

  // Criar plano
  const plan = await db
    .insert(schema.subscriptionPlans)
    .values({
      clientId: clientId!,
      planType: input.planType,
      planValue: input.planValue,
      billingCycleDays: input.billingCycleDays ?? null,
      billingCycleDays2: input.billingCycleDays2 ?? null,
      postsCarrossel: input.postsCarrossel,
      postsReels: input.postsReels,
      postsEstatico: input.postsEstatico,
      postsTrafego: input.postsTrafego,
      startDate: input.startDate,
      movementType: input.movementType ?? null,
      nextPaymentDate,
      status: "ativo",
      notes: input.notes ?? null,
    })
    .returning()
    .get();

  return { plan, client };
}

// ─── closePlan ─────────────────────────────────────────────────────────────────

export interface ClosePlanOptions {
  prorataAmount?: number;
  notes?: string;
}

export async function closePlan(
  db: any,
  planId: number,
  endDate: string,
  options: ClosePlanOptions = {}
) {
  if (options.prorataAmount !== undefined && options.prorataAmount <= 0) {
    throw new Error("valor proporcional deve ser maior que zero");
  }

  const plan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .get();

  if (!plan) throw new Error("plano não encontrado");

  await db.update(schema.subscriptionPlans)
    .set({
      endDate,
      status: "cancelado",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.subscriptionPlans.id, planId))
    .run();

  if (options.prorataAmount !== undefined) {
    await db.insert(schema.planPayments).values({
      planId,
      clientId: plan.clientId,
      paymentDate: endDate,
      amount: options.prorataAmount,
      status: "pendente",
      notes: options.notes ?? "Cobrança proporcional ao cancelamento",
    }).run();
  }
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
  // billingCycleDays = dia de vencimento no mês (ex: 10 = vence dia 10)
  let nextPaymentDate: string | null = null;
  if (plan.billingCycleDays) {
    const paymentDate = parseISO(input.paymentDate);
    const payDay = paymentDate.getDate();
    const due1 = plan.billingCycleDays;
    const due2 = plan.billingCycleDays2;

    let nextDate: Date;

    if (due2) {
      // Dois vencimentos: encontrar o próximo após a data de pagamento
      const [earlier, later] = due1 < due2 ? [due1, due2] : [due2, due1];

      if (payDay < later) {
        // Próximo é o "later" do mesmo mês
        const maxDay = getDaysInMonth(paymentDate);
        const actualDay = Math.min(later, maxDay);
        nextDate = new Date(paymentDate.getFullYear(), paymentDate.getMonth(), actualDay);
      } else {
        // Próximo é o "earlier" do próximo mês
        const nextMonth = addMonths(paymentDate, 1);
        const maxDay = getDaysInMonth(nextMonth);
        const actualDay = Math.min(earlier, maxDay);
        nextDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), actualDay);
      }
    } else {
      // Um vencimento: dia X do próximo mês
      const nextMonth = addMonths(paymentDate, 1);
      const maxDay = getDaysInMonth(nextMonth);
      const actualDay = Math.min(due1, maxDay);
      nextDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), actualDay);
    }

    nextPaymentDate = format(nextDate, "yyyy-MM-dd");
  }

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
  clientSince?: string;
  birthday?: string;
  whatsapp?: string;
  // ICP / Demográficos
  city?: string;
  state?: string;
  niche?: string;
  yearsInPractice?: number;
  consultaTicket?: number;
  hasPhysicalOffice?: boolean;
  birthYear?: number;
  targetAudience?: string;
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
      clientSince: input.clientSince?.trim() || null,
      birthday: input.birthday?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      niche: input.niche?.trim() || null,
      yearsInPractice: input.yearsInPractice ?? null,
      consultaTicket: input.consultaTicket ?? null,
      hasPhysicalOffice: input.hasPhysicalOffice ?? null,
      birthYear: input.birthYear ?? null,
      targetAudience: input.targetAudience?.trim() || null,
      notes: input.notes?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.clients.id, input.clientId))
    .run();

  return { ...existing, name: input.name.trim() };
}

// ─── updatePlan ───────────────────────────────────────────────────────────────

export interface UpdatePlanInput {
  planId: number;
  planType: string;
  planValue: number;
  billingCycleDays?: number;
  billingCycleDays2?: number;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
  notes?: string;
}

export async function updatePlan(db: any, input: UpdatePlanInput) {
  if (!input.planValue || input.planValue <= 0) {
    throw new Error("valor deve ser maior que zero");
  }

  const existing = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, input.planId))
    .get();

  if (!existing) throw new Error("plano não encontrado");

  await db.update(schema.subscriptionPlans)
    .set({
      planType: input.planType,
      planValue: input.planValue,
      billingCycleDays: input.billingCycleDays ?? null,
      billingCycleDays2: input.billingCycleDays2 ?? null,
      postsCarrossel: input.postsCarrossel,
      postsReels: input.postsReels,
      postsEstatico: input.postsEstatico,
      postsTrafego: input.postsTrafego,
      notes: input.notes?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.subscriptionPlans.id, input.planId))
    .run();

  return { ...existing, ...input };
}

// ─── changePlan (Upgrade / Downgrade) ─────────────────────────────────────────

export interface ChangePlanInput {
  oldPlanId: number;
  endDate: string;
  newPlan: Omit<CreatePlanInput, "clientId" | "clientName" | "contactOrigin">;
}

export async function changePlan(db: any, input: ChangePlanInput) {
  // Buscar plano antigo
  const oldPlan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, input.oldPlanId))
    .get();

  if (!oldPlan) throw new Error("plano não encontrado");
  if (oldPlan.status === "cancelado") throw new Error("plano já está encerrado");

  // Encerrar plano antigo
  await closePlan(db, input.oldPlanId, input.endDate);

  // Criar novo plano para o mesmo cliente, herdando billingCycleDays se não informado
  const newPlanInput: CreatePlanInput = {
    clientId: oldPlan.clientId,
    ...input.newPlan,
    billingCycleDays: input.newPlan.billingCycleDays ?? oldPlan.billingCycleDays ?? undefined,
    billingCycleDays2: input.newPlan.billingCycleDays2 ?? oldPlan.billingCycleDays2 ?? undefined,
  };

  const result = await createPlan(db, newPlanInput);

  return { oldPlan, newPlan: result.plan, client: result.client };
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

  // Se esse era o último plano do cliente, excluir o cliente também
  const remaining = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.clientId, plan.clientId))
    .all();

  if (remaining.length === 0) {
    await db.delete(schema.clients)
      .where(eq(schema.clients.id, plan.clientId))
      .run();
  }

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

export async function getPaymentHistory(db: any, planId: number) {
  const plan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .get();

  if (!plan) throw new Error("plano não encontrado");

  const payments = await db
    .select()
    .from(schema.planPayments)
    .where(eq(schema.planPayments.planId, planId))
    .all();

  // Ordenar por data decrescente (mais recente primeiro)
  payments.sort((a: any, b: any) => b.paymentDate.localeCompare(a.paymentDate));

  const gaps = await getPaymentGaps(db, planId);

  return {
    planId: plan.id,
    planType: plan.planType,
    planValue: plan.planValue,
    billingCycleDays: plan.billingCycleDays,
    startDate: plan.startDate,
    nextPaymentDate: plan.nextPaymentDate as string | null,
    payments,
    gaps,
  };
}

// ─── getPaymentGaps ───────────────────────────────────────────────────────────
// Retorna as datas de vencimento (YYYY-MM-DD) esperadas que NÃO foram pagas,
// do startDate até o referenceDate (ou endDate, o que for menor).
// Um mês "espera pagamento" se o vencimento desse mês já passou em referenceDate.

export async function getPaymentGaps(
  db: any,
  planId: number,
  referenceDate: string = format(new Date(), "yyyy-MM-dd")
): Promise<string[]> {
  const plan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .get();

  if (!plan) throw new Error("plano não encontrado");
  if (!plan.billingCycleDays) return [];

  const payments = await db
    .select()
    .from(schema.planPayments)
    .where(eq(schema.planPayments.planId, planId))
    .all();

  const paidMonthKeys = new Set(
    payments.map((p: { paymentDate: string }) => p.paymentDate.slice(0, 7))
  );

  const start = parseISO(plan.startDate);
  const ref = parseISO(referenceDate);
  const effectiveEnd = plan.endDate && plan.endDate < referenceDate
    ? parseISO(plan.endDate)
    : ref;

  const gaps: string[] = [];
  // Primeiro vencimento: próximo mês após startDate
  let cursor = addMonths(start, 1);

  while (cursor <= effectiveEnd) {
    const maxDay = getDaysInMonth(cursor);
    const dueDay = Math.min(plan.billingCycleDays, maxDay);
    const dueDate = new Date(cursor.getFullYear(), cursor.getMonth(), dueDay);

    // Só considera gap se o vencimento já passou em relação ao referenceDate
    if (dueDate <= effectiveEnd) {
      const monthKey = format(cursor, "yyyy-MM");
      if (!paidMonthKeys.has(monthKey)) {
        gaps.push(format(dueDate, "yyyy-MM-dd"));
      }
    }
    cursor = addMonths(cursor, 1);
  }

  return gaps;
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
