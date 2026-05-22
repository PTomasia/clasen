import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { calcularProximoVencimento } from "../lib/utils/calculations";

/**
 * Backfill que corrige planos onde nextPaymentDate ficou preso em um mês
 * congelado (skipped). Para cada plano, avança nextPaymentDate através dos
 * meses skipped consecutivos a partir do mês de nextPaymentDate.
 *
 * Idempotente. Suporta dry-run via { apply: false }.
 */
export interface BackfillChange {
  planId: number;
  clientName: string;
  before: string;
  after: string;
  skippedMonths: string[];
}

export interface BackfillReport {
  changes: BackfillChange[];
}

export async function runBackfillSkipNextPayment(
  db: any,
  options: { apply: boolean }
): Promise<BackfillReport> {
  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .all();

  const payments = await db
    .select()
    .from(schema.planPayments)
    .all();

  const skippedByPlan = new Map<number, Set<string>>();
  for (const p of payments) {
    if (!p.skipped) continue;
    const set = skippedByPlan.get(p.planId) ?? new Set<string>();
    set.add(p.paymentDate.slice(0, 7));
    skippedByPlan.set(p.planId, set);
  }

  const clients = await db.select().from(schema.clients).all();
  const clientById = new Map<number, string>(
    clients.map((c: { id: number; name: string }) => [c.id, c.name])
  );

  const changes: BackfillChange[] = [];

  for (const plan of plans) {
    if (!plan.billingCycleDays || !plan.nextPaymentDate) continue;

    const skipped = skippedByPlan.get(plan.id);
    if (!skipped || skipped.size === 0) continue;

    let next: string = plan.nextPaymentDate;
    while (skipped.has(next.slice(0, 7))) {
      next = calcularProximoVencimento(
        next,
        plan.billingCycleDays,
        plan.billingCycleDays2
      );
    }

    if (next === plan.nextPaymentDate) continue;

    changes.push({
      planId: plan.id,
      clientName: clientById.get(plan.clientId) ?? "(desconhecido)",
      before: plan.nextPaymentDate,
      after: next,
      skippedMonths: [...skipped].sort(),
    });

    if (options.apply) {
      await db
        .update(schema.subscriptionPlans)
        .set({ nextPaymentDate: next, updatedAt: new Date().toISOString() })
        .where(eq(schema.subscriptionPlans.id, plan.id))
        .run();
    }
  }

  return { changes };
}

// ─── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");
  const { db } = await import("../lib/db/index");

  console.log(
    `=== Backfill skip → next_payment_date — modo: ${apply ? "APPLY" : "DRY-RUN"} ===\n`
  );

  const report = await runBackfillSkipNextPayment(db as any, { apply });

  if (report.changes.length === 0) {
    console.log("Nenhum plano elegível. Nada a fazer.");
    process.exit(0);
  }

  console.log(`${report.changes.length} plano(s) a atualizar:\n`);
  console.table(
    report.changes.map((c) => ({
      planId: c.planId,
      cliente: c.clientName,
      antes: c.before,
      depois: c.after,
      meses_congelados: c.skippedMonths.join(", "),
    }))
  );

  if (!apply) {
    console.log(
      "\nDry-run. Para aplicar: tsx src/scripts/backfill-skip-next-payment.ts --apply"
    );
  } else {
    console.log(`\n${report.changes.length} plano(s) atualizados.`);
  }

  process.exit(0);
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") ?? "");

if (isDirectRun) {
  main().catch((err) => {
    console.error("Erro no backfill:", err);
    process.exit(1);
  });
}
