// Reconcilia subscription_plans.last_payment_date / next_payment_date com a fonte
// da verdade (MAX(plan_payments.payment_date) WHERE NOT skipped).
//
// Bug reportado: pagamentos inseridos diretamente em plan_payments (via Studio,
// scripts ad-hoc) não atualizam os campos do plano, gerando "Atrasado sem +N".
//
// Uso:
//   node scripts/reconcile-payment-dates.mjs            # dry-run
//   node scripts/reconcile-payment-dates.mjs --apply    # aplica updates

import "dotenv/config";
import { createClient } from "@libsql/client";
import { addMonths, format, getDaysInMonth, parseISO } from "date-fns";

const APPLY = process.argv.includes("--apply");

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:./database/dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Mesmo cálculo de calcularProximoVencimento em src/lib/utils/calculations.ts
function calcularProximoVencimento(fromDate, billingDay1, billingDay2) {
  const base = parseISO(fromDate);
  const fromDay = base.getDate();

  if (billingDay2) {
    const [earlier, later] =
      billingDay1 < billingDay2 ? [billingDay1, billingDay2] : [billingDay2, billingDay1];

    if (fromDay < later) {
      const maxDay = getDaysInMonth(base);
      const actualDay = Math.min(later, maxDay);
      return format(new Date(base.getFullYear(), base.getMonth(), actualDay), "yyyy-MM-dd");
    }

    const nextMonth = addMonths(base, 1);
    const maxDay = getDaysInMonth(nextMonth);
    const actualDay = Math.min(earlier, maxDay);
    return format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), actualDay), "yyyy-MM-dd");
  }

  const nextMonth = addMonths(base, 1);
  const maxDay = getDaysInMonth(nextMonth);
  const actualDay = Math.min(billingDay1, maxDay);
  return format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), actualDay), "yyyy-MM-dd");
}

console.log(`=== Reconciliação de last/next_payment_date — modo: ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

// Para cada plano: pegar MAX(payment_date) NOT skipped e comparar com last_payment_date
const candidates = await client.execute({
  sql: `SELECT c.name, sp.id, sp.status, sp.end_date,
               sp.billing_cycle_days, sp.billing_cycle_days_2,
               sp.last_payment_date, sp.next_payment_date,
               (SELECT MAX(payment_date)
                FROM plan_payments
                WHERE plan_id = sp.id AND skipped = 0) as actual_last
        FROM subscription_plans sp
        JOIN clients c ON c.id = sp.client_id
        ORDER BY c.name`,
  args: [],
});

const toUpdate = [];

for (const row of candidates.rows) {
  const actual = row.actual_last;
  if (!actual) continue;

  const stale =
    !row.last_payment_date || String(actual) > String(row.last_payment_date);
  if (!stale) continue;

  const newLast = String(actual);
  const newNext = row.billing_cycle_days
    ? calcularProximoVencimento(
        newLast,
        Number(row.billing_cycle_days),
        row.billing_cycle_days_2 ? Number(row.billing_cycle_days_2) : null
      )
    : null;

  toUpdate.push({
    cliente: row.name,
    plan_id: row.id,
    status: row.status,
    last_atual: row.last_payment_date,
    last_novo: newLast,
    next_atual: row.next_payment_date,
    next_novo: newNext,
  });
}

if (toUpdate.length === 0) {
  console.log("Nenhum plano com inconsistência. Nada a fazer.");
  await client.close();
  process.exit(0);
}

console.log(`${toUpdate.length} plano(s) com inconsistência:\n`);
console.table(toUpdate);

if (!APPLY) {
  console.log("\nDry-run. Para aplicar: node scripts/reconcile-payment-dates.mjs --apply");
  await client.close();
  process.exit(0);
}

let updated = 0;
for (const u of toUpdate) {
  // Para planos inativos/encerrados, atualiza só last_payment_date
  const isInactive = u.status !== "ativo";
  const sql = isInactive
    ? `UPDATE subscription_plans
       SET last_payment_date = ?, updated_at = datetime('now')
       WHERE id = ?`
    : `UPDATE subscription_plans
       SET last_payment_date = ?, next_payment_date = ?, updated_at = datetime('now')
       WHERE id = ?`;

  const args = isInactive
    ? [u.last_novo, u.plan_id]
    : [u.last_novo, u.next_novo, u.plan_id];

  const result = await client.execute({ sql, args });
  updated += Number(result.rowsAffected ?? 0);
}

console.log(`\nAplicado: ${updated} plano(s) atualizado(s).`);
await client.close();
