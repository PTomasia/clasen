"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db";
import {
  createClient,
  getClientDetail,
  type CreateClientInput,
} from "../services/clients";

export async function getClientDetailAction(clientId: number) {
  const result = await getClientDetail(db as any, clientId);
  if (!result) throw new Error("cliente não encontrado");
  return result;
}

export async function createClientAction(input: CreateClientInput) {
  const result = await createClient(db as any, input);
  revalidatePath("/clientes");
  revalidatePath("/receitas-avulsas");
  return result;
}
