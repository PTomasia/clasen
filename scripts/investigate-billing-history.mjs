import "dotenv/config";
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log("Innera + Dara: histórico completo do plano e pagamentos");
const r = await client.execute({
  sql: `SELECT sp.id, sp.client_id, c.name, sp.billing_cycle_days, sp.start_date,
               sp.last_payment_date, sp.next_payment_date, sp.created_at, sp.updated_at,
               sp.status
        FROM subscription_plans sp
        JOIN clients c ON c.id = sp.client_id
        WHERE c.name LIKE '%Innera%' OR c.name LIKE '%Dara%'`,
  args: [],
});
console.log(JSON.stringify(r.rows, null, 2));

console.log("\nPagamentos de Innera + Dara:");
const p = await client.execute({
  sql: `SELECT pp.id, pp.plan_id, c.name, pp.payment_date, pp.amount, pp.status, pp.created_at
        FROM plan_payments pp
        JOIN clients c ON c.id = pp.client_id
        WHERE c.name LIKE '%Innera%' OR c.name LIKE '%Dara%'`,
  args: [],
});
console.log(JSON.stringify(p.rows, null, 2));

await client.close();
