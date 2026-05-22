import "dotenv/config";
import { createClient } from "@libsql/client";
import { addMonths, format, getDaysInMonth, parseISO } from "date-fns";

// Backfill: para cada plano com pagamentos congelados (skipped=1) cujo
// next_payment_date ainda esteja num mês congelado, avança next_payment_date
// através dos meses skipped consecutivos.
//
// Uso:
//   node scripts/backfill-skip-next-payment.mjs           # dry-run (default)
//   node scripts/backfill-skip-next-payment.mjs --apply   # aplica no Turso

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

console.log(`=== Backfill skip → next_payment_date — modo: ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

// Pega colunas reais da tabela para escolher SELECT compatível
const tableInfo = await client.execute("PRAGMA table_info(subscription_plans)");
const colNames = new Set(tableInfo.rows.map((r) => r.name));
const hasBilling2 = colNames.has("billing_cycle_days_2");

const planosSql = `
  SELECT sp.id, c.name AS client_name, sp.next_payment_date,
         sp.billing_cycle_days${hasBilling2 ? ", sp.billing_cycle_days_2" : ""}
  FROM subscription_plans sp
  JOIN clients c ON c.id = sp.client_id
  WHERE sp.next_payment_date IS NOT NULL
    AND sp.billing_cycle_days IS NOT NULL
    AND sp.id IN (SELECT DISTINCT plan_id FROM plan_payments WHERE skipped = 1)
  ORDER BY c.name
`;

const planosRes = await client.execute({ sql: planosSql, args: [] });

if (planosRes.rows.length === 0) {
  console.log("Nenhum plano com pagamentos congelados elegível. Nada a fazer.");
  await client.close();
  process.exit(0);
}

// Para cada plano, busca os meses congelados (YYYY-MM)
const changes = [];
for (const plan of planosRes.rows) {
  const pagamentosRes = await client.execute({
    sql: "SELECT payment_date FROM plan_payments WHERE plan_id = ? AND skipped = 1",
    args: [plan.id],
  });
  const skippedMonths = new Set(
    pagamentosRes.rows.map((r) => String(r.payment_date).slice(0, 7))
  );

  let next = String(plan.next_payment_date);
  while (skippedMonths.has(next.slice(0, 7))) {
    next = calcularProximoVencimento(
      next,
      Number(plan.billing_cycle_days),
      hasBilling2 && plan.billing_cycle_days_2 != null
        ? Number(plan.billing_cycle_days_2)
        : null
    );
  }

  if (next !== plan.next_payment_date) {
    changes.push({
      plan_id: plan.id,
      cliente: plan.client_name,
      antes: plan.next_payment_date,
      depois: next,
      meses_congelados: [...skippedMonths].sort().join(", "),
    });
  }
}

if (changes.length === 0) {
  console.log("Nenhum plano precisa de atualização (todos já estão fora dos meses congelados).");
  await client.close();
  process.exit(0);
}

console.log(`${changes.length} plano(s) a atualizar:\n`);
console.table(changes);

if (!APPLY) {
  console.log("\nDry-run. Para aplicar: node scripts/backfill-skip-next-payment.mjs --apply");
  await client.close();
  process.exit(0);
}

console.log("\nAplicando...");
let updated = 0;
for (const c of changes) {
  await client.execute({
    sql: "UPDATE subscription_plans SET next_payment_date = ?, updated_at = datetime('now') WHERE id = ?",
    args: [c.depois, c.plan_id],
  });
  updated += 1;
}
console.log(`\n${updated} plano(s) atualizados.`);

console.log("\nVerificação pós-backfill:");
const verifica = await client.execute({
  sql: `SELECT sp.id, c.name, sp.next_payment_date
        FROM subscription_plans sp
        JOIN clients c ON c.id = sp.client_id
        WHERE sp.id IN (${changes.map((c) => c.plan_id).join(",")})
        ORDER BY c.name`,
  args: [],
});
console.table(verifica.rows);

await client.close();
