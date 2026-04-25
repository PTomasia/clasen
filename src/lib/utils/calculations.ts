import { addMonths, differenceInMonths, format, getDaysInMonth, parseISO } from "date-fns";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface PostComposition {
  carrossel: number;
  reels: number;
  estatico: number;
  trafego?: number;
}

interface CustoPostInput extends PostComposition {
  valor: number;
}

// ─── $/post ────────────────────────────────────────────────────────────────────
// Fórmula: valor / (carrosseis + reels + estático × 0.5)
// Estático vale 0,5x — exige menos trabalho
// Tráfego NÃO entra no denominador
// Retorna null se não há posts de conteúdo

export function calcularCustoPost(input: CustoPostInput): number | null {
  const denominador = calcularTotalPostsEquivalentes(input);
  if (denominador === 0) return null;
  return input.valor / denominador;
}

// ─── Total de Posts Equivalentes ───────────────────────────────────────────────

export function calcularTotalPostsEquivalentes(
  posts: Pick<PostComposition, "carrossel" | "reels" | "estatico">
): number {
  return posts.carrossel + posts.reels + posts.estatico * 0.5;
}

// ─── Permanência (Tenure) ──────────────────────────────────────────────────────
// Meses calendário completos (floor) entre start_date e (end_date ou hoje)

export function calcularPermanencia(
  startDate: string,
  endDate: string | null | undefined
): number {
  const start = parseISO(startDate);
  const end = endDate ? parseISO(endDate) : new Date();
  return differenceInMonths(end, start);
}

// ─── Status de Pagamento ───────────────────────────────────────────────────────

export type StatusPagamento = "em_dia" | "atrasado" | "sem_pagamento";

export function calcularStatusPagamento(
  nextPaymentDate: string | null | undefined
): StatusPagamento {
  if (!nextPaymentDate) return "sem_pagamento";

  // Comparar strings ISO diretamente (YYYY-MM-DD é lexicograficamente ordenável)
  // Evita problemas de timezone com Date objects
  const todayStr = format(new Date(), "yyyy-MM-dd");
  return nextPaymentDate >= todayStr ? "em_dia" : "atrasado";
}

// ─── Próximo vencimento ────────────────────────────────────────────────────────
// Dada uma data-base e o(s) dia(s) de vencimento, retorna o próximo vencimento
// estritamente APÓS a data-base. Suporta 1 ou 2 vencimentos por mês.
// Respeita meses curtos: dia 30 em fevereiro → último dia do mês.

export function calcularProximoVencimento(
  fromDate: string,
  billingDay1: number,
  billingDay2?: number | null
): string {
  const base = parseISO(fromDate);
  const fromDay = base.getDate();

  if (billingDay2) {
    const [earlier, later] =
      billingDay1 < billingDay2 ? [billingDay1, billingDay2] : [billingDay2, billingDay1];

    if (fromDay < later) {
      const maxDay = getDaysInMonth(base);
      const actualDay = Math.min(later, maxDay);
      return format(
        new Date(base.getFullYear(), base.getMonth(), actualDay),
        "yyyy-MM-dd"
      );
    }
    const nextMonth = addMonths(base, 1);
    const maxDay = getDaysInMonth(nextMonth);
    const actualDay = Math.min(earlier, maxDay);
    return format(
      new Date(nextMonth.getFullYear(), nextMonth.getMonth(), actualDay),
      "yyyy-MM-dd"
    );
  }

  const nextMonth = addMonths(base, 1);
  const maxDay = getDaysInMonth(nextMonth);
  const actualDay = Math.min(billingDay1, maxDay);
  return format(
    new Date(nextMonth.getFullYear(), nextMonth.getMonth(), actualDay),
    "yyyy-MM-dd"
  );
}

// ─── Mediana ───────────────────────────────────────────────────────────────────
// SQLite não tem MEDIAN — calculamos em TypeScript

export function calcularMediana(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }

  return (sorted[mid - 1] + sorted[mid]) / 2;
}
