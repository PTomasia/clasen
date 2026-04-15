import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../../db/schema";
import { getSetting, setSetting, TARGET_COST_PER_POST_KEY } from "../settings";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/lib/db/migrations" });
  return db;
}

describe("settings service", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  // ─── getSetting ─────────────────────────────────────────────────────

  it("retorna null quando a chave não existe", async () => {
    const result = await getSetting(db as any, "inexistente");
    expect(result).toBeNull();
  });

  it("retorna o valor quando a chave existe", async () => {
    await setSetting(db as any, "test_key", "42");
    const result = await getSetting(db as any, "test_key");
    expect(result).toBe("42");
  });

  // ─── setSetting ─────────────────────────────────────────────────────

  it("cria nova chave se não existe", async () => {
    await setSetting(db as any, "nova", "valor");
    const result = await getSetting(db as any, "nova");
    expect(result).toBe("valor");
  });

  it("atualiza valor se chave já existe (upsert)", async () => {
    await setSetting(db as any, "preco", "100");
    await setSetting(db as any, "preco", "178");
    const result = await getSetting(db as any, "preco");
    expect(result).toBe("178");
  });

  // ─── Preço-alvo $/post ──────────────────────────────────────────────

  it("usa chave correta para preço-alvo", () => {
    expect(TARGET_COST_PER_POST_KEY).toBe("target_cost_per_post");
  });
});
