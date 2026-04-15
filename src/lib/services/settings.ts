import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

export const TARGET_COST_PER_POST_KEY = "target_cost_per_post";

// ─── getSetting ───────────────────────────────────────────────────────────────

export async function getSetting(db: any, key: string): Promise<string | null> {
  const row = await db
    .select({ value: schema.agencySettings.value })
    .from(schema.agencySettings)
    .where(eq(schema.agencySettings.key, key))
    .get();
  return row?.value ?? null;
}

// ─── setSetting (upsert) ──────────────────────────────────────────────────────

export async function setSetting(
  db: any,
  key: string,
  value: string
): Promise<void> {
  const existing = await db
    .select()
    .from(schema.agencySettings)
    .where(eq(schema.agencySettings.key, key))
    .get();

  if (existing) {
    await db
      .update(schema.agencySettings)
      .set({ value, updatedAt: new Date().toISOString() })
      .where(eq(schema.agencySettings.key, key))
      .run();
  } else {
    await db
      .insert(schema.agencySettings)
      .values({ key, value })
      .run();
  }
}
