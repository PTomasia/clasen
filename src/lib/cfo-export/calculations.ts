import type { PnLData, PnLRow } from "../queries/profit-and-loss";
import type { FinancialParams } from "./financial-params";

// ─── DRE Mensal ───────────────────────────────────────────────────────────────

export interface DreRow {
  month: string;
  label: string;
  receitaRecorrente: number;
  receitaAvulsa: number;
  receitaTotal: number;
  tributos: number;
  despesas: number;
  proLabore: number;
  resultado: number;
}

export function calcDreRow(pnl: PnLRow, params: FinancialParams): DreRow {
  const tributos = round2(pnl.receitaTotal * params.taxRate);
  const proLabore = pnl.receitaTotal === 0 && pnl.despesaTotal === 0 ? 0 : params.proLaboreMonthly;
  const resultado = round2(pnl.receitaTotal - tributos - pnl.despesaTotal - proLabore);
  return {
    month: pnl.month,
    label: pnl.label,
    receitaRecorrente: pnl.receitaRecorrente,
    receitaAvulsa: pnl.receitaAvulsa,
    receitaTotal: pnl.receitaTotal,
    tributos,
    despesas: pnl.despesaTotal,
    proLabore,
    resultado,
  };
}

export function calcDre12m(pnl: PnLData, params: FinancialParams): DreRow[] {
  return pnl.rows.map((row) => calcDreRow(row, params));
}

// ─── Ponto de Equilíbrio ──────────────────────────────────────────────────────
// breakeven = (despesas + proLabore) / (1 - taxRate)
// usa média de despesas dos últimos 3 meses com atividade

export function calcAvgDespesas3m(pnl: PnLData): number {
  const ativos = pnl.rows.filter((r) => r.receitaTotal > 0 || r.despesaTotal > 0);
  const last3 = ativos.slice(-3);
  if (last3.length === 0) return 0;
  const sum = last3.reduce((acc, r) => acc + r.despesaTotal, 0);
  return round2(sum / last3.length);
}

export function calcBreakeven(
  avgDespesas: number,
  params: FinancialParams
): number {
  const fixo = avgDespesas + params.proLaboreMonthly;
  return round2(fixo / (1 - params.taxRate));
}

// ─── Gap até a meta ───────────────────────────────────────────────────────────

export interface GapResult {
  gap: number;
  clientesEquivalentes: number;
}

export function calcGapToTarget(
  currentReceita: number,
  ticketMedio: number,
  params: FinancialParams
): GapResult {
  const gap = Math.max(0, params.monthlyRevenueTarget - currentReceita);
  const clientesEquivalentes = ticketMedio > 0 ? Math.ceil(gap / ticketMedio) : 0;
  return { gap: round2(gap), clientesEquivalentes };
}

// ─── Resumo de Reajustes ──────────────────────────────────────────────────────

export interface PlanForReajuste {
  id: number;
  clientName: string;
  planValue: number;
  status: string;
  endDate: string | null;
  adjustmentSuggestion: {
    suggestedValue: number | null;
    percentChange: number;
    capped: boolean;
  } | null;
}

export interface ReajusteSummary {
  mrrAtual: number;
  mrrPrevisto: number;
  diferenca: number;
  planosComReajuste: Array<{
    clientName: string;
    valorAtual: number;
    valorProposto: number;
    diferenca: number;
    percentChange: number;
    capped: boolean;
  }>;
}

export function calcReajusteSummary(plans: PlanForReajuste[]): ReajusteSummary {
  const ativos = plans.filter((p) => p.status === "ativo" && p.endDate === null);

  let mrrAtual = 0;
  let mrrPrevisto = 0;
  const planosComReajuste: ReajusteSummary["planosComReajuste"] = [];

  for (const p of ativos) {
    mrrAtual += p.planValue;
    const proposto = p.adjustmentSuggestion?.suggestedValue ?? p.planValue;
    mrrPrevisto += proposto;

    if (
      p.adjustmentSuggestion &&
      p.adjustmentSuggestion.suggestedValue !== null &&
      p.adjustmentSuggestion.suggestedValue > p.planValue
    ) {
      planosComReajuste.push({
        clientName: p.clientName,
        valorAtual: p.planValue,
        valorProposto: p.adjustmentSuggestion.suggestedValue,
        diferenca: round2(p.adjustmentSuggestion.suggestedValue - p.planValue),
        percentChange: p.adjustmentSuggestion.percentChange,
        capped: p.adjustmentSuggestion.capped,
      });
    }
  }

  return {
    mrrAtual: round2(mrrAtual),
    mrrPrevisto: round2(mrrPrevisto),
    diferenca: round2(mrrPrevisto - mrrAtual),
    planosComReajuste,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
