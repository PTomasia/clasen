import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "../../db/schema";
import {
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenses,
  getExpensesSummary,
} from "../expenses";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'variavel',
      amount REAL NOT NULL,
      is_paid INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

describe("createExpense", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    db = createTestDb();
  });

  it("cria despesa com valores mínimos", async () => {
    const e = await createExpense(db, {
      month: "2026-04",
      description: "Aluguel escritório",
      category: "fixo",
      amount: 2500,
    });
    expect(e.id).toBeGreaterThan(0);
    expect(e.month).toBe("2026-04");
    expect(e.amount).toBe(2500);
    expect(e.isPaid).toBe(true); // default
  });

  it("trim em description e notes", async () => {
    const e = await createExpense(db, {
      month: "2026-04",
      description: "  Hosting  ",
      category: "fixo",
      amount: 50,
      notes: "  vercel  ",
    });
    expect(e.description).toBe("Hosting");
    expect(e.notes).toBe("vercel");
  });

  it("aceita isPaid=false para despesa futura/não paga", async () => {
    const e = await createExpense(db, {
      month: "2026-04",
      description: "Software X",
      category: "variavel",
      amount: 100,
      isPaid: false,
    });
    expect(e.isPaid).toBe(false);
  });

  it("rejeita mês com formato inválido", async () => {
    await expect(
      createExpense(db, {
        month: "abril-2026",
        description: "X",
        category: "fixo",
        amount: 100,
      })
    ).rejects.toThrow("mês");
    await expect(
      createExpense(db, {
        month: "2026-4",
        description: "X",
        category: "fixo",
        amount: 100,
      })
    ).rejects.toThrow("mês");
  });

  it("rejeita amount <= 0", async () => {
    await expect(
      createExpense(db, {
        month: "2026-04",
        description: "X",
        category: "fixo",
        amount: 0,
      })
    ).rejects.toThrow("valor");
    await expect(
      createExpense(db, {
        month: "2026-04",
        description: "X",
        category: "fixo",
        amount: -10,
      })
    ).rejects.toThrow("valor");
  });

  it("rejeita description vazia ou só espaços", async () => {
    await expect(
      createExpense(db, {
        month: "2026-04",
        description: "   ",
        category: "fixo",
        amount: 100,
      })
    ).rejects.toThrow("descrição");
  });

  it("rejeita category inválida", async () => {
    await expect(
      createExpense(db, {
        month: "2026-04",
        description: "X",
        category: "outra" as any,
        amount: 100,
      })
    ).rejects.toThrow("categoria");
  });
});

describe("updateExpense", () => {
  it("atualiza campos", async () => {
    const db = createTestDb();
    const e = await createExpense(db, {
      month: "2026-04",
      description: "Internet",
      category: "fixo",
      amount: 150,
    });

    const updated = await updateExpense(db, e.id, {
      month: "2026-04",
      description: "Internet fibra 500",
      category: "fixo",
      amount: 200,
      isPaid: true,
    });

    expect(updated.description).toBe("Internet fibra 500");
    expect(updated.amount).toBe(200);
  });

  it("rejeita ID inexistente", async () => {
    const db = createTestDb();
    await expect(
      updateExpense(db, 9999, {
        month: "2026-04",
        description: "X",
        category: "fixo",
        amount: 100,
        isPaid: true,
      })
    ).rejects.toThrow("não encontrada");
  });
});

describe("deleteExpense", () => {
  it("remove o registro", async () => {
    const db = createTestDb();
    const e = await createExpense(db, {
      month: "2026-04",
      description: "X",
      category: "fixo",
      amount: 100,
    });
    await deleteExpense(db, e.id);

    const all = await getExpenses(db);
    expect(all).toHaveLength(0);
  });
});

describe("getExpenses", () => {
  it("ordena por mês desc, id desc", async () => {
    const db = createTestDb();
    await createExpense(db, { month: "2026-03", description: "A", category: "fixo", amount: 100 });
    await createExpense(db, { month: "2026-04", description: "B", category: "fixo", amount: 200 });
    await createExpense(db, { month: "2026-04", description: "C", category: "variavel", amount: 50 });

    const list = await getExpenses(db);
    expect(list.map((e) => e.description)).toEqual(["C", "B", "A"]);
  });

  it("filtra por mês quando fornecido", async () => {
    const db = createTestDb();
    await createExpense(db, { month: "2026-03", description: "A", category: "fixo", amount: 100 });
    await createExpense(db, { month: "2026-04", description: "B", category: "fixo", amount: 200 });

    const list = await getExpenses(db, { month: "2026-04" });
    expect(list).toHaveLength(1);
    expect(list[0].description).toBe("B");
  });
});

describe("getExpensesSummary", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => {
    db = createTestDb();
  });

  it("separa pagas/pendentes e fixo/variável no mês corrente", async () => {
    // mês corrente (2026-04)
    await createExpense(db, { month: "2026-04", description: "Aluguel", category: "fixo", amount: 2500, isPaid: true });
    await createExpense(db, { month: "2026-04", description: "Internet", category: "fixo", amount: 150, isPaid: true });
    await createExpense(db, { month: "2026-04", description: "Arte extra", category: "variavel", amount: 300, isPaid: true });
    // pendente — não entra no total pago
    await createExpense(db, { month: "2026-04", description: "Software", category: "variavel", amount: 100, isPaid: false });
    // outro mês
    await createExpense(db, { month: "2026-02", description: "Antigo", category: "fixo", amount: 500, isPaid: true });
    // ano passado
    await createExpense(db, { month: "2025-12", description: "Antigo2", category: "fixo", amount: 800, isPaid: true });

    const s = await getExpensesSummary(db, "2026-04-15");

    expect(s.totalMesAtual).toBe(2950); // 2500 + 150 + 300
    expect(s.totalFixoMesAtual).toBe(2650); // 2500 + 150
    expect(s.totalVariavelMesAtual).toBe(300);
    expect(s.qtdMesAtual).toBe(3); // pagas apenas
    expect(s.totalAno).toBe(3450); // 2950 + 500
    expect(s.totalGeral).toBe(4250); // + 800
    expect(s.totalPendente).toBe(100);
    expect(s.qtdTotal).toBe(6);
  });

  it("tudo zero quando não há despesas", async () => {
    const s = await getExpensesSummary(db, "2026-04-15");
    expect(s.totalMesAtual).toBe(0);
    expect(s.totalAno).toBe(0);
    expect(s.totalGeral).toBe(0);
    expect(s.totalPendente).toBe(0);
    expect(s.qtdMesAtual).toBe(0);
    expect(s.qtdTotal).toBe(0);
  });
});
