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
  togglePaidExpense,
  duplicateExpense,
  getRecurringToLaunch,
  launchRecurringExpenses,
  createExpenseInstallments,
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
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurring_until TEXT,
      installments_total INTEGER,
      installment_number INTEGER,
      installment_group_id TEXT,
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

// ─── togglePaidExpense (5.3) ──────────────────────────────────────────────────

describe("togglePaidExpense", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it("alterna isPaid de true para false", async () => {
    const e = await createExpense(db, { month: "2026-04", description: "Teste", category: "fixo", amount: 100, isPaid: true });
    await togglePaidExpense(db, e.id);
    const all = await getExpenses(db);
    expect(all[0].isPaid).toBe(false);
  });

  it("alterna isPaid de false para true", async () => {
    const e = await createExpense(db, { month: "2026-04", description: "Teste", category: "fixo", amount: 100, isPaid: false });
    await togglePaidExpense(db, e.id);
    const all = await getExpenses(db);
    expect(all[0].isPaid).toBe(true);
  });

  it("rejeita id inexistente", async () => {
    await expect(togglePaidExpense(db, 9999)).rejects.toThrow("despesa não encontrada");
  });
});

// ─── duplicateExpense (5.4) ───────────────────────────────────────────────────

describe("duplicateExpense", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it("copia despesa para outro mês", async () => {
    const orig = await createExpense(db, { month: "2026-04", description: "Servidor", category: "fixo", amount: 200, isPaid: true });
    const dup = await duplicateExpense(db, orig.id, "2026-05");
    expect(dup.month).toBe("2026-05");
    expect(dup.description).toBe("Servidor");
    expect(dup.amount).toBe(200);
    expect(dup.isPaid).toBe(false); // sempre pendente
  });

  it("duplicata não modifica a original", async () => {
    const orig = await createExpense(db, { month: "2026-04", description: "Servidor", category: "fixo", amount: 200, isPaid: true });
    await duplicateExpense(db, orig.id, "2026-05");
    const all = await getExpenses(db);
    expect(all).toHaveLength(2);
    const original = all.find((e) => e.month === "2026-04");
    expect(original!.isPaid).toBe(true);
  });
});

// ─── launchRecurringExpenses (5.1) ────────────────────────────────────────────

describe("launchRecurringExpenses", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it("cria lançamentos do mês alvo para recorrentes do mês anterior", async () => {
    await createExpense(db, { month: "2026-04", description: "Plano GitHub", category: "fixo", amount: 50, isPaid: true, isRecurring: true });
    const created = await launchRecurringExpenses(db, "2026-05");
    expect(created).toHaveLength(1);
    expect(created[0].month).toBe("2026-05");
    expect(created[0].description).toBe("Plano GitHub");
    expect(created[0].isPaid).toBe(false);
  });

  it("é idempotente: segunda execução não duplica", async () => {
    await createExpense(db, { month: "2026-04", description: "Plano GitHub", category: "fixo", amount: 50, isPaid: true, isRecurring: true });
    await launchRecurringExpenses(db, "2026-05");
    const second = await launchRecurringExpenses(db, "2026-05");
    expect(second).toHaveLength(0);
    const all = await getExpenses(db, { month: "2026-05" });
    expect(all).toHaveLength(1);
  });

  it("não lança se recurringUntil já expirou", async () => {
    await createExpense(db, { month: "2026-04", description: "Antigo", category: "fixo", amount: 30, isPaid: true, isRecurring: true, recurringUntil: "2026-04" });
    const created = await launchRecurringExpenses(db, "2026-05");
    expect(created).toHaveLength(0);
  });

  it("getRecurringToLaunch retorna lista vazia se tudo já foi lançado", async () => {
    await createExpense(db, { month: "2026-04", description: "Plano GitHub", category: "fixo", amount: 50, isRecurring: true });
    await createExpense(db, { month: "2026-05", description: "Plano GitHub", category: "fixo", amount: 50 });
    const pending = await getRecurringToLaunch(db, "2026-05");
    expect(pending).toHaveLength(0);
  });
});

// ─── createExpenseInstallments (5.5) ─────────────────────────────────────────

describe("createExpenseInstallments", () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it("cria N parcelas com meses sequenciais", async () => {
    const rows = await createExpenseInstallments(db, {
      month: "2026-04",
      description: "Equipamento",
      category: "variavel",
      amount: 300,
      installmentsTotal: 3,
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.month)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(rows[0].installmentNumber).toBe(1);
    expect(rows[1].installmentNumber).toBe(2);
    expect(rows[2].installmentNumber).toBe(3);
    expect(rows[0].installmentsTotal).toBe(3);
    // Todas com mesmo groupId
    const groupId = rows[0].installmentGroupId;
    expect(groupId).toBeTruthy();
    expect(rows.every((r) => r.installmentGroupId === groupId)).toBe(true);
  });

  it("todas as parcelas começam como não pagas (isPaid=false)", async () => {
    const rows = await createExpenseInstallments(db, {
      month: "2026-04",
      description: "Equipamento",
      category: "variavel",
      amount: 300,
      installmentsTotal: 2,
    });
    expect(rows.every((r) => r.isPaid === false)).toBe(true);
  });

  it("rejeita installmentsTotal <= 1", async () => {
    await expect(
      createExpenseInstallments(db, {
        month: "2026-04",
        description: "X",
        category: "fixo",
        amount: 100,
        installmentsTotal: 1,
      })
    ).rejects.toThrow("parcelas");
  });

  it("rejeita installmentsTotal > 60", async () => {
    await expect(
      createExpenseInstallments(db, {
        month: "2026-04",
        description: "X",
        category: "fixo",
        amount: 100,
        installmentsTotal: 61,
      })
    ).rejects.toThrow("parcelas");
  });

  it("propaga validações básicas (mês inválido)", async () => {
    await expect(
      createExpenseInstallments(db, {
        month: "2026-4",
        description: "X",
        category: "fixo",
        amount: 100,
        installmentsTotal: 3,
      })
    ).rejects.toThrow("mês");
  });
});
