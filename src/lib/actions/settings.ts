"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import {
  getSetting as getSettingService,
  setSetting as setSettingService,
  TARGET_COST_PER_POST_KEY,
  ADJUSTMENT_MESSAGE_TEMPLATE_KEY,
  DEFAULT_ADJUSTMENT_MESSAGE_TEMPLATE,
} from "../services/settings";
import { REVALIDATE_PATHS } from "../constants";

export async function getTargetCostPerPost(): Promise<number | null> {
  const val = await getSettingService(db as any, TARGET_COST_PER_POST_KEY);
  return val ? Number(val) : null;
}

export async function setTargetCostPerPost(value: number) {
  if (value <= 0) throw new Error("Preço-alvo deve ser maior que zero");
  await setSettingService(db as any, TARGET_COST_PER_POST_KEY, String(value));
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

export async function getAdjustmentMessageTemplate(): Promise<string> {
  const val = await getSettingService(db as any, ADJUSTMENT_MESSAGE_TEMPLATE_KEY);
  return val ?? DEFAULT_ADJUSTMENT_MESSAGE_TEMPLATE;
}

export async function setAdjustmentMessageTemplate(template: string) {
  const trimmed = template.trim();
  if (!trimmed) throw new Error("Mensagem não pode ficar vazia");
  await setSettingService(db as any, ADJUSTMENT_MESSAGE_TEMPLATE_KEY, trimmed);
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}
