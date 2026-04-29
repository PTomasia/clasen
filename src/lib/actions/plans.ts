"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import {
  createPlan as createPlanService,
  closePlan as closePlanService,
  recordPayment as recordPaymentService,
  updatePayment as updatePaymentService,
  deletePayment as deletePaymentService,
  updateClient as updateClientService,
  updatePlan as updatePlanService,
  updateBillingDays as updateBillingDaysService,
  deletePlan as deletePlanService,
  changePlan as changePlanService,
  getPaymentHistory as getPaymentHistoryService,
  skipBillingCycle as skipBillingCycleService,
  skipPaymentMonth as skipPaymentMonthService,
} from "../services/plans";
import type {
  CreatePlanInput,
  RecordPaymentInput,
  UpdateClientInput,
  UpdatePlanInput,
  UpdatePaymentInput,
  ChangePlanInput,
  ClosePlanOptions,
} from "../services/plans";
import { REVALIDATE_PATHS } from "../constants";

// ─── Helper — revalida todos os paths de uma vez ─────────────────────────────

function revalidateAll() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

// ─── Server Actions — finos, só validam e chamam service ───────────────────────

export async function createPlanAction(input: CreatePlanInput) {
  const result = await createPlanService(db as any, input);
  revalidateAll();
  return { planId: result.plan.id, clientId: result.client.id };
}

export async function closePlanAction(
  planId: number,
  endDate: string,
  options: ClosePlanOptions = {}
) {
  await closePlanService(db as any, planId, endDate, options);
  revalidateAll();
}

export async function recordPaymentAction(input: RecordPaymentInput) {
  const payment = await recordPaymentService(db as any, input);
  revalidateAll();
  return { paymentId: payment.id };
}

export async function updatePaymentAction(
  planId: number,
  paymentId: number,
  input: UpdatePaymentInput
) {
  await updatePaymentService(db as any, planId, paymentId, input);
  revalidateAll();
}

export async function deletePaymentAction(planId: number, paymentId: number) {
  await deletePaymentService(db as any, planId, paymentId);
  revalidateAll();
}

export async function updateClientAction(input: UpdateClientInput) {
  const client = await updateClientService(db as any, input);
  revalidateAll();
  return { clientId: client.id };
}

export async function updatePlanAction(input: UpdatePlanInput) {
  await updatePlanService(db as any, input);
  revalidateAll();
}

export async function updateBillingDaysAction(
  planId: number,
  billingCycleDays: number,
  billingCycleDays2: number | null = null
) {
  await updateBillingDaysService(db as any, planId, billingCycleDays, billingCycleDays2);
  revalidateAll();
}

export async function changePlanAction(input: ChangePlanInput) {
  const result = await changePlanService(db as any, input);
  revalidateAll();
  return { newPlanId: result.newPlan.id };
}

export async function getPaymentHistoryAction(planId: number) {
  return await getPaymentHistoryService(db as any, planId);
}

export async function deletePlanAction(planId: number) {
  await deletePlanService(db as any, planId);
  revalidateAll();
}

export async function skipBillingCycleAction(planId: number) {
  await skipBillingCycleService(db as any, planId);
  revalidateAll();
}

export async function skipPaymentMonthAction(planId: number, month: string) {
  await skipPaymentMonthService(db as any, planId, month);
  revalidateAll();
}
