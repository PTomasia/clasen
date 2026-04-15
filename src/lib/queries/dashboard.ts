import { and, isNotNull, gte, lte, eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { format, addDays } from "date-fns";

// Retorna planos ativos com vencimento nos próximos N dias (inclusive hoje).
export async function getUpcomingPayments(days: number = 7) {
  const today = format(new Date(), "yyyy-MM-dd");
  const limit = format(addDays(new Date(), days), "yyyy-MM-dd");

  const rows = await db
    .select({
      planId: schema.subscriptionPlans.id,
      clientName: schema.clients.name,
      planType: schema.subscriptionPlans.planType,
      planValue: schema.subscriptionPlans.planValue,
      nextPaymentDate: schema.subscriptionPlans.nextPaymentDate,
    })
    .from(schema.subscriptionPlans)
    .innerJoin(
      schema.clients,
      eq(schema.subscriptionPlans.clientId, schema.clients.id)
    )
    .where(
      and(
        eq(schema.subscriptionPlans.status, "ativo"),
        isNotNull(schema.subscriptionPlans.nextPaymentDate),
        gte(schema.subscriptionPlans.nextPaymentDate, today),
        lte(schema.subscriptionPlans.nextPaymentDate, limit)
      )
    );

  // Ordenar por data ascendente
  rows.sort((a, b) =>
    (a.nextPaymentDate ?? "").localeCompare(b.nextPaymentDate ?? "")
  );

  return rows;
}
