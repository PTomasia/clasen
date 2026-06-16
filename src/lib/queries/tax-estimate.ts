import { db } from "../db";
import * as schema from "../db/schema";
import { format } from "date-fns";
import { FINANCIAL_DATA_START, SIMPLES_NACIONAL_INICIO } from "../constants";
import { FINANCIAL_PARAMS } from "../cfo-export/financial-params";
import {
  aggregateMrr,
  type PlanForMrr,
  type PaymentForMrr,
} from "./dashboard";
import {
  calcDasEstimado,
  calcEstimativaTributaria,
  calcRBT12,
  type EstimativaTributaria,
} from "../utils/simples-nacional";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ReceitaCompetenciaMes {
  month: string; // YYYY-MM
  receitaBruta: number; // MRR recorrente (competência) + avulsas (competência)
}

export interface TaxEstimateData {
  mesApuracao: string; // YYYY-MM
  estimativa: EstimativaTributaria;
  dasPorMes: Record<string, number>; // month → DAS estimado (p/ DRE)
}

interface RevenueCompetenciaInput {
  date: string; // YYYY-MM-DD
  amount: number;
}

// ─── Receita por competência (série mensal) ───────────────────────────────────
// Receita bruta de cada mês = MRR recorrente (reusa aggregateMrr: meses passados =
// pago+pendente, mês corrente = planos ativos contratados) + avulsas por
// competência (soma one_time_revenues pelo mês do campo `date`, independente de
// isPaid — competência, não caixa).

export function aggregateReceitaCompetencia(input: {
  plans: PlanForMrr[];
  payments: PaymentForMrr[];
  revenues: RevenueCompetenciaInput[];
  today: Date;
  cutoff: string; // FINANCIAL_DATA_START (YYYY-MM-DD)
  monthsBack?: number;
}): ReceitaCompetenciaMes[] {
  const { plans, payments, revenues, today, cutoff, monthsBack = 13 } = input;

  const mrr = aggregateMrr({ plans, payments, today, cutoff, monthsBack });

  // Avulsas por competência (mês do campo date), respeitando o cutoff.
  const avulsasByMonth = new Map<string, number>();
  for (const r of revenues) {
    if (r.date < cutoff) continue;
    const m = r.date.slice(0, 7);
    avulsasByMonth.set(m, (avulsasByMonth.get(m) ?? 0) + r.amount);
  }

  return mrr.map((p) => ({
    month: p.month,
    receitaBruta: p.value + (avulsasByMonth.get(p.month) ?? 0),
  }));
}

// ─── Monta a estimativa tributária a partir da série ──────────────────────────

export function buildTaxEstimate(input: {
  series: ReceitaCompetenciaMes[];
  mesApuracao: string; // YYYY-MM
  cutoffMonth: string; // YYYY-MM
  proLaboreContabilRate: number;
  taxRateLegacy?: number;
}): TaxEstimateData {
  const { series, mesApuracao, cutoffMonth, proLaboreContabilRate, taxRateLegacy } = input;

  const byMonth = new Map(series.map((s) => [s.month, s.receitaBruta]));
  const receitaBrutaMes = byMonth.get(mesApuracao) ?? 0;

  const anteriores = (m: string) =>
    series
      .filter((s) => s.month >= cutoffMonth && s.month < m)
      .map((s) => s.receitaBruta);

  const estimativa = calcEstimativaTributaria({
    receitaBrutaMes,
    receitasMesesAnteriores: anteriores(mesApuracao),
    proLaboreContabilRate,
    taxRateLegacy,
  });

  // DAS estimado de cada mês em operação (para a DRE mês a mês).
  const dasPorMes: Record<string, number> = {};
  for (const s of series) {
    if (s.month < cutoffMonth) continue;
    const { rbt12 } = calcRBT12({
      receitasMesesAnteriores: anteriores(s.month),
      receitaMesApuracao: s.receitaBruta,
    });
    dasPorMes[s.month] = calcDasEstimado({
      receitaBrutaMes: s.receitaBruta,
      rbt12,
    }).das;
  }

  return { mesApuracao, estimativa, dasPorMes };
}

// ─── Query (IO) ───────────────────────────────────────────────────────────────

export async function getTaxEstimate(): Promise<TaxEstimateData> {
  const [plans, payments, revenues] = await Promise.all([
    db.select().from(schema.subscriptionPlans).all(),
    db.select().from(schema.planPayments).all(),
    db.select().from(schema.oneTimeRevenues).all(),
  ]);

  const today = new Date();
  const series = aggregateReceitaCompetencia({
    plans: plans as unknown as PlanForMrr[],
    payments: payments as unknown as PaymentForMrr[],
    revenues: revenues as unknown as RevenueCompetenciaInput[],
    today,
    cutoff: FINANCIAL_DATA_START,
  });

  return buildTaxEstimate({
    series,
    mesApuracao: format(today, "yyyy-MM"),
    // RBT12/DAS contam a partir da abertura do CNPJ atual (jun/2026), não do
    // início dos dados financeiros (jan/2026) — receita do CNPJ antigo não entra.
    cutoffMonth: SIMPLES_NACIONAL_INICIO,
    proLaboreContabilRate: FINANCIAL_PARAMS.proLaboreContabilRate,
    taxRateLegacy: FINANCIAL_PARAMS.taxRate,
  });
}
