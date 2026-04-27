"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import { applyMatches } from "../services/reconciliation";
import type { ConfirmedMatch } from "../services/reconciliation";
import { REVALIDATE_PATHS } from "../constants";

function revalidateAll() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

export async function applyReconciliationAction(
  matches: ConfirmedMatch[]
): Promise<{ applied: number; errors: { planId: number; error: string }[] }> {
  const result = await applyMatches(db as any, matches);
  if (result.applied > 0) revalidateAll();
  return result;
}
