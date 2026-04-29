import "dotenv/config";
import { createClient } from "@libsql/client";

const c = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log("=== Bárbara Brandao — histórico completo ===\n");

const plan = await c.execute({
  sql: `SELECT sp.id, sp.start_date, sp.billing_cycle_days, sp.plan_value,
               sp.last_payment_date, sp.next_payment_date
        FROM subscription_plans sp
        JOIN clients c ON c.id = sp.client_id
        WHERE LOWER(c.name) LIKE '%brandao%'`,
  args: [],
});
console.table(plan.rows);

const planId = plan.rows[0].id;
const payments = await c.execute({
  sql: `SELECT id, payment_date, amount, status, skipped, notes, created_at
        FROM plan_payments
        WHERE plan_id = ?
        ORDER BY payment_date ASC`,
  args: [planId],
});
console.log("\nPagamentos atuais (ordem cronológica):");
console.table(payments.rows);

await c.close();
