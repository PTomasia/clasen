import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Singleton pattern para evitar múltiplas conexões em dev (hot reload)
const globalForDb = globalThis as typeof globalThis & {
  db?: ReturnType<typeof createDrizzleClient>;
};

function createDrizzleClient() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL ?? "file:./database/dev.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  return drizzle(client, { schema });
}

export const db = globalForDb.db ?? createDrizzleClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export type Database = typeof db;
