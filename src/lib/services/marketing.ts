import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

// ─── setAdSpend (upsert por mês) ─────────────────────────────────────────────

export async function setAdSpend(
  db: any,
  month: string, // YYYY-MM
  adSpend: number
): Promise<void> {
  if (adSpend < 0) throw new Error("ad_spend não pode ser negativo");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("mês inválido (use YYYY-MM)");

  const existing = await db
    .select()
    .from(schema.marketingMonthly)
    .where(eq(schema.marketingMonthly.month, month))
    .get();

  if (existing) {
    await db
      .update(schema.marketingMonthly)
      .set({
        adSpend,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.marketingMonthly.month, month))
      .run();
  } else {
    await db
      .insert(schema.marketingMonthly)
      .values({
        month,
        adSpend,
      })
      .run();
  }
}

// ─── getAdSpendMap ────────────────────────────────────────────────────────────

export async function getAdSpendMap(db: any): Promise<Map<string, number>> {
  const rows = await db.select().from(schema.marketingMonthly).all();
  return new Map(rows.map((r: any) => [r.month as string, r.adSpend as number]));
}
