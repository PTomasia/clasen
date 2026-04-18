import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";
import { setAdSpend, getAdSpendMap } from "../marketing";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE marketing_monthly (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL UNIQUE,
      ad_spend REAL NOT NULL DEFAULT 0,
      new_clients INTEGER NOT NULL DEFAULT 0,
      churned_clients INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

describe("setAdSpend", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    db = createTestDb();
  });

  it("cria registro quando o mês não existe", async () => {
    await setAdSpend(db, "2026-04", 1500);
    const map = await getAdSpendMap(db);
    expect(map.get("2026-04")).toBe(1500);
  });

  it("atualiza (upsert) quando o mês já existe, sem duplicar", async () => {
    await setAdSpend(db, "2026-04", 1000);
    await setAdSpend(db, "2026-04", 1800);

    const rows = await db.select().from(schema.marketingMonthly).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].adSpend).toBe(1800);
  });

  it("aceita zero (para limpar ad_spend de um mês)", async () => {
    await setAdSpend(db, "2026-04", 1000);
    await setAdSpend(db, "2026-04", 0);
    const map = await getAdSpendMap(db);
    expect(map.get("2026-04")).toBe(0);
  });

  it("rejeita valor negativo", async () => {
    await expect(setAdSpend(db, "2026-04", -10)).rejects.toThrow("negativo");
  });

  it("rejeita formato inválido de mês", async () => {
    await expect(setAdSpend(db, "2026/04", 100)).rejects.toThrow("mês");
    await expect(setAdSpend(db, "abril-2026", 100)).rejects.toThrow("mês");
    await expect(setAdSpend(db, "2026-4", 100)).rejects.toThrow("mês");
  });

  it("mantém meses independentes (upsert por mês, não global)", async () => {
    await setAdSpend(db, "2026-03", 500);
    await setAdSpend(db, "2026-04", 800);
    await setAdSpend(db, "2026-03", 600);

    const map = await getAdSpendMap(db);
    expect(map.get("2026-03")).toBe(600);
    expect(map.get("2026-04")).toBe(800);
    expect(map.size).toBe(2);
  });
});

describe("getAdSpendMap", () => {
  it("retorna Map vazio quando não há registros", async () => {
    const db = createTestDb();
    const map = await getAdSpendMap(db);
    expect(map.size).toBe(0);
  });

  it("retorna Map com todos os meses cadastrados", async () => {
    const db = createTestDb();
    await setAdSpend(db, "2026-01", 100);
    await setAdSpend(db, "2026-02", 200);
    await setAdSpend(db, "2026-03", 300);

    const map = await getAdSpendMap(db);
    expect(map.size).toBe(3);
    expect(map.get("2026-01")).toBe(100);
    expect(map.get("2026-02")).toBe(200);
    expect(map.get("2026-03")).toBe(300);
  });
});
