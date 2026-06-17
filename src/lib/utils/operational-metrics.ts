// Lógica pura da saúde operacional (Sprint 7). Score, interpretação, status da
// agenda, decisões sugeridas e leitura de dependência da Gabi. Sem I/O — testável
// isoladamente. A persistência fica em lib/services/operational.ts.

import {
  TETO_OPERACIONAL_UO,
  SCORE_BANDS,
  type ScoreBandKey,
  type AgendaStatus,
} from "../constants";

// ─── Score operacional ─────────────────────────────────────────────────────────

export interface NotasOperacionais {
  execucaoDireta: number;
  revisao: number;
  direcaoCriativa: number;
  energia: number;
  capacidade: number;
}

// Média simples das 5 notas (1-5), arredondada a 1 casa decimal.
export function calcScoreOperacional(notas: NotasOperacionais): number {
  const valores = [
    notas.execucaoDireta,
    notas.revisao,
    notas.direcaoCriativa,
    notas.energia,
    notas.capacidade,
  ];
  const soma = valores.reduce((a, b) => a + b, 0);
  return Math.round((soma / valores.length) * 10) / 10;
}

// ─── Interpretação do score ────────────────────────────────────────────────────

export interface ScoreInterpretation {
  key: ScoreBandKey;
  label: string;
}

// SCORE_BANDS está ordenado do maior limiar para o menor; pega a primeira faixa
// cujo `min` é <= score. A última faixa (min 0) sempre casa.
export function interpretarScore(score: number): ScoreInterpretation {
  const band =
    SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
  return { key: band.key, label: band.label };
}

// ─── Status da agenda ──────────────────────────────────────────────────────────
// Principal sinal: a nota de capacidade (percepção da Gabi sobre abrir agenda).
// As travas só PIORAM o status (nunca melhoram): os dados operacionais podem
// rebaixar a leitura otimista, mas não podem aliviá-la.

export interface StatusAgendaInput {
  notaCapacidade: number;
  score: number;
  unidadesOperacionais: number;
  notaExecucaoDireta: number;
  teto?: number;
}

const SEVERITY: AgendaStatus[] = ["saudavel", "atencao", "contencao", "critico"];

// Retorna o status mais severo entre os informados.
function pior(...statuses: AgendaStatus[]): AgendaStatus {
  return statuses.reduce((acc, s) =>
    SEVERITY.indexOf(s) > SEVERITY.indexOf(acc) ? s : acc
  );
}

export function derivarStatusAgenda(input: StatusAgendaInput): AgendaStatus {
  const {
    notaCapacidade,
    score,
    unidadesOperacionais,
    notaExecucaoDireta,
    teto = TETO_OPERACIONAL_UO,
  } = input;

  // Base pela nota de capacidade (5/4 = saudável, 3 = atenção, 2 = contenção, 1 = crítico).
  const base: AgendaStatus =
    notaCapacidade >= 4
      ? "saudavel"
      : notaCapacidade === 3
        ? "atencao"
        : notaCapacidade === 2
          ? "contencao"
          : "critico";

  const travas: AgendaStatus[] = [base];
  if (score < 2.8) travas.push("contencao"); // score geral baixo
  if (unidadesOperacionais > teto) travas.push("atencao"); // sobrecarga de UO
  if (notaExecucaoDireta <= 2) travas.push("atencao"); // Gabi executando demais
  if (notaExecucaoDireta === 1) travas.push("contencao"); // Gabi segurando a operação

  return pior(...travas);
}

// ─── Decisões sugeridas ────────────────────────────────────────────────────────
// Checklist completa da seção 7 do relatório; `sugerirDecisoes` devolve o
// subconjunto marcado pelas regras de status/gargalos.

export const DECISOES_OPERACIONAIS = [
  "Abrir agenda",
  "Manter agenda controlada",
  "Pausar novas entradas",
  "Acionar freela",
  "Testar segunda copy",
  "Testar segunda designer",
  "Melhorar briefing",
  "Rever cliente específica",
  "Reduzir carga da Gabi",
] as const;

export interface DecisoesInput {
  statusAgenda: AgendaStatus;
  score: number;
  notaExecucaoDireta: number;
  notaRevisao: number;
  gargalos: string[];
}

export function sugerirDecisoes(input: DecisoesInput): string[] {
  const { statusAgenda, notaExecucaoDireta, notaRevisao, gargalos } = input;
  const decisoes = new Set<string>();

  // Abertura/fechamento de agenda conforme o status.
  if (statusAgenda === "saudavel") decisoes.add("Abrir agenda");
  else if (statusAgenda === "atencao") decisoes.add("Manter agenda controlada");
  else decisoes.add("Pausar novas entradas"); // contenção | crítico

  // Gabi executando demais → aliviar a carga dela.
  if (notaExecucaoDireta <= 2) {
    decisoes.add("Reduzir carga da Gabi");
    decisoes.add("Acionar freela");
  }

  // Revisão pesada → reforçar produção conforme o gargalo.
  if (notaRevisao <= 2) {
    if (gargalos.includes("Copy")) decisoes.add("Testar segunda copy");
    if (gargalos.includes("Design")) decisoes.add("Testar segunda designer");
  }

  // Gargalos pontuais.
  if (gargalos.includes("Briefing")) decisoes.add("Melhorar briefing");
  if (gargalos.includes("Cliente específica")) decisoes.add("Rever cliente específica");

  return Array.from(decisoes);
}

// ─── Leitura de dependência (pergunta central) ─────────────────────────────────
// "A operação está reduzindo dependência da Gabi e do Pedro?" Notas mais ALTAS de
// execução/revisão/direção = menos dependência da Gabi. Compara com o período
// anterior (mesmo período do mês anterior, idealmente).

export interface CheckParaDependencia {
  notaExecucaoDireta: number;
  notaRevisao: number;
  notaDirecaoCriativa: number;
  entregasExecutadasGabi: number | null;
  postsRevisadosPedro: number | null;
}

export function avaliarDependencia(
  atual: CheckParaDependencia,
  anterior: CheckParaDependencia | null
): string {
  if (!anterior) {
    return "Sem base de comparação ainda (primeiro check registrado).";
  }

  const sinal = (c: CheckParaDependencia) =>
    c.notaExecucaoDireta + c.notaRevisao + c.notaDirecaoCriativa;
  const delta = sinal(atual) - sinal(anterior);

  if (delta > 0) {
    return "Sim — a dependência da Gabi está diminuindo: as notas de execução, revisão e direção criativa melhoraram em relação ao período anterior.";
  }
  if (delta < 0) {
    return "Não — a dependência da Gabi aumentou: as notas de execução, revisão e direção criativa pioraram em relação ao período anterior.";
  }
  return "Estável — sem mudança relevante na dependência da Gabi em relação ao período anterior.";
}
