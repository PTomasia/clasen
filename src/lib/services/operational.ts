import { and, desc, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import {
  CHECK_PERIODS,
  MAX_GARGALOS,
  type CheckPeriod,
} from "../constants";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface OperationalCheckInput {
  referenceMonth: string; // YYYY-MM
  period: CheckPeriod; // meio_mes | fim_mes

  // Notas 1-5
  notaExecucaoDireta: number;
  notaRevisao: number;
  notaDirecaoCriativa: number;
  notaEnergia: number;
  notaCapacidade: number;

  // Carga da Gabi (manual)
  entregasExecutadasGabi?: number | null;

  // Seleções
  gargalos?: string[];
  clientesPesadasIds?: number[];
  motivosPeso?: string[];
  comentarioClientesPesadas?: string | null;
  comentario?: string | null;

  // Carga planejada/contratada (snapshot editável)
  postsTotais?: number | null;
  unidadesOperacionais?: number | null;
  carrosseis?: number | null;
  reels?: number | null;
  estaticos?: number | null;
  criativosTrafego?: number | null;
  avulsos?: number | null;

  // Revisão e retrabalho (manual)
  copysDevolvidas?: number | null;
  designsRefeitos?: number | null;
  postsRevisadosGabi?: number | null;
  postsRevisadosPedro?: number | null;
}

export interface OperationalCheckRow {
  id: number;
  referenceMonth: string;
  period: CheckPeriod;
  notaExecucaoDireta: number;
  notaRevisao: number;
  notaDirecaoCriativa: number;
  notaEnergia: number;
  notaCapacidade: number;
  entregasExecutadasGabi: number | null;
  gargalos: string[];
  clientesPesadasIds: number[];
  motivosPeso: string[];
  comentarioClientesPesadas: string | null;
  comentario: string | null;
  postsTotais: number | null;
  unidadesOperacionais: number | null;
  carrosseis: number | null;
  reels: number | null;
  estaticos: number | null;
  criativosTrafego: number | null;
  avulsos: number | null;
  copysDevolvidas: number | null;
  designsRefeitos: number | null;
  postsRevisadosGabi: number | null;
  postsRevisadosPedro: number | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Serialização JSON ──────────────────────────────────────────────────────────

function serializeArray(arr: unknown[] | null | undefined): string | null {
  if (!arr || arr.length === 0) return null;
  return JSON.stringify(arr);
}

function parseArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function toRow(r: any): OperationalCheckRow {
  return {
    id: r.id,
    referenceMonth: r.referenceMonth,
    period: r.period as CheckPeriod,
    notaExecucaoDireta: r.notaExecucaoDireta,
    notaRevisao: r.notaRevisao,
    notaDirecaoCriativa: r.notaDirecaoCriativa,
    notaEnergia: r.notaEnergia,
    notaCapacidade: r.notaCapacidade,
    entregasExecutadasGabi: r.entregasExecutadasGabi ?? null,
    gargalos: parseArray<string>(r.gargalos),
    clientesPesadasIds: parseArray<number>(r.clientesPesadasIds),
    motivosPeso: parseArray<string>(r.motivosPeso),
    comentarioClientesPesadas: r.comentarioClientesPesadas ?? null,
    comentario: r.comentario ?? null,
    postsTotais: r.postsTotais ?? null,
    unidadesOperacionais: r.unidadesOperacionais ?? null,
    carrosseis: r.carrosseis ?? null,
    reels: r.reels ?? null,
    estaticos: r.estaticos ?? null,
    criativosTrafego: r.criativosTrafego ?? null,
    avulsos: r.avulsos ?? null,
    copysDevolvidas: r.copysDevolvidas ?? null,
    designsRefeitos: r.designsRefeitos ?? null,
    postsRevisadosGabi: r.postsRevisadosGabi ?? null,
    postsRevisadosPedro: r.postsRevisadosPedro ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ─── Validação ──────────────────────────────────────────────────────────────────

const NOTA_FIELDS: Array<[keyof OperationalCheckInput, string]> = [
  ["notaExecucaoDireta", "nota de execução direta"],
  ["notaRevisao", "nota de revisão"],
  ["notaDirecaoCriativa", "nota de direção criativa"],
  ["notaEnergia", "nota de energia"],
  ["notaCapacidade", "nota de capacidade"],
];

const NUMERIC_FIELDS: Array<[keyof OperationalCheckInput, string]> = [
  ["entregasExecutadasGabi", "entregas executadas pela Gabi"],
  ["postsTotais", "posts totais"],
  ["unidadesOperacionais", "unidades operacionais"],
  ["carrosseis", "carrosséis"],
  ["reels", "reels"],
  ["estaticos", "estáticos"],
  ["criativosTrafego", "criativos de tráfego"],
  ["avulsos", "avulsos"],
  ["copysDevolvidas", "copys devolvidas"],
  ["designsRefeitos", "designs refeitos"],
  ["postsRevisadosGabi", "posts revisados pela Gabi"],
  ["postsRevisadosPedro", "posts revisados pelo Pedro"],
];

function validateInput(input: OperationalCheckInput): void {
  if (!/^\d{4}-\d{2}$/.test(input.referenceMonth)) {
    throw new Error("mês de referência inválido (use YYYY-MM)");
  }
  if (!(CHECK_PERIODS as readonly string[]).includes(input.period)) {
    throw new Error("período inválido (use 'meio_mes' ou 'fim_mes')");
  }
  for (const [field, label] of NOTA_FIELDS) {
    const v = input[field] as number;
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      throw new Error(`${label} deve ser um inteiro entre 1 e 5`);
    }
  }
  if ((input.gargalos?.length ?? 0) > MAX_GARGALOS) {
    throw new Error(`selecione no máximo ${MAX_GARGALOS} gargalos`);
  }
  for (const [field, label] of NUMERIC_FIELDS) {
    const v = input[field] as number | null | undefined;
    if (v == null) continue;
    if (typeof v !== "number" || Number.isNaN(v) || v < 0) {
      throw new Error(`${label} não pode ser negativo`);
    }
  }
}

// ─── Mapeia input → colunas (sem id/datas) ──────────────────────────────────────

function toValues(input: OperationalCheckInput) {
  return {
    referenceMonth: input.referenceMonth,
    period: input.period,
    notaExecucaoDireta: input.notaExecucaoDireta,
    notaRevisao: input.notaRevisao,
    notaDirecaoCriativa: input.notaDirecaoCriativa,
    notaEnergia: input.notaEnergia,
    notaCapacidade: input.notaCapacidade,
    entregasExecutadasGabi: input.entregasExecutadasGabi ?? null,
    gargalos: serializeArray(input.gargalos),
    clientesPesadasIds: serializeArray(input.clientesPesadasIds),
    motivosPeso: serializeArray(input.motivosPeso),
    comentarioClientesPesadas: input.comentarioClientesPesadas?.trim() || null,
    comentario: input.comentario?.trim() || null,
    postsTotais: input.postsTotais ?? null,
    unidadesOperacionais: input.unidadesOperacionais ?? null,
    carrosseis: input.carrosseis ?? null,
    reels: input.reels ?? null,
    estaticos: input.estaticos ?? null,
    criativosTrafego: input.criativosTrafego ?? null,
    avulsos: input.avulsos ?? null,
    copysDevolvidas: input.copysDevolvidas ?? null,
    designsRefeitos: input.designsRefeitos ?? null,
    postsRevisadosGabi: input.postsRevisadosGabi ?? null,
    postsRevisadosPedro: input.postsRevisadosPedro ?? null,
  };
}

// ─── createOrUpdateOperationalCheck ─────────────────────────────────────────────
// Upsert por (referenceMonth, period): só existe um check por período/mês.

export async function createOrUpdateOperationalCheck(
  db: any,
  input: OperationalCheckInput
): Promise<OperationalCheckRow> {
  validateInput(input);

  const existing = await db
    .select()
    .from(schema.operationalChecks)
    .where(
      and(
        eq(schema.operationalChecks.referenceMonth, input.referenceMonth),
        eq(schema.operationalChecks.period, input.period)
      )
    )
    .get();

  if (existing) {
    await db
      .update(schema.operationalChecks)
      .set({ ...toValues(input), updatedAt: sql`(datetime('now'))` })
      .where(eq(schema.operationalChecks.id, existing.id))
      .run();
    const updated = await db
      .select()
      .from(schema.operationalChecks)
      .where(eq(schema.operationalChecks.id, existing.id))
      .get();
    return toRow(updated);
  }

  const inserted = await db
    .insert(schema.operationalChecks)
    .values(toValues(input))
    .returning()
    .get();

  return toRow(inserted);
}

// ─── Leitura ────────────────────────────────────────────────────────────────────

export async function getOperationalChecks(db: any): Promise<OperationalCheckRow[]> {
  const rows = await db
    .select()
    .from(schema.operationalChecks)
    .orderBy(desc(schema.operationalChecks.referenceMonth), desc(schema.operationalChecks.id))
    .all();
  return rows.map(toRow);
}

export async function getOperationalCheck(
  db: any,
  id: number
): Promise<OperationalCheckRow | null> {
  const row = await db
    .select()
    .from(schema.operationalChecks)
    .where(eq(schema.operationalChecks.id, id))
    .get();
  return row ? toRow(row) : null;
}

export async function deleteOperationalCheck(db: any, id: number): Promise<void> {
  await db.delete(schema.operationalChecks).where(eq(schema.operationalChecks.id, id)).run();
}
