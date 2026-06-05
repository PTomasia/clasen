import { addMonths, parseISO, format } from "date-fns";
import { calcularTotalPostsEquivalentes } from "./calculations";

// Teto padrão de reajuste de preço (% de aumento máximo sugerido).
export const MAX_REAJUSTE_PERCENT = 40;

// ─── Próximo Reajuste ─────────────────────────────────────────────────────────
// 6 meses após lastAdjustmentDate (ou startDate se nunca ajustado)

export function calcularProximoReajuste(
  startDate: string,
  lastAdjustmentDate: string | null
): string {
  const baseDate = parseISO(lastAdjustmentDate ?? startDate);
  return format(addMonths(baseDate, 6), "yyyy-MM-dd");
}

// ─── Sugestão de Reajuste ─────────────────────────────────────────────────────
// valor_ideal = targetCostPerPost × posts_equivalentes
// Se ideal > atual × (1 + maxPercent/100), cap no teto.
// Se $/post já ≥ target, retorna null (sem sugestão).

interface SugestaoInput {
  planValue: number;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  targetCostPerPost: number;
  maxPercent?: number; // default: MAX_REAJUSTE_PERCENT (40)
}

interface SugestaoResult {
  suggestedValue: number | null;
  percentChange: number;
  capped: boolean;
}

export function calcularSugestaoReajuste(input: SugestaoInput): SugestaoResult {
  const maxPct = input.maxPercent ?? MAX_REAJUSTE_PERCENT;

  const postsEq = calcularTotalPostsEquivalentes({
    carrossel: input.postsCarrossel,
    reels: input.postsReels,
    estatico: input.postsEstatico,
  });

  // Sem posts de conteúdo → sem sugestão
  if (postsEq === 0) {
    return { suggestedValue: null, percentChange: 0, capped: false };
  }

  const idealValue = input.targetCostPerPost * postsEq;

  // Já está acima do alvo → sem sugestão de aumento
  if (idealValue <= input.planValue) {
    return { suggestedValue: null, percentChange: 0, capped: false };
  }

  const cappedValue = Math.round(input.planValue * (1 + maxPct / 100) * 100) / 100;
  const roundedIdeal = Math.round(idealValue * 100) / 100;

  if (roundedIdeal <= cappedValue) {
    // Aumento dentro do teto
    const pct = Math.round(((roundedIdeal / input.planValue) - 1) * 10000) / 100;
    return { suggestedValue: roundedIdeal, percentChange: pct, capped: false };
  }

  // Cap no teto
  return { suggestedValue: cappedValue, percentChange: maxPct, capped: true };
}
