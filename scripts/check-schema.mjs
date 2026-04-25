import "dotenv/config";
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log("Schema da tabela subscription_plans no Turso remoto:");
const r = await client.execute({
  sql: `SELECT name, type, "notnull", dflt_value FROM pragma_table_info('subscription_plans')`,
  args: [],
});
console.table(r.rows);

console.log("\nMigrations aplicadas (drizzle):");
try {
  const m = await client.execute({
    sql: `SELECT * FROM __drizzle_migrations ORDER BY created_at`,
    args: [],
  });
  console.table(m.rows.map(r => ({ hash: r.hash?.slice(0,12), created_at: r.created_at })));
} catch (e) {
  console.log("(tabela __drizzle_migrations não encontrada)");
}

await client.close();
