// Gera o relatório operacional em Markdown copiável (Sprint 7), seguindo o
// template do PRD (8 seções). Espelha o padrão de lib/cfo-export/build-cfo-report.
// É puro: deriva score, status, decisões e dependência das funções de
// lib/utils/operational-metrics. Os nomes das clientes pesadas são resolvidos
// upstream (action) e passados em clientesPesadasNomes.

import type { OperationalCheckRow } from "../services/operational";
import {
  CHECK_PERIOD_LABELS,
  RATING_DESCRIPTIONS,
  AGENDA_STATUS_LABELS,
  NIVEL_QUALITATIVO_LABELS,
  type AgendaStatus,
} from "../constants";
import { formatMonth, formatUO } from "../utils/formatting";
import {
  calcScoreOperacional,
  interpretarScore,
  derivarStatusAgenda,
  sugerirDecisoes,
  avaliarDependencia,
  DECISOES_OPERACIONAIS,
} from "../utils/operational-metrics";

export interface BuildOperationalReportInput {
  now: Date;
  check: OperationalCheckRow;
  previousCheck?: OperationalCheckRow | null;
  clientesPesadasNomes?: string[];
}

// ─── Helpers de formatação ──────────────────────────────────────────────────────

function nFmt(value: number | null | undefined): string {
  return value == null ? "—" : String(value);
}

// Ordinal 1-5 da escala qualitativa → rótulo (Nada…Muito).
function qualFmt(value: number | null | undefined): string {
  if (value == null) return "—";
  return NIVEL_QUALITATIVO_LABELS[value as 1 | 2 | 3 | 4 | 5] ?? String(value);
}

function uoFmt(value: number | null | undefined): string {
  return value == null ? "—" : formatUO(value);
}

function scoreFmt(score: number): string {
  return score.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatDateTimeBR(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

const RISCO_POR_STATUS: Record<AgendaStatus, string> = {
  saudavel: "Baixo",
  atencao: "Médio",
  contencao: "Alto",
  critico: "Crítico",
};

const RECOMENDACAO_POR_STATUS: Record<AgendaStatus, string> = {
  saudavel: "Operação saudável — pode abrir agenda com organização.",
  atencao: "Operação boa, com pontos de atenção — manter agenda controlada.",
  contencao: "Operação no limite — pausar novas entradas e reduzir a carga da Gabi.",
  critico: "Operação crítica — conter entradas e redistribuir a carga com urgência.",
};

const COMPORTA_NOVAS_POR_STATUS: Record<AgendaStatus, string> = {
  saudavel: "Sim.",
  atencao: "Com ressalvas — manter a agenda controlada.",
  contencao: "Não no momento.",
  critico: "Não — operação em estado crítico.",
};

function nota(check: OperationalCheckRow, campo: keyof typeof RATING_DESCRIPTIONS, valor: number): string {
  const descricao = RATING_DESCRIPTIONS[campo][valor as 1 | 2 | 3 | 4 | 5] ?? "";
  return `${valor} — ${descricao}`;
}

// ─── Função principal ─────────────────────────────────────────────────────────

export function buildOperationalReportMarkdown(input: BuildOperationalReportInput): string {
  const { now, check, previousCheck = null, clientesPesadasNomes = [] } = input;

  const score = calcScoreOperacional({
    execucaoDireta: check.notaExecucaoDireta,
    revisao: check.notaRevisao,
    direcaoCriativa: check.notaDirecaoCriativa,
    energia: check.notaEnergia,
    capacidade: check.notaCapacidade,
  });
  const interp = interpretarScore(score);
  const statusAgenda = derivarStatusAgenda({
    notaCapacidade: check.notaCapacidade,
    score,
    unidadesOperacionais: check.unidadesOperacionais ?? 0,
    notaExecucaoDireta: check.notaExecucaoDireta,
  });
  const decisoesSugeridas = new Set(
    sugerirDecisoes({
      statusAgenda,
      score,
      notaExecucaoDireta: check.notaExecucaoDireta,
      notaRevisao: check.notaRevisao,
      gargalos: check.gargalos,
    })
  );
  const dependencia = avaliarDependencia(check, previousCheck);

  const sections = [
    // Cabeçalho
    [
      "# Relatório Operacional — Clasen Studio",
      "",
      `**Gerado em**: ${formatDateTimeBR(now)}`,
      `Período: ${CHECK_PERIOD_LABELS[check.period]}`,
      `Mês: ${formatMonth(check.referenceMonth)}`,
    ].join("\n"),

    // 1. Resumo executivo
    [
      "## 1. Resumo executivo",
      "",
      `Status geral: ${interp.label}`,
      `Score operacional: ${scoreFmt(score)} / 5,0`,
      `Gargalo principal: ${check.gargalos[0] ?? "—"}`,
      `Risco operacional: ${RISCO_POR_STATUS[statusAgenda]}`,
      `Recomendação: ${RECOMENDACAO_POR_STATUS[statusAgenda]}`,
    ].join("\n"),

    // 2. Produção (carga planejada/contratada)
    [
      "## 2. Produção (carga planejada/contratada)",
      "",
      `Posts totais: ${nFmt(check.postsTotais)}`,
      `Unidades operacionais: ${uoFmt(check.unidadesOperacionais)}`,
      `Carrosséis: ${nFmt(check.carrosseis)}`,
      `Reels: ${nFmt(check.reels)}`,
      `Estáticos: ${nFmt(check.estaticos)}`,
      `Criativos de tráfego: ${nFmt(check.criativosTrafego)}`,
      `Avulsos: ${nFmt(check.avulsos)}`,
      "",
      "> Os números acima refletem a carga **planejada/contratada** do mês (composição dos planos ativos + avulsos), não a contagem de entregas concluídas.",
    ].join("\n"),

    // 3. Carga da Gabi
    [
      "## 3. Carga da Gabi",
      "",
      `Entregas executadas pela Gabi: ${qualFmt(check.entregasExecutadasGabi)}`,
      `Nota de execução direta: ${nota(check, "execucaoDireta", check.notaExecucaoDireta)}`,
      `Nota de revisão: ${nota(check, "revisao", check.notaRevisao)}`,
      `Nota de direção criativa: ${nota(check, "direcaoCriativa", check.notaDirecaoCriativa)}`,
      `Nota de energia: ${nota(check, "energia", check.notaEnergia)}`,
      `Comentário: ${check.comentario ?? "—"}`,
    ].join("\n"),

    // 4. Revisão e retrabalho
    [
      "## 4. Revisão e retrabalho",
      "",
      `Copys devolvidas para refação: ${qualFmt(check.copysDevolvidas)}`,
      `Designs refeitos: ${qualFmt(check.designsRefeitos)}`,
      `Posts revisados pela Gabi: ${qualFmt(check.postsRevisadosGabi)}`,
      `Posts revisados pelo Pedro: ${qualFmt(check.postsRevisadosPedro)}`,
    ].join("\n"),

    // 5. Gargalos
    [
      "## 5. Gargalos",
      "",
      `Gargalos selecionados: ${check.gargalos.length ? check.gargalos.join(", ") : "—"}`,
      `Clientes mais pesadas: ${clientesPesadasNomes.length ? clientesPesadasNomes.join(", ") : "—"}`,
      `Motivos do peso: ${check.motivosPeso.length ? check.motivosPeso.join(", ") : "—"}`,
      `Comentário: ${check.comentarioClientesPesadas ?? "—"}`,
    ].join("\n"),

    // 6. Capacidade
    [
      "## 6. Capacidade",
      "",
      `Nota de capacidade para novas clientes: ${nota(check, "capacidade", check.notaCapacidade)}`,
      `Leitura: ${AGENDA_STATUS_LABELS[statusAgenda]}`,
      `A operação comporta novas clientes agora? ${COMPORTA_NOVAS_POR_STATUS[statusAgenda]}`,
    ].join("\n"),

    // 7. Decisões sugeridas (checklist; marcadas = sugeridas pelas regras)
    [
      "## 7. Decisões sugeridas",
      "",
      ...DECISOES_OPERACIONAIS.map(
        (d) => `- [${decisoesSugeridas.has(d) ? "x" : " "}] ${d}`
      ),
    ].join("\n"),

    // 8. Pergunta central
    [
      "## 8. Pergunta central",
      "",
      "A operação está reduzindo dependência da Gabi e do Pedro?",
      "",
      `Resposta: ${dependencia}`,
    ].join("\n"),
  ];

  return sections.join("\n\n");
}
