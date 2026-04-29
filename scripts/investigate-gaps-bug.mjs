import "dotenv/config";
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log("=== INVESTIGAÇÃO BUG +N badge ===\n");
console.log(`Hoje (script): ${new Date().toISOString().split("T")[0]}\n`);

console.log("1. earliest_tracked_month em agency_settings:");
const setting = await client.execute({
  sql: `SELECT key, value FROM agency_settings WHERE key = 'earliest_tracked_month'`,
  args: [],
});
console.table(setting.rows);

const SUSPECTS = [
  "Fernanda Muniz",
  "Beatriz Viçoza",
  "Espaço Essenzia",
  "Gabriela Alves",
  "Jessica Ortega",
  "Rhael",
  "Natalia Veber",
  "Luana Siqueira",
  "Isabelle Taborda",
  "Dr Fernando", // controle: mostra +1
  "Pedagobia Macedo", // controle: mostra +1
  "Gabriele Rousseau", // controle: mostra +3
];

for (const name of SUSPECTS) {
  console.log(`\n──────── ${name} ────────`);

  const planRow = await client.execute({
    sql: `SELECT c.name, sp.id, sp.start_date, sp.billing_cycle_days, sp.billing_cycle_days_2,
                 sp.last_payment_date, sp.next_payment_date, sp.status, sp.end_date
          FROM clients c
          JOIN subscription_plans sp ON sp.client_id = c.id
          WHERE LOWER(c.name) LIKE LOWER(?) AND sp.status = 'ativo'
          ORDER BY sp.id DESC LIMIT 1`,
    args: [`%${name}%`],
  });

  if (planRow.rows.length === 0) {
    console.log(`  ⚠ não encontrado`);
    continue;
  }

  const plan = planRow.rows[0];
  console.log(
    `  plan_id=${plan.id} start=${plan.start_date} billing=${plan.billing_cycle_days}` +
      (plan.billing_cycle_days_2 ? `/${plan.billing_cycle_days_2}` : "") +
      ` last_pgto=${plan.last_payment_date} next_pgto=${plan.next_payment_date}`,
  );

  const payments = await client.execute({
    sql: `SELECT payment_date, amount, skipped, status, notes
          FROM plan_payments
          WHERE plan_id = ?
          ORDER BY payment_date DESC
          LIMIT 10`,
    args: [plan.id],
  });
  console.log(`  últimos pagamentos (max 10):`);
  console.table(payments.rows);

  // Conta meses únicos com pagamento
  const monthsWithPayment = await client.execute({
    sql: `SELECT DISTINCT substr(payment_date, 1, 7) as month, COUNT(*) as count,
                 SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) as skipped_count
          FROM plan_payments
          WHERE plan_id = ?
          GROUP BY month
          ORDER BY month DESC
          LIMIT 6`,
    args: [plan.id],
  });
  console.log(`  meses com registros (últimos 6):`);
  console.table(monthsWithPayment.rows);
}

await client.close();
