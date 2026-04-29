import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

export const TARGET_COST_PER_POST_KEY = "target_cost_per_post";
export const ADJUSTMENT_MESSAGE_TEMPLATE_KEY = "adjustment_message_template";

export const DEFAULT_ADJUSTMENT_MESSAGE_TEMPLATE = `Oi {cliente}! Passando pra conversar sobre o reajuste do plano.

Hoje o valor é {valorAtual}/mês e a sugestão é passar para {valorNovo}/mês a partir do próximo ciclo (+{percentual}%).

Esse ajuste mantém o nosso valor por post dentro do parâmetro de qualidade que a gente trabalha. Como você vê?`;

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
