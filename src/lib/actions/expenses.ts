"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import {
  createExpense as createExpenseService,
  updateExpense as updateExpenseService,
  deleteExpense as deleteExpenseService,
  togglePaidExpense as togglePaidService,
  duplicateExpense as duplicateExpenseService,
  launchRecurringExpenses as launchRecurringService,
  createExpenseInstallments as createExpenseInstallmentsService,
} from "../services/expenses";
import type { CreateExpenseInput, UpdateExpenseInput, CreateExpenseInstallmentsInput } from "../services/expenses";
import { REVALIDATE_PATHS } from "../constants";

function revalidateAll() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

export async function createExpenseAction(input: CreateExpenseInput) {
  const expense = await createExpenseService(db as any, input);
  revalidateAll();
  return { expenseId: expense.id };
}

export async function updateExpenseAction(id: number, input: UpdateExpenseInput) {
  await updateExpenseService(db as any, id, input);
  revalidateAll();
}

export async function deleteExpenseAction(id: number) {
  await deleteExpenseService(db as any, id);
  revalidateAll();
}

export async function togglePaidExpenseAction(id: number) {
  await togglePaidService(db as any, id);
  revalidateAll();
}

export async function duplicateExpenseAction(id: number, targetMonth: string) {
  await duplicateExpenseService(db as any, id, targetMonth);
  revalidateAll();
}

export async function launchRecurringExpensesAction(targetMonth: string) {
  const created = await launchRecurringService(db as any, targetMonth);
  revalidateAll();
  return { count: created.length };
}

export async function createExpenseInstallmentsAction(input: CreateExpenseInstallmentsInput) {
  const rows = await createExpenseInstallmentsService(db as any, input);
  revalidateAll();
  return { count: rows.length };
}
