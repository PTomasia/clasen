import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  createRevenue,
  updateRevenue,
  deleteRevenue,
  getRevenues,
  getRevenuesSummary,
} from "../revenues";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_origin TEXT,
      client_since TEXT,
      birthday TEXT,
      whatsapp TEXT,
      email TEXT,
      city TEXT,
      state TEXT,
      niche TEXT,
      years_in_practice INTEGER,
      consulta_ticket REAL,
      has_physical_office INTEGER,
      birth_year INTEGER,
      target_audience TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE one_time_revenues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      product TEXT NOT NULL,
      channel TEXT,
      campaign TEXT,
      is_paid INTEGER NOT NULL DEFAULT 1,
      installments_total INTEGER,
      installment_number INTEGER,
      installment_group_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

describe("createRevenue", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    db = createTestDb();
  });

  it("cria receita com cliente vinculado", async () => {
    const client = await db
      .insert(schema.clients)
      .values({ name: "Dra. Ana" })
      .returning()
      .get();

    const rev = await createRevenue(db, {
      clientId: client.id,
      date: "2026-04-10",
      amount: 250,
      product: "Arte para tráfego",
      isPaid: true,
    });

    expect(rev.id).toBeGreaterThan(0);
    expect(rev.clientId).toBe(client.id);
    expect(rev.amount).toBe(250);
    expect(rev.isPaid).toBe(true);
  });

  it("cria receita sem cliente (prospect/job avulso)", async () => {
    const rev = await createRevenue(db, {
      date: "2026-04-10",
      amount: 150,
      product: "PDF",
    });
    expect(rev.clientId).toBeNull();
  });

  it("rejeita valor <= 0", async () => {
    await expect(
      createRevenue(db, { date: "2026-04-10", amount: 0, product: "X" })
    ).rejects.toThrow("valor");
  });

  it("rejeita produto vazio", async () => {
    await expect(
      createRevenue(db, { date: "2026-04-10", amount: 100, product: "  " })
    ).rejects.toThrow("produto");
  });
});

describe("updateRevenue", () => {
  it("atualiza campos e pode trocar cliente", async () => {
    const db = createTestDb();
    const c1 = await db.insert(schema.clients).values({ name: "A" }).returning().get();
    const c2 = await db.insert(schema.clients).values({ name: "B" }).returning().get();

    const rev = await createRevenue(db, {
      date: "2026-03-01",
      amount: 100,
      product: "X",
    });

    const updated = await updateRevenue(db, rev.id, {
      clientId: c2.id,
      date: "2026-03-15",
      amount: 120,
      product: "Y",
      isPaid: false,
    });

    expect(updated.clientId).toBe(c2.id);
    expect(updated.amount).toBe(120);
    expect(updated.isPaid).toBe(false);

    // não mexe se c1 — ele nunca recebeu a receita
    const fromC1 = await db.select().from(schema.oneTimeRevenues)
      .where(eq(schema.oneTimeRevenues.clientId, c1.id)).all();
    expect(fromC1).toHaveLength(0);
  });

  it("permite desvincular cliente (clientId null)", async () => {
    const db = createTestDb();
    const c = await db.insert(schema.clients).values({ name: "A" }).returning().get();
    const rev = await createRevenue(db, {
      clientId: c.id,
      date: "2026-03-01",
      amount: 100,
      product: "X",
    });

    const updated = await updateRevenue(db, rev.id, {
      clientId: null,
      date: "2026-03-01",
      amount: 100,
      product: "X",
      isPaid: true,
    });

    expect(updated.clientId).toBeNull();
  });
});

describe("deleteRevenue", () => {
  it("remove a receita", async () => {
    const db = createTestDb();
    const rev = await createRevenue(db, {
      date: "2026-03-01",
      amount: 100,
      product: "X",
    });
    await deleteRevenue(db, rev.id);

    const all = await db.select().from(schema.oneTimeRevenues).all();
    expect(all).toHaveLength(0);
  });
});

describe("getRevenues / getRevenuesSummary", () => {
  it("lista tudo ordenado por data desc", async () => {
    const db = createTestDb();
    await createRevenue(db, { date: "2026-03-01", amount: 100, product: "A" });
    await createRevenue(db, { date: "2026-04-01", amount: 200, product: "B" });

    const list = await getRevenues(db);
    expect(list).toHaveLength(2);
    expect(list[0].product).toBe("B"); // mais recente primeiro
  });

  it("getRevenuesSummary separa total do mês, ano e geral (apenas pagos)", async () => {
    const db = createTestDb();
    // mês atual (baseado em referenceDate)
    await createRevenue(db, { date: "2026-04-05", amount: 100, product: "A", isPaid: true });
    await createRevenue(db, { date: "2026-04-08", amount: 200, product: "B", isPaid: true });
    // mês anterior do mesmo ano
    await createRevenue(db, { date: "2026-02-20", amount: 500, product: "C", isPaid: true });
    // ano anterior
    await createRevenue(db, { date: "2025-12-01", amount: 300, product: "D", isPaid: true });
    // pendente — não deve contar
    await createRevenue(db, { date: "2026-04-15", amount: 999, product: "E", isPaid: false });

    const summary = await getRevenuesSummary(db, "2026-04-10");
    expect(summary.totalMesAtual).toBe(300); // 100 + 200
    expect(summary.totalAno).toBe(800); // 100 + 200 + 500
    expect(summary.totalGeral).toBe(1100); // 100 + 200 + 500 + 300
    expect(summary.totalPendente).toBe(999);
    expect(summary.qtdMesAtual).toBe(2);
  });
});

// ─── Parcelamento ─────────────────────────────────────────────────────────────

describe("createRevenue — parcelamento flat", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it("à vista: não preenche campos de parcela", async () => {
    const rev = await createRevenue(db, {
      date: "2026-04-01",
      amount: 300,
      product: "Arte para tráfego",
    });

    expect(rev.installmentsTotal).toBeNull();
    expect(rev.installmentNumber).toBeNull();
    expect(rev.installmentGroupId).toBeNull();
  });

  it("3x: cria 3 linhas com mesmo installmentGroupId", async () => {
    const revs = await createRevenue(db, {
      date: "2026-04-01",
      amount: 300,
      product: "PDF",
      installmentsTotal: 3,
    });

    // retorna array de N quando parcelado
    expect(Array.isArray(revs)).toBe(true);
    const arr = revs as any[];
    expect(arr).toHaveLength(3);

    // mesmo grupo
    const groupId = arr[0].installmentGroupId;
    expect(groupId).toBeTruthy();
    expect(arr.every((r) => r.installmentGroupId === groupId)).toBe(true);

    // índices 1, 2, 3
    expect(arr.map((r) => r.installmentNumber)).toEqual([1, 2, 3]);

    // installmentsTotal em todas
    expect(arr.every((r) => r.installmentsTotal === 3)).toBe(true);
  });

  it("3x: valor por parcela = total / N (arredondado)", async () => {
    const revs = await createRevenue(db, {
      date: "2026-04-01",
      amount: 300,
      product: "PDF",
      installmentsTotal: 3,
    }) as any[];

    const totalSaved = revs.reduce((s: number, r: any) => s + r.amount, 0);
    expect(totalSaved).toBeCloseTo(300, 1);
    expect(revs[0].amount).toBeCloseTo(100, 1);
  });

  it("3x: datas mensais a partir da data da primeira parcela", async () => {
    const revs = await createRevenue(db, {
      date: "2026-04-10",
      amount: 300,
      product: "PDF",
      installmentsTotal: 3,
    }) as any[];

    expect(revs[0].date).toBe("2026-04-10");
    expect(revs[1].date).toBe("2026-05-10");
    expect(revs[2].date).toBe("2026-06-10");
  });

  it("3x: todas as parcelas iniciam como isPaid=false", async () => {
    const revs = await createRevenue(db, {
      date: "2026-04-01",
      amount: 300,
      product: "PDF",
      installmentsTotal: 3,
    }) as any[];

    expect(revs.every((r: any) => r.isPaid === false)).toBe(true);
  });

  it("installmentsTotal=1: trata como à vista (sem campos parcela)", async () => {
    const rev = await createRevenue(db, {
      date: "2026-04-01",
      amount: 300,
      product: "PDF",
      installmentsTotal: 1,
    });

    // retorna objeto único (não array)
    expect(Array.isArray(rev)).toBe(false);
    const r = rev as any;
    expect(r.installmentsTotal).toBeNull();
    expect(r.installmentGroupId).toBeNull();
  });

  it("getRevenues inclui campos de parcelamento", async () => {
    await createRevenue(db, {
      date: "2026-04-01",
      amount: 300,
      product: "PDF",
      installmentsTotal: 2,
    });

    const rows = await getRevenues(db);
    expect(rows).toHaveLength(2);
    // ambas têm os campos de parcela (ordem por date desc, 2ª parcela pode vir primeiro)
    expect(rows.every((r) => r.installmentsTotal === 2)).toBe(true);
    expect(rows.every((r) => r.installmentGroupId)).toBeTruthy();
    const numbers = rows.map((r) => r.installmentNumber).sort();
    expect(numbers).toEqual([1, 2]);
  });

  it("getRevenuesSummary: parcelas isPaid=false não entram no total", async () => {
    // parcelas criadas como isPaid=false
    await createRevenue(db, {
      date: "2026-04-01",
      amount: 300,
      product: "PDF",
      installmentsTotal: 3,
    });

    const summary = await getRevenuesSummary(db, "2026-04-30");
    expect(summary.totalMesAtual).toBe(0);      // nenhuma paga
    expect(summary.totalPendente).toBeCloseTo(300, 1); // todas pendentes
  });
});
