import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import {
  calcularCustoPost,
  calcularPermanencia,
  calcularStatusPagamento,
} from "../utils/calculations";
import { getPaymentGaps } from "../services/plans";

// ─── Queries — leitura pura, usáveis em Server Components ──────────────────────

export async function getAllPlans() {
  const plans = await db
    .select({
      plan: schema.subscriptionPlans,
      clientName: schema.clients.name,
      clientContactOrigin: schema.clients.contactOrigin,
      clientNotes: schema.clients.notes,
    })
    .from(schema.subscriptionPlans)
    .innerJoin(
      schema.clients,
      eq(schema.subscriptionPlans.clientId, schema.clients.id)
    )
    .orderBy(desc(schema.subscriptionPlans.createdAt));

  const enriched = await Promise.all(
    plans.map(async ({ plan, clientName, clientContactOrigin, clientNotes }) => {
      const gaps = await getPaymentGaps(db as any, plan.id);
      return {
        ...plan,
        clientName,
        clientContactOrigin,
        clientNotes,
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
      };
    })
  );

  return enriched;
}

export async function getClientsList() {
  const clients = await db.select().from(schema.clients);
  return clients.map((c) => ({ id: c.id, name: c.name }));
}
