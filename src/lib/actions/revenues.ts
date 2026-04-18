"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import {
  createRevenue as createRevenueService,
  updateRevenue as updateRevenueService,
  deleteRevenue as deleteRevenueService,
} from "../services/revenues";
import type {
  CreateRevenueInput,
  UpdateRevenueInput,
} from "../services/revenues";
import { REVALIDATE_PATHS } from "../constants";

function revalidateAll() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

export async function createRevenueAction(input: CreateRevenueInput) {
  const rev = await createRevenueService(db as any, input);
  revalidateAll();
  return { revenueId: rev.id };
}

export async function updateRevenueAction(
  revenueId: number,
  input: UpdateRevenueInput
) {
  await updateRevenueService(db as any, revenueId, input);
  revalidateAll();
}

export async function deleteRevenueAction(revenueId: number) {
  await deleteRevenueService(db as any, revenueId);
  revalidateAll();
}
