import { eq, desc, and } from "drizzle-orm";
import * as schema from "../db/schema";

export type ExpenseCategory = "fixo" | "variavel";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CreateExpenseInput {
  month: string; // YYYY-MM
  description: string;
  category: ExpenseCategory;
  amount: number;
  isPaid?: boolean;
  notes?: string | null;
}

export interface UpdateExpenseInput {
  month: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  isPaid: boolean;
  notes?: string | null;
}

export interface ExpenseRow {
  id: number;
  month: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  isPaid: boolean;
  notes: string | null;
}

export interface ExpensesSummary {
  totalMesAtual: number;
  totalFixoMesAtual: number;
  totalVariavelMesAtual: number;
  totalAno: number;
  totalGeral: number;
  totalPendente: number;
  qtdMesAtual: number;
  qtdTotal: number;
}

// ─── Validações ───────────────────────────────────────────────────────────────

function validateInput(input: {
  month: string;
  description: string;
  category: string;
  amount: number;
}): void {
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    throw new Error("mês inválido (use YYYY-MM)");
  }
  if (!input.description?.trim()) {
    throw new Error("descrição é obrigatória");
  }
  if (input.category !== "fixo" && input.category !== "variavel") {
    throw new Error("categoria inválida (use 'fixo' ou 'variavel')");
  }
  if (!input.amount || input.amount <= 0) {
    throw new Error("valor deve ser maior que zero");
  }
}

// ─── createExpense ────────────────────────────────────────────────────────────

export async function createExpense(
  db: any,
  input: CreateExpenseInput
): Promise<ExpenseRow> {
  validateInput(input);

  const inserted = await db
    .insert(schema.expenses)
    .values({
      month: input.month,
      description: input.description.trim(),
      category: input.category,
      amount: input.amount,
      isPaid: input.isPaid ?? true,
      notes: input.notes?.trim() || null,
    })
    .returning()
    .get();

  return {
    id: inserted.id,
    month: inserted.month,
    description: inserted.description,
    category: inserted.category as ExpenseCategory,
    amount: inserted.amount,
    isPaid: !!inserted.isPaid,
    notes: inserted.notes,
  };
}

// ─── updateExpense ────────────────────────────────────────────────────────────

export async function updateExpense(
  db: any,
  id: number,
  input: UpdateExpenseInput
): Promise<ExpenseRow> {
  validateInput(input);

  const existing = await db
    .select()
    .from(schema.expenses)
    .where(eq(schema.expenses.id, id))
    .get();

  if (!existing) throw new Error("despesa não encontrada");

  await db
    .update(schema.expenses)
    .set({
      month: input.month,
      description: input.description.trim(),
      category: input.category,
      amount: input.amount,
      isPaid: input.isPaid,
      notes: input.notes?.trim() || null,
    })
    .where(eq(schema.expenses.id, id))
    .run();

  const updated = await db
    .select()
    .from(schema.expenses)
    .where(eq(schema.expenses.id, id))
    .get();

  return {
    id: updated.id,
    month: updated.month,
    description: updated.description,
    category: updated.category as ExpenseCategory,
    amount: updated.amount,
    isPaid: !!updated.isPaid,
    notes: updated.notes,
  };
}

// ─── deleteExpense ────────────────────────────────────────────────────────────

export async function deleteExpense(db: any, id: number): Promise<void> {
  await db.delete(schema.expenses).where(eq(schema.expenses.id, id)).run();
}

// ─── getExpenses ──────────────────────────────────────────────────────────────

export async function getExpenses(
  db: any,
  filter?: { month?: string }
): Promise<ExpenseRow[]> {
  const rows = filter?.month
    ? await db
        .select()
        .from(schema.expenses)
        .where(eq(schema.expenses.month, filter.month))
        .orderBy(desc(schema.expenses.id))
        .all()
    : await db
        .select()
        .from(schema.expenses)
        .orderBy(desc(schema.expenses.month), desc(schema.expenses.id))
        .all();

  return rows.map((r: any) => ({
    id: r.id,
    month: r.month,
    description: r.description,
    category: r.category as ExpenseCategory,
    amount: r.amount,
    isPaid: !!r.isPaid,
    notes: r.notes,
  }));
}

// ─── getExpensesSummary ───────────────────────────────────────────────────────

export async function getExpensesSummary(
  db: any,
  today?: string
): Promise<ExpensesSummary> {
  const refStr = today ?? new Date().toISOString().slice(0, 10);
  const currentMonth = refStr.slice(0, 7);
  const currentYear = refStr.slice(0, 4);

  const all = await db.select().from(schema.expenses).all();

  let totalMesAtual = 0;
  let totalFixoMesAtual = 0;
  let totalVariavelMesAtual = 0;
  let totalAno = 0;
  let totalGeral = 0;
  let totalPendente = 0;
  let qtdMesAtual = 0;

  for (const e of all) {
    const isPaid = !!e.isPaid;
    if (!isPaid) {
      totalPendente += e.amount;
      continue;
    }
    totalGeral += e.amount;
    if (e.month.slice(0, 4) === currentYear) totalAno += e.amount;
    if (e.month === currentMonth) {
      totalMesAtual += e.amount;
      qtdMesAtual += 1;
      if (e.category === "fixo") totalFixoMesAtual += e.amount;
      else totalVariavelMesAtual += e.amount;
    }
  }

  return {
    totalMesAtual,
    totalFixoMesAtual,
    totalVariavelMesAtual,
    totalAno,
    totalGeral,
    totalPendente,
    qtdMesAtual,
    qtdTotal: all.length,
  };
}
