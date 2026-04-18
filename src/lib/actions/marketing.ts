"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import { setAdSpend as setAdSpendService } from "../services/marketing";
import { REVALIDATE_PATHS } from "../constants";

function revalidateAll() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

export async function setAdSpendAction(month: string, adSpend: number) {
  await setAdSpendService(db as any, month, adSpend);
  revalidateAll();
}
