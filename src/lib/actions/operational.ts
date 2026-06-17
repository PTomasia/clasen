"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import {
  createOrUpdateOperationalCheck,
  deleteOperationalCheck as deleteCheckService,
  getOperationalChecks,
  type OperationalCheckInput,
} from "../services/operational";
import { getCargaPlanejada, pickLatestCheck } from "../queries/operational";
import { buildOperationalReportMarkdown } from "../operational-report/build-operational-report";
import { REVALIDATE_PATHS } from "../constants";

function revalidateAll() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

export async function createOperationalCheckAction(input: OperationalCheckInput) {
  const row = await createOrUpdateOperationalCheck(db as any, input);
  revalidateAll();
  return { checkId: row.id };
}

export async function deleteOperationalCheckAction(id: number) {
  await deleteCheckService(db as any, id);
  revalidateAll();
}

// Pré-preenchimento do formulário: carga planejada/contratada do mês informado.
export async function getCargaPlanejadaAction(month: string) {
  return getCargaPlanejada(db as any, month);
}

// Gera o relatório operacional em Markdown. checkId opcional — sem ele, usa o
// check mais recente. O "anterior" é o check do mesmo período no mês anterior.
export async function exportOperationalReportAction(checkId?: number): Promise<string> {
  const checks = await getOperationalChecks(db);
  if (checks.length === 0) {
    throw new Error("nenhum check operacional registrado ainda");
  }

  const target =
    checkId != null ? checks.find((c) => c.id === checkId) : pickLatestCheck(checks);
  if (!target) {
    throw new Error("check operacional não encontrado");
  }

  const previousCheck =
    checks
      .filter((c) => c.period === target.period && c.referenceMonth < target.referenceMonth)
      .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth))[0] ?? null;

  // Resolve nomes das clientes pesadas (preserva a ordem selecionada).
  let clientesPesadasNomes: string[] = [];
  if (target.clientesPesadasIds.length > 0) {
    const rows = await db
      .select({ id: schema.clients.id, name: schema.clients.name })
      .from(schema.clients)
      .where(inArray(schema.clients.id, target.clientesPesadasIds))
      .all();
    const nameById = new Map(rows.map((r) => [r.id, r.name]));
    clientesPesadasNomes = target.clientesPesadasIds
      .map((id) => nameById.get(id))
      .filter((n): n is string => !!n);
  }

  return buildOperationalReportMarkdown({
    now: new Date(),
    check: target,
    previousCheck,
    clientesPesadasNomes,
  });
}
