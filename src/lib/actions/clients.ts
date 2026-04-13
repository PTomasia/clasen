"use server";

import { db } from "../db";
import { getClientDetail } from "../services/clients";

export async function getClientDetailAction(clientId: number) {
  const result = await getClientDetail(db as any, clientId);
  if (!result) throw new Error("cliente não encontrado");
  return result;
}
