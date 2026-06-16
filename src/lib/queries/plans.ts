import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import {
  calcularCustoPost,
  calcularPermanencia,
  calcularProximoVencimento,
  calcularStatusPagamento,
  calcularUnidadesOperacionais,
} from "../utils/calculations";
import { calcularProximoReajuste, calcularSugestaoReajuste } from "../utils/adjustments";
import {
  calculateGapsForPlan,
  findLastPaymentDate,
} from "../services/plans";
import { getSetting, TARGET_COST_PER_POST_KEY } from "../services/settings";

// ─── Queries — leitura pura, usáveis em Server Components ──────────────────────

export async function getAllPlans() {
  // Carrega tudo em batch (3 queries fixas, em paralelo). Antes do refactor:
  // por plano fazíamos 2 queries (getPaymentGaps + getActualLastPayment) → com
  // 29 planos virava ~58 roundtrips ao Turso (~10s do Brasil). Agora: 3.
  const [plans, allPayments, targetRaw, earliestTrackedRaw] = await Promise.all([
    db
      .select({
        plan: schema.subscriptionPlans,
        clientName: schema.clients.name,
        clientContactOrigin: schema.clients.contactOrigin,
        clientNotes: schema.clients.notes,
        clientSince: schema.clients.clientSince,
      })
      .from(schema.subscriptionPlans)
      .innerJoin(
        schema.clients,
        eq(schema.subscriptionPlans.clientId, schema.clients.id)
      )
      .orderBy(desc(schema.subscriptionPlans.createdAt)),
    db
      .select({
        planId: schema.planPayments.planId,
        paymentDate: schema.planPayments.paymentDate,
        skipped: schema.planPayments.skipped,
      })
      .from(schema.planPayments)
      .all(),
    getSetting(db, TARGET_COST_PER_POST_KEY),
    getSetting(db, "earliest_tracked_month"),
  ]);

  const targetCostPerPost = targetRaw ? Number(targetRaw) : null;
  const minDate = earliestTrackedRaw ? `${earliestTrackedRaw}-01` : undefined;

  // Agrupa pagamentos por planId — uma só vez, em memória.
  const paymentsByPlan = new Map<number, Array<{ paymentDate: string; skipped: boolean }>>();
  for (const p of allPayments) {
    const arr = paymentsByPlan.get(p.planId);
    const entry = { paymentDate: p.paymentDate, skipped: p.skipped };
    if (arr) arr.push(entry);
    else paymentsByPlan.set(p.planId, [entry]);
  }

  return plans.map(({ plan, clientName, clientContactOrigin, clientNotes, clientSince }) => {
    const planPayments = paymentsByPlan.get(plan.id) ?? [];
    const gaps = calculateGapsForPlan(plan, planPayments, undefined, minDate);

    // Fonte da verdade para datas de pagamento: plan_payments.
    // subscription_plans.last_payment_date pode estar dessincronizado se houve
    // inserção direta na tabela (via Drizzle Studio, scripts, etc.).
    const actualLastPayment = findLastPaymentDate(planPayments);
    const effectiveLastPayment = actualLastPayment ?? plan.lastPaymentDate;
    const effectiveNextPayment =
      effectiveLastPayment && plan.billingCycleDays
        ? calcularProximoVencimento(
            effectiveLastPayment,
            plan.billingCycleDays,
            plan.billingCycleDays2
          )
        : plan.nextPaymentDate;

    // Reajuste: só para planos ativos
    const nextAdjustmentDate =
      plan.status === "ativo"
        ? calcularProximoReajuste(plan.startDate, plan.lastAdjustmentDate)
        : null;

    const adjustmentSuggestion =
      plan.status === "ativo" && targetCostPerPost
        ? calcularSugestaoReajuste({
            planValue: plan.planValue,
            postsCarrossel: plan.postsCarrossel,
            postsReels: plan.postsReels,
            postsEstatico: plan.postsEstatico,
            targetCostPerPost,
          })
        : null;

    return {
      ...plan,
      lastPaymentDate: effectiveLastPayment,
      nextPaymentDate: effectiveNextPayment,
      clientName,
      clientContactOrigin,
      clientNotes,
      clientSince,
      custoPost: calcularCustoPost({
        valor: plan.planValue,
        carrossel: plan.postsCarrossel,
        reels: plan.postsReels,
        estatico: plan.postsEstatico,
        trafego: plan.postsTrafego,
      }),
      unidadesOperacionais: calcularUnidadesOperacionais(
        {
          carrossel: plan.postsCarrossel,
          reels: plan.postsReels,
          estatico: plan.postsEstatico,
          trafego: plan.postsTrafego,
        },
        { pesoCarrossel: plan.pesoCarrossel, pesoReels: plan.pesoReels }
      ),
      permanencia: calcularPermanencia(plan.startDate, plan.endDate),
      statusPagamento: calcularStatusPagamento(effectiveNextPayment, gaps.length),
      gapsCount: gaps.length,
      gapMonths: gaps,
      nextAdjustmentDate,
      adjustmentSuggestion,
    };
  });
}

export async function getClientsList() {
  const clients = await db.select().from(schema.clients);
  return clients.map((c) => ({ id: c.id, name: c.name }));
}
