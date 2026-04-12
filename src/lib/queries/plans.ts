import { eq, isNull, desc } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import {
  calcularCustoPost,
  calcularPermanencia,
  calcularStatusPagamento,
} from "../utils/calculations";

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

  return plans.map(({ plan, clientName, clientContactOrigin, clientNotes }) => ({
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
  }));
}

export async function getActivePlansQuery() {
  const all = await getAllPlans();
  return all
    .filter((p) => !p.endDate)
    .sort((a, b) => {
      if (a.custoPost === null && b.custoPost === null) return 0;
      if (a.custoPost === null) return 1;
      if (b.custoPost === null) return -1;
      return a.custoPost - b.custoPost;
    });
}

export async function getPlanWithPayments(planId: number) {
  const plan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.id, planId))
    .get();

  if (!plan) return null;

  const payments = await db
    .select()
    .from(schema.planPayments)
    .where(eq(schema.planPayments.planId, planId))
    .orderBy(desc(schema.planPayments.paymentDate));

  const client = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, plan.clientId))
    .get();

  return {
    ...plan,
    clientName: client?.name ?? "Desconhecido",
    custoPost: calcularCustoPost({
      valor: plan.planValue,
      carrossel: plan.postsCarrossel,
      reels: plan.postsReels,
      estatico: plan.postsEstatico,
      trafego: plan.postsTrafego,
    }),
    permanencia: calcularPermanencia(plan.startDate, plan.endDate),
    statusPagamento: calcularStatusPagamento(plan.nextPaymentDate),
    payments,
  };
}

export async function getClientsList() {
  const clients = await db.select().from(schema.clients);
  return clients.map((c) => ({ id: c.id, name: c.name }));
}
