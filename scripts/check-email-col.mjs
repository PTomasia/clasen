import "dotenv/config";
import { createClient } from "@libsql/client";

const c = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const r = await c.execute({
  sql: `SELECT name FROM pragma_table_info('clients')`,
  args: [],
});
console.log("clients columns:", r.rows.map((x) => x.name).join(", "));

const hasEmail = r.rows.some((x) => x.name === "email");
if (!hasEmail) {
  console.log("Adding email column...");
  await c.execute({ sql: "ALTER TABLE clients ADD COLUMN email TEXT", args: [] });
  console.log("Added.");
}

await c.close();
