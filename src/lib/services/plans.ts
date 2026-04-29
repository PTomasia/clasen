import { eq, isNull, sql } from "drizzle-orm";
import { addMonths, format, parseISO, getDaysInMonth } from "date-fns";
import * as schema from "../db/schema";
import { assertBillingDays, calcularCustoPost, calcularPermanencia, calcularProximoVencimento } from "../utils/calculations";
import { findOrCreateClient } from "./clients";

// ─── Types ─────────────────────────────────────────────────────────────────────

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

  assertBillingDays(input.billingCycleDays, input.billingCycleDays2);

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
    client = await findOrCreateClient(db, input.clientName, input.contactOrigin);
    clientId = client.id;
  } else {
    throw new Error("clientId ou clientName é obrigatório");
  }

  // Com 2 vencimentos, pode cair ainda no mesmo mês do startDate.
  const nextPaymentDate: string | null = input.billingCycleDays
    ? calcularProximoVencimento(
        input.startDate,
        input.billingCycleDays,
        input.billingCycleDays2
      )
    : null;

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
  const nextPaymentDate = plan.billingCycleDays
    ? calcularProximoVencimento(
        input.paymentDate,
        plan.billingCycleDays,
        plan.billingCycleDays2
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
  clientSince?: string;
  birthday?: string;
  whatsapp?: string;
  email?: string;
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
      email: input.email?.trim() || null,
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
  startDate?: string;
  notes?: string;
}

export async function updatePlan(db: any, input: UpdatePlanInput) {
  if (!input.planValue || input.planValue <= 0) {
    throw new Error("valor deve ser maior que zero");
  }

  if (input.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new Error("data de início inválida (YYYY-MM-DD)");
  }

  assertBillingDays(input.billingCycleDays, input.billingCycleDays2);

  const existing = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, input.planId))
    .get();

  if (!existing) throw new Error("plano não encontrado");

  const newBillingDay1 = input.billingCycleDays ?? null;
  const newBillingDay2 = input.billingCycleDays2 ?? null;

  // Recalcular nextPaymentDate quando o ciclo de cobrança muda E há base
  // temporal (lastPaymentDate). Sem base, preserva o valor anterior.
  const billingChanged =
    newBillingDay1 !== existing.billingCycleDays ||
    newBillingDay2 !== existing.billingCycleDays2;
  const recalculatedNext =
    billingChanged && newBillingDay1 && existing.lastPaymentDate
      ? calcularProximoVencimento(
          existing.lastPaymentDate,
          newBillingDay1,
          newBillingDay2
        )
      : undefined;

  await db.update(schema.subscriptionPlans)
    .set({
      planType: input.planType,
      planValue: input.planValue,
      billingCycleDays: newBillingDay1,
      billingCycleDays2: newBillingDay2,
      postsCarrossel: input.postsCarrossel,
      postsReels: input.postsReels,
      postsEstatico: input.postsEstatico,
      postsTrafego: input.postsTrafego,
      ...(input.startDate ? { startDate: input.startDate } : {}),
      ...(recalculatedNext !== undefined ? { nextPaymentDate: recalculatedNext } : {}),
      notes: input.notes?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.subscriptionPlans.id, input.planId))
    .run();

  return { ...existing, ...input };
}

// ─── updateBillingDays (inline edit on /planos table) ────────────────────────

export async function updateBillingDays(
  db: any,
  planId: number,
  billingCycleDays: number,
  billingCycleDays2: number | null = null
): Promise<void> {
  assertBillingDays(billingCycleDays, billingCycleDays2);

  const existing = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .get();

  if (!existing) throw new Error("plano não encontrado");

  const billingChanged =
    billingCycleDays !== existing.billingCycleDays ||
    billingCycleDays2 !== existing.billingCycleDays2;

  const recalculatedNext =
    billingChanged && existing.lastPaymentDate
      ? calcularProximoVencimento(existing.lastPaymentDate, billingCycleDays, billingCycleDays2)
      : undefined;

  await db
    .update(schema.subscriptionPlans)
    .set({
      billingCycleDays,
      billingCycleDays2,
      ...(recalculatedNext !== undefined ? { nextPaymentDate: recalculatedNext } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.subscriptionPlans.id, planId))
    .run();
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

// ─── skipBillingCycle ─────────────────────────────────────────────────────────
// Avança nextPaymentDate em 1 ciclo sem registrar pagamento.
// Uso: cliente "congelado" que pediu para pular a cobrança do mês.

export async function skipBillingCycle(db: any, planId: number) {
  const plan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .get();

  if (!plan) throw new Error("plano não encontrado");
  if (plan.status !== "ativo") throw new Error("plano não está ativo");
  if (!plan.billingCycleDays) throw new Error("plano não tem ciclo de cobrança definido");
  if (!plan.nextPaymentDate) throw new Error("próximo vencimento não definido");

  const newNextPaymentDate = calcularProximoVencimento(
    plan.nextPaymentDate,
    plan.billingCycleDays,
    plan.billingCycleDays2
  );

  const today = format(new Date(), "yyyy-MM-dd");
  const logEntry = `Cobrança pulada em ${today}`;
  const newNotes = plan.notes ? `${plan.notes}\n${logEntry}` : logEntry;

  await db.update(schema.subscriptionPlans)
    .set({
      nextPaymentDate: newNextPaymentDate,
      notes: newNotes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.subscriptionPlans.id, planId))
    .run();

  return { ...plan, nextPaymentDate: newNextPaymentDate, notes: newNotes };
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

// ─── updatePayment ────────────────────────────────────────────────────────────
// Atualiza um registro de plan_payments (data, valor, status, notes).
// Após atualizar, recalcula last_payment_date e next_payment_date do plano
// usando getActualLastPayment como fonte da verdade.

export interface UpdatePaymentInput {
  paymentDate: string;
  amount: number;
  status?: string;
  notes?: string | null;
}

export async function updatePayment(
  db: any,
  planId: number,
  paymentId: number,
  input: UpdatePaymentInput
) {
  const plan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .get();
  if (!plan) throw new Error("plano não encontrado");

  const payment = await db
    .select()
    .from(schema.planPayments)
    .where(eq(schema.planPayments.id, paymentId))
    .get();
  if (!payment || payment.planId !== planId) {
    throw new Error("pagamento não encontrado");
  }

  if (payment.skipped) {
    throw new Error(
      "não é possível editar mês congelado — use 'descongelar' para reverter"
    );
  }

  if (input.paymentDate < plan.startDate) {
    throw new Error("data não pode ser anterior ao início do plano");
  }

  // Validar conflito de mês: outro pagamento não-skipped no mesmo YYYY-MM
  const newMonthKey = input.paymentDate.slice(0, 7);
  const sameMonthPayments = await db
    .select()
    .from(schema.planPayments)
    .where(eq(schema.planPayments.planId, planId))
    .all();

  const conflict = sameMonthPayments.find(
    (p: { id: number; skipped: boolean; paymentDate: string }) =>
      p.id !== paymentId && !p.skipped && p.paymentDate.slice(0, 7) === newMonthKey
  );
  if (conflict) {
    throw new Error("já existe pagamento neste mês");
  }

  await db
    .update(schema.planPayments)
    .set({
      paymentDate: input.paymentDate,
      amount: input.amount,
      status: input.status ?? "pago",
      notes: input.notes ?? null,
    })
    .where(eq(schema.planPayments.id, paymentId))
    .run();

  // Recalcular last/next a partir do novo estado real
  const newLast = await getActualLastPayment(db, planId);
  const newNext =
    newLast && plan.billingCycleDays
      ? calcularProximoVencimento(
          newLast,
          plan.billingCycleDays,
          plan.billingCycleDays2
        )
      : plan.nextPaymentDate;

  await db
    .update(schema.subscriptionPlans)
    .set({
      lastPaymentDate: newLast,
      nextPaymentDate: newNext,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.subscriptionPlans.id, planId))
    .run();
}

// ─── deletePayment ────────────────────────────────────────────────────────────
// Remove um registro de plan_payments e recalcula last/next do plano.
// Se era o único pagamento, last vira null e next deriva de startDate.

export async function deletePayment(db: any, planId: number, paymentId: number) {
  const plan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .get();
  if (!plan) throw new Error("plano não encontrado");

  const payment = await db
    .select()
    .from(schema.planPayments)
    .where(eq(schema.planPayments.id, paymentId))
    .get();
  if (!payment || payment.planId !== planId) {
    throw new Error("pagamento não encontrado");
  }

  await db
    .delete(schema.planPayments)
    .where(eq(schema.planPayments.id, paymentId))
    .run();

  // Recalcular last/next
  const newLast = await getActualLastPayment(db, planId);

  let newNext: string | null;
  if (newLast && plan.billingCycleDays) {
    newNext = calcularProximoVencimento(
      newLast,
      plan.billingCycleDays,
      plan.billingCycleDays2
    );
  } else if (!newLast && plan.billingCycleDays) {
    // Sem pagamentos: derivar de startDate como faz o createPlan
    newNext = calcularProximoVencimento(
      plan.startDate,
      plan.billingCycleDays,
      plan.billingCycleDays2
    );
  } else {
    newNext = plan.nextPaymentDate;
  }

  await db
    .update(schema.subscriptionPlans)
    .set({
      lastPaymentDate: newLast,
      nextPaymentDate: newNext,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.subscriptionPlans.id, planId))
    .run();
}

// ─── getActualLastPayment ────────────────────────────────────────────────────
// Retorna a data do pagamento real mais recente em plan_payments, ignorando
// registros skipped=true. É a fonte da verdade — subscription_plans.last_payment_date
// pode estar dessincronizado se pagamentos forem inseridos sem passar por recordPayment.

export async function getActualLastPayment(
  db: any,
  planId: number
): Promise<string | null> {
  const payments = await db
    .select({
      paymentDate: schema.planPayments.paymentDate,
      skipped: schema.planPayments.skipped,
    })
    .from(schema.planPayments)
    .where(eq(schema.planPayments.planId, planId))
    .all();

  const realPayments = payments.filter((p: { skipped: boolean }) => !p.skipped);
  if (realPayments.length === 0) return null;

  realPayments.sort((a: { paymentDate: string }, b: { paymentDate: string }) =>
    a.paymentDate < b.paymentDate ? 1 : -1
  );
  return realPayments[0].paymentDate;
}

// ─── getPaymentGaps ───────────────────────────────────────────────────────────
// Retorna as datas de vencimento (YYYY-MM-DD) esperadas que NÃO foram pagas,
// do startDate até o referenceDate (ou endDate, o que for menor).
// Com 2 vencimentos por mês, gera 2 due dates por mês.
// Registros com skipped=true fecham TODOS os gaps do mês.

export async function getPaymentGaps(
  db: any,
  planId: number,
  referenceDate: string = format(new Date(), "yyyy-MM-dd"),
  minDate?: string
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

  const start = parseISO(plan.startDate);
  const effectiveEnd = plan.endDate && plan.endDate < referenceDate
    ? parseISO(plan.endDate)
    : parseISO(referenceDate);

  const gaps: string[] = [];
  let cursor = addMonths(start, 1);

  // Aplicar cutoff histórico: se minDate for fornecido, começar do mês máximo entre o plano e minDate
  if (minDate) {
    const minDateParsed = parseISO(minDate);
    const minDateCursor = addMonths(minDateParsed, 0); // mesmo mês que minDate
    if (minDateCursor > cursor) {
      cursor = minDateCursor;
    }
  }

  if (plan.billingCycleDays2) {
    const [earlier, later] =
      plan.billingCycleDays < plan.billingCycleDays2
        ? [plan.billingCycleDays, plan.billingCycleDays2]
        : [plan.billingCycleDays2, plan.billingCycleDays];

    // Meses congelados fecham todos os gaps do mês
    const skippedMonths = new Set<string>(
      payments
        .filter((p: { skipped: boolean }) => p.skipped)
        .map((p: { paymentDate: string }) => p.paymentDate.slice(0, 7))
    );

    // Pagamentos reais: determinar qual due date cobrem (dueDate1 = earlier, dueDate2 = later)
    // Pagamento com day < actualLater do mês → cobre dueDate1; caso contrário → cobre dueDate2
    const coveredDueDates = new Set<string>();
    for (const p of payments) {
      if (p.skipped) continue;
      const [y, m, dayStr] = p.paymentDate.split("-");
      const payDay = Number(dayStr);
      const monthLastDay = getDaysInMonth(new Date(Number(y), Number(m) - 1));
      const actualLater = Math.min(later, monthLastDay);
      const monthKey = p.paymentDate.slice(0, 7);
      if (payDay < actualLater) {
        const actualEarlier = Math.min(earlier, monthLastDay);
        coveredDueDates.add(`${monthKey}-${String(actualEarlier).padStart(2, "0")}`);
      } else {
        coveredDueDates.add(`${monthKey}-${String(actualLater).padStart(2, "0")}`);
      }
    }

    while (cursor <= effectiveEnd) {
      const monthKey = format(cursor, "yyyy-MM");

      if (!skippedMonths.has(monthKey)) {
        const maxDay = getDaysInMonth(cursor);
        const dueDay1 = Math.min(earlier, maxDay);
        const dueDay2 = Math.min(later, maxDay);
        const dueDate1 = new Date(cursor.getFullYear(), cursor.getMonth(), dueDay1);
        const dueDate2 = new Date(cursor.getFullYear(), cursor.getMonth(), dueDay2);

        if (dueDate1 <= effectiveEnd) {
          const key1 = format(dueDate1, "yyyy-MM-dd");
          if (!coveredDueDates.has(key1)) gaps.push(key1);
        }
        if (dueDate2 <= effectiveEnd) {
          const key2 = format(dueDate2, "yyyy-MM-dd");
          if (!coveredDueDates.has(key2)) gaps.push(key2);
        }
      }

      cursor = addMonths(cursor, 1);
    }
  } else {
    // 1 vencimento por mês
    const skippedMonths = new Set<string>(
      payments
        .filter((p: { skipped: boolean }) => p.skipped)
        .map((p: { paymentDate: string }) => p.paymentDate.slice(0, 7))
    );
    const paidMonthKeys = new Set<string>(
      payments
        .filter((p: { skipped: boolean }) => !p.skipped)
        .map((p: { paymentDate: string }) => p.paymentDate.slice(0, 7))
    );

    while (cursor <= effectiveEnd) {
      const maxDay = getDaysInMonth(cursor);
      const dueDay = Math.min(plan.billingCycleDays, maxDay);
      const dueDate = new Date(cursor.getFullYear(), cursor.getMonth(), dueDay);

      if (dueDate <= effectiveEnd) {
        const monthKey = format(cursor, "yyyy-MM");
        if (!paidMonthKeys.has(monthKey) && !skippedMonths.has(monthKey)) {
          gaps.push(format(dueDate, "yyyy-MM-dd"));
        }
      }
      cursor = addMonths(cursor, 1);
    }
  }

  return gaps;
}

// ─── skipPaymentMonth ─────────────────────────────────────────────────────────
// Registra mês congelado: insere plan_payment com amount=0, skipped=true.
// Não altera lastPaymentDate nem nextPaymentDate do plano.

export async function skipPaymentMonth(
  db: any,
  planId: number,
  month: string
): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("formato de mês inválido (esperado YYYY-MM)");
  }

  const plan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .get();

  if (!plan) throw new Error("plano não encontrado");
  if (plan.status === "cancelado") throw new Error("plano cancelado");

  // Verificar se já existe qualquer registro para esse mês
  const existing = await db
    .select()
    .from(schema.planPayments)
    .where(eq(schema.planPayments.planId, planId))
    .all();

  const hasRecord = existing.some(
    (p: { paymentDate: string }) => p.paymentDate.slice(0, 7) === month
  );
  if (hasRecord) throw new Error("mês já registrado");

  // Calcular dueDate: dia de vencimento do plano naquele mês
  const [y, m] = month.split("-").map(Number);
  const monthDate = new Date(y, m - 1);
  const maxDay = getDaysInMonth(monthDate);
  const billingDay = plan.billingCycleDays ?? 1;
  const actualDay = Math.min(billingDay, maxDay);
  const paymentDate = `${month}-${String(actualDay).padStart(2, "0")}`;

  await db.insert(schema.planPayments).values({
    planId,
    clientId: plan.clientId,
    paymentDate,
    amount: 0,
    status: "pago",
    skipped: true,
    notes: "Mês congelado",
  }).run();
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
