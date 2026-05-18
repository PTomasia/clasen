"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import {
  resolveBulkImport,
  applyBulkImport,
  type BulkImportPreview,
  type Decision,
  type ApplyResult,
} from "../services/bulk-import";
import { REVALIDATE_PATHS } from "../constants";

function revalidateAll() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

export async function previewBulkImportAction(
  rawJson: string
): Promise<{ ok: true; preview: BulkImportPreview } | { ok: false; error: string }> {
  try {
    const preview = await resolveBulkImport(db as any, rawJson);
    return { ok: true, preview };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function applyBulkImportAction(
  rawJson: string,
  decisions: Decision[]
): Promise<{ ok: true; result: ApplyResult } | { ok: false; error: string }> {
  try {
    // Re-resolve preview (server-side: garante consistência com decisions)
    const preview = await resolveBulkImport(db as any, rawJson);
    const today = new Date().toISOString().slice(0, 10);
    const result = await applyBulkImport(db as any, preview, decisions, today);
    if (result.applied > 0) revalidateAll();
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
