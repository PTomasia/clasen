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
  isRecurring?: boolean;
  recurringUntil?: string | null; // YYYY-MM
  notes?: string | null;
}

export interface UpdateExpenseInput {
  month: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  isPaid: boolean;
  isRecurring?: boolean;
  recurringUntil?: string | null;
  notes?: string | null;
}

export interface ExpenseRow {
  id: number;
  month: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  isPaid: boolean;
  isRecurring: boolean;
  recurringUntil: string | null;
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

// ─── toRow ────────────────────────────────────────────────────────────────────

function toRow(r: any): ExpenseRow {
  return {
    id: r.id,
    month: r.month,
    description: r.description,
    category: r.category as ExpenseCategory,
    amount: r.amount,
    isPaid: !!r.isPaid,
    isRecurring: !!r.isRecurring,
    recurringUntil: r.recurringUntil ?? null,
    notes: r.notes ?? null,
  };
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
      isRecurring: input.isRecurring ?? false,
      recurringUntil: input.recurringUntil ?? null,
      notes: input.notes?.trim() || null,
    })
    .returning()
    .get();

  return toRow(inserted);
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
      isRecurring: input.isRecurring ?? false,
      recurringUntil: input.recurringUntil ?? null,
      notes: input.notes?.trim() || null,
    })
    .where(eq(schema.expenses.id, id))
    .run();

  const updated = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id)).get();
  return toRow(updated);
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

  return rows.map(toRow);
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

// ─── togglePaidExpense (5.3) ──────────────────────────────────────────────────

export async function togglePaidExpense(db: any, id: number): Promise<ExpenseRow> {
  const existing = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id)).get();
  if (!existing) throw new Error("despesa não encontrada");

  await db
    .update(schema.expenses)
    .set({ isPaid: !existing.isPaid })
    .where(eq(schema.expenses.id, id))
    .run();

  const updated = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id)).get();
  return toRow(updated);
}

// ─── duplicateExpense (5.4) ───────────────────────────────────────────────────

export async function duplicateExpense(
  db: any,
  id: number,
  targetMonth: string
): Promise<ExpenseRow> {
  if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
    throw new Error("mês inválido (use YYYY-MM)");
  }

  const existing = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id)).get();
  if (!existing) throw new Error("despesa não encontrada");

  const inserted = await db
    .insert(schema.expenses)
    .values({
      month: targetMonth,
      description: existing.description,
      category: existing.category,
      amount: existing.amount,
      isPaid: false, // duplicata começa como pendente
      isRecurring: existing.isRecurring,
      recurringUntil: existing.recurringUntil ?? null,
      notes: existing.notes ?? null,
    })
    .returning()
    .get();

  return toRow(inserted);
}

// ─── getRecurringToLaunch (5.1) ───────────────────────────────────────────────
// Retorna despesas recorrentes do mês anterior que ainda não têm lançamento
// no mês alvo. Usado para exibir botão "Lançar fixas do mês".

export async function getRecurringToLaunch(
  db: any,
  targetMonth: string // YYYY-MM
): Promise<ExpenseRow[]> {
  // Calcular mês anterior
  const [year, month] = targetMonth.split("-").map(Number);
  const prevDate = new Date(year, month - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  // Buscar recorrentes do mês anterior (sem filtro de recurringUntil por hora)
  const recurring: any[] = await db
    .select()
    .from(schema.expenses)
    .where(
      and(
        eq(schema.expenses.month, prevMonth),
        eq(schema.expenses.isRecurring, true)
      )
    )
    .all();

  if (recurring.length === 0) return [];

  // Buscar lançamentos já existentes no mês alvo
  const existing: any[] = await db
    .select()
    .from(schema.expenses)
    .where(eq(schema.expenses.month, targetMonth))
    .all();

  const existingDescriptions = new Set(existing.map((e: any) => e.description.trim().toLowerCase()));

  // Retorna só os que ainda não foram lançados
  return recurring
    .filter((r: any) => {
      if (r.recurringUntil && r.recurringUntil < targetMonth) return false; // expirou
      return !existingDescriptions.has(r.description.trim().toLowerCase());
    })
    .map(toRow);
}

// ─── launchRecurringExpenses (5.1) ────────────────────────────────────────────
// Cria os lançamentos faltantes. Idempotente.

export async function launchRecurringExpenses(
  db: any,
  targetMonth: string
): Promise<ExpenseRow[]> {
  const pending = await getRecurringToLaunch(db, targetMonth);
  const created: ExpenseRow[] = [];

  for (const template of pending) {
    const inserted = await db
      .insert(schema.expenses)
      .values({
        month: targetMonth,
        description: template.description,
        category: template.category,
        amount: template.amount,
        isPaid: false,
        isRecurring: true,
        recurringUntil: template.recurringUntil ?? null,
        notes: template.notes ?? null,
      })
      .returning()
      .get();
    created.push(toRow(inserted));
  }

  return created;
}
