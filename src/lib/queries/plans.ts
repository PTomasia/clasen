import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import {
  calcularCustoPost,
  calcularPermanencia,
  calcularStatusPagamento,
} from "../utils/calculations";
import { calcularProximoReajuste, calcularSugestaoReajuste } from "../utils/adjustments";
import { getPaymentGaps } from "../services/plans";
import { getSetting, TARGET_COST_PER_POST_KEY } from "../services/settings";

// ─── Queries — leitura pura, usáveis em Server Components ──────────────────────

export async function getAllPlans() {
  const plans = await db
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
    .orderBy(desc(schema.subscriptionPlans.createdAt));

  // Buscar preço-alvo para cálculo de sugestão de reajuste
  const targetRaw = await getSetting(db as any, TARGET_COST_PER_POST_KEY);
  const targetCostPerPost = targetRaw ? Number(targetRaw) : null;

  const enriched = await Promise.all(
    plans.map(async ({ plan, clientName, clientContactOrigin, clientNotes, clientSince }) => {
      const gaps = await getPaymentGaps(db as any, plan.id);

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
        permanencia: calcularPermanencia(plan.startDate, plan.endDate),
        statusPagamento: calcularStatusPagamento(plan.nextPaymentDate),
        gapsCount: gaps.length,
        gapMonths: gaps,
        nextAdjustmentDate,
        adjustmentSuggestion,
      };
    })
  );

  return enriched;
}

export async function getClientsList() {
  const clients = await db.select().from(schema.clients);
  return clients.map((c) => ({ id: c.id, name: c.name }));
}
