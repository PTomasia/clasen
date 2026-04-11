import { eq, isNull, and } from "drizzle-orm";
import * as schema from "../db/schema";

// ─── getClientStatus ───────────────────────────────────────────────────────────
// Status é DERIVADO: ativo se tem ao menos 1 plano com end_date IS NULL

export async function getClientStatus(
  db: any,
  clientId: number
): Promise<"ativo" | "inativo"> {
  const activePlan = db
    .select()
    .from(schema.subscriptionPlans)
    .where(
      and(
        eq(schema.subscriptionPlans.clientId, clientId),
        isNull(schema.subscriptionPlans.endDate)
      )
    )
    .get();

  return activePlan ? "ativo" : "inativo";
}
