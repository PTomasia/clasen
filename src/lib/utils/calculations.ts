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

// ─── Unidades Operacionais (UO) ────────────────────────────────────────────────
// Métrica gerencial INTERNA de carga operacional de SOCIAL MEDIA (não afeta $/post,
// que continua na contagem cheia). Base: carrossel e reels valem 1, estático 0,5.
// Tráfego NÃO entra: é um setor à parte, não consome a operação de social media.
// O "redutor" é um peso por tipo (pesoCarrossel/pesoReels, default 1) ajustável por
// plano — ex.: produção simplificada ("só design") pesa 0,5; reels médios, 0,75.

export function calcularUnidadesOperacionais(
  posts: PostComposition,
  pesos?: { pesoCarrossel?: number; pesoReels?: number }
): number {
  const pesoCarrossel = pesos?.pesoCarrossel ?? 1;
  const pesoReels = pesos?.pesoReels ?? 1;
  // posts.trafego é intencionalmente ignorado (setor à parte, não é social media).
  return (
    posts.carrossel * pesoCarrossel +
    posts.reels * pesoReels +
    posts.estatico * 0.5
  );
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
  nextPaymentDate: string | null | undefined,
  gapsCount?: number
): StatusPagamento {
  if (!nextPaymentDate) return "sem_pagamento";

  // Quando os gaps foram computados, eles são a fonte da verdade: um mês só está
  // "em aberto" se não foi pago NEM congelado (gaps já excluem meses skipped e
  // pagos). Logo gapsCount=0 ⇒ em dia — mesmo que nextPaymentDate tenha ficado no
  // passado por não ter sido avançado após o congelamento (caso Dara/Maju). E
  // gapsCount>0 ⇒ atrasado mesmo com próximo vencimento futuro (caso Gabriele:
  // pagar o mês recente sem fechar os anteriores não "limpa" o atraso).
  if (gapsCount !== undefined) return gapsCount > 0 ? "atrasado" : "em_dia";

  // Sem gaps computados (ex.: plano sem dia de vencimento): cai no nextPaymentDate.
  // Comparar strings ISO diretamente (YYYY-MM-DD é lexicograficamente ordenável)
  // evita problemas de timezone com Date objects.
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

// ─── Permanência considerando múltiplos planos ────────────────────────────────
// `clientSince` (override manual) prevalece sobre o menor startDate dos planos.
// Cliente é "ativo" se algum plano não tem endDate. Retorna null quando não há
// data detectável (sem planos e sem clientSince, ou inativo sem endDate registrado).

export function calcularPermanenciaCliente(
  client: { clientSince: string | null | undefined },
  plans: ReadonlyArray<{ startDate: string; endDate: string | null | undefined }>,
  referenceDate: Date
): number | null {
  const isAtivo = plans.some((p) => !p.endDate);
  const firstStart =
    client.clientSince ?? plans.map((p) => p.startDate).sort()[0];

  if (!firstStart) return null;

  if (isAtivo) {
    return differenceInMonths(referenceDate, parseISO(firstStart));
  }

  const lastEnd = plans
    .filter((p) => p.endDate)
    .map((p) => p.endDate as string)
    .sort()
    .reverse()[0];

  if (!lastEnd) return null;
  return differenceInMonths(parseISO(lastEnd), parseISO(firstStart));
}

// ─── Comparação de data ISO vs hoje ───────────────────────────────────────────
// Comparação lexicográfica YYYY-MM-DD (mesmo padrão de calcularStatusPagamento).
// Hoje não conta como atrasado.

export function isDataPassada(
  dateStr: string,
  referenceDate?: string
): boolean {
  const today = referenceDate ?? format(new Date(), "yyyy-MM-dd");
  return dateStr < today;
}

// ─── Validação de dia(s) de vencimento ────────────────────────────────────────
// billingCycleDays = dia do mês (1-31), NÃO intervalo. Suporta 1 ou 2 dias
// diferentes. Garante consistência entre createPlan, updatePlan, updateBillingDays.

export function assertBillingDays(
  day1: number | null | undefined,
  day2: number | null | undefined
): void {
  if (day1 == null) {
    if (day2 != null) {
      throw new Error("segundo dia de vencimento informado sem o primeiro");
    }
    return;
  }
  if (!Number.isInteger(day1) || day1 < 1 || day1 > 31) {
    throw new Error("dia de vencimento deve ser inteiro entre 1 e 31");
  }
  if (day2 != null) {
    if (!Number.isInteger(day2) || day2 < 1 || day2 > 31) {
      throw new Error("segundo dia de vencimento deve ser inteiro entre 1 e 31");
    }
    if (day2 === day1) {
      throw new Error("os dois dias de vencimento devem ser diferentes");
    }
  }
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
