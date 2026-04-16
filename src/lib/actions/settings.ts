"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import {
  getSetting as getSettingService,
  setSetting as setSettingService,
  TARGET_COST_PER_POST_KEY,
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
