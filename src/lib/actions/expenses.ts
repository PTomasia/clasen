"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import {
  createExpense as createExpenseService,
  updateExpense as updateExpenseService,
  deleteExpense as deleteExpenseService,
} from "../services/expenses";
import type { CreateExpenseInput, UpdateExpenseInput } from "../services/expenses";
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
