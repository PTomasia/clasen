import "dotenv/config";
import { createClient } from "@libsql/client";
import { addMonths, format, getDaysInMonth, parseISO } from "date-fns";

// Backfill idempotente: recalcula next_payment_date para planos com
// last_payment_date e billing_cycle_days definidos mas next_payment_date NULL.
//
// Uso:
//   node scripts/backfill-next-payment-date.mjs           # dry-run (default)
//   node scripts/backfill-next-payment-date.mjs --apply   # aplica no Turso

const APPLY = process.argv.includes("--apply");

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

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log(`=== Backfill next_payment_date — modo: ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

const candidatos = await client.execute({
  sql: `SELECT sp.id, c.name, sp.last_payment_date, sp.billing_cycle_days, sp.billing_cycle_days_2
        FROM subscription_plans sp
        JOIN clients c ON c.id = sp.client_id
        WHERE sp.next_payment_date IS NULL
          AND sp.last_payment_date IS NOT NULL
          AND sp.billing_cycle_days IS NOT NULL
        ORDER BY c.name`,
  args: [],
});

if (candidatos.rows.length === 0) {
  console.log("Nenhum plano elegível. Nada a fazer.");
  await client.close();
  process.exit(0);
}

const plano = candidatos.rows.map((row) => {
  const nextPaymentDate = calcularProximoVencimento(
    row.last_payment_date,
    Number(row.billing_cycle_days),
    row.billing_cycle_days_2 != null ? Number(row.billing_cycle_days_2) : null
  );
  return {
    plan_id: row.id,
    cliente: row.name,
    last_payment_date: row.last_payment_date,
    billing: row.billing_cycle_days_2
      ? `${row.billing_cycle_days}/${row.billing_cycle_days_2}`
      : `${row.billing_cycle_days}`,
    next_payment_date_novo: nextPaymentDate,
  };
});

console.log(`${plano.length} planos a atualizar:\n`);
console.table(plano);

if (!APPLY) {
  console.log("\nDry-run. Para aplicar: node scripts/backfill-next-payment-date.mjs --apply");
  await client.close();
  process.exit(0);
}

console.log("\nAplicando...");
let updated = 0;
for (const p of plano) {
  await client.execute({
    sql: `UPDATE subscription_plans SET next_payment_date = ? WHERE id = ? AND next_payment_date IS NULL`,
    args: [p.next_payment_date_novo, p.plan_id],
  });
  updated += 1;
}
console.log(`\n${updated} planos atualizados.`);

console.log("\nVerificação pós-backfill:");
const verifica = await client.execute({
  sql: `SELECT sp.id, c.name, sp.last_payment_date, sp.next_payment_date, sp.billing_cycle_days
        FROM subscription_plans sp
        JOIN clients c ON c.id = sp.client_id
        WHERE sp.id IN (${plano.map((p) => p.plan_id).join(",")})`,
  args: [],
});
console.table(verifica.rows);

await client.close();
