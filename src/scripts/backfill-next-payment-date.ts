import { and, eq, isNotNull, isNull } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { calcularProximoVencimento } from "../lib/utils/calculations";

/**
 * Corrige planos onde last_payment_date foi gravado mas next_payment_date
 * ficou NULL (bug anterior em recordPayment/updatePlan). Idempotente.
 * Retorna o número de planos atualizados.
 */
export async function runBackfill(db: any): Promise<number> {
  const orphans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(
      and(
        isNull(schema.subscriptionPlans.nextPaymentDate),
        isNotNull(schema.subscriptionPlans.lastPaymentDate),
        isNotNull(schema.subscriptionPlans.billingCycleDays)
      )
    );

  let updated = 0;
  for (const plan of orphans) {
    const nextPaymentDate = calcularProximoVencimento(
      plan.lastPaymentDate!,
      plan.billingCycleDays!,
      plan.billingCycleDays2 ?? undefined
    );

    await db
      .update(schema.subscriptionPlans)
      .set({ nextPaymentDate, updatedAt: new Date().toISOString() })
      .where(eq(schema.subscriptionPlans.id, plan.id))
      .run();

    updated++;
  }

  return updated;
}

// ─── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const { db } = await import("../lib/db/index");

  console.log("Iniciando backfill de next_payment_date...");
  const count = await runBackfill(db as any);
  console.log(`Backfill concluído: ${count} plano(s) corrigido(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Erro no backfill:", err);
  process.exit(1);
});
