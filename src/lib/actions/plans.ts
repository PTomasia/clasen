"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import {
  createPlan as createPlanService,
  closePlan as closePlanService,
  recordPayment as recordPaymentService,
  updateClient as updateClientService,
  updatePlan as updatePlanService,
  deletePlan as deletePlanService,
} from "../services/plans";
import type { CreatePlanInput, RecordPaymentInput, UpdateClientInput, UpdatePlanInput } from "../services/plans";

// ─── Server Actions — finos, só validam e chamam service ───────────────────────

export async function createPlanAction(input: CreatePlanInput) {
  const result = await createPlanService(db as any, input);
  revalidatePath("/planos");
  revalidatePath("/clientes");
  return { planId: result.plan.id, clientId: result.client.id };
}

export async function closePlanAction(planId: number, endDate: string) {
  await closePlanService(db as any, planId, endDate);
  revalidatePath("/planos");
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
}

export async function recordPaymentAction(input: RecordPaymentInput) {
  const payment = await recordPaymentService(db as any, input);
  revalidatePath("/planos");
  revalidatePath("/dashboard");
  return { paymentId: payment.id };
}

export async function updateClientAction(input: UpdateClientInput) {
  const client = await updateClientService(db as any, input);
  revalidatePath("/planos");
  revalidatePath("/clientes");
  return { clientId: client.id };
}

export async function updatePlanAction(input: UpdatePlanInput) {
  await updatePlanService(db as any, input);
  revalidatePath("/planos");
  revalidatePath("/dashboard");
}

export async function deletePlanAction(planId: number) {
  await deletePlanService(db as any, planId);
  revalidatePath("/planos");
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
}
