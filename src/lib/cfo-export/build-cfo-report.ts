import type { PnLData, PnLRow } from "../queries/profit-and-loss";
import type { ExpenseRow } from "../services/expenses";
import type { RevenueRow } from "../services/revenues";
import { formatBRL, formatDate, formatMonth, formatPercentage } from "../utils/formatting";
import {
  calcBreakevenPlanejado,
  calcCenario,
  calcDreRow,
  calcGapToTarget,
  calcReajusteSummary,
  calcReservaPj,
  calcRespiro,
  type CenarioResult,
  type PlanForReajuste,
  type ReajusteSummary,
} from "./calculations";
import {
  FINANCIAL_PARAMS,
  PLANNED_FIXED_EXPENSES,
  PLANNED_FIXED_EXPENSES_LABELS,
  type FinancialParams,
} from "./financial-params";
import { formatDateTimeBR, mdHeader, mdTable } from "./format-utils";

// ─── Tipo do plano consumido (subset do getAllPlans) ──────────────────────────

export interface PlanForCfoReport extends PlanForReajuste {
  planType: string;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
  custoPost: number | null;
  nextPaymentDate: string | null;
  lastPaymentDate: string | null;
  statusPagamento: "em_dia" | "atrasado" | "sem_pagamento";
}

export interface BuildCfoReportInput {
  now: Date;
  pnl: PnLData;
  plans: PlanForCfoReport[];
  revenues: RevenueRow[];
  expenses: ExpenseRow[];
  params?: FinancialParams;
}

// ─── Função principal ─────────────────────────────────────────────────────────

export function buildCfoReportMarkdown(input: BuildCfoReportInput): string {
  const params = input.params ?? FINANCIAL_PARAMS;
  const reajustes = calcReajusteSummary(input.plans);

  const sections = [
    renderHeader(input.now),
    renderRecorrente(input.plans),
    renderReajustes(reajustes),
    renderAvulsas(input.revenues, input.now),
    renderDespesas(input.expenses, input.now),
    renderDre3m(input.pnl, params),
    renderCenarios(reajustes, params),
    renderResumoExecutivo(reajustes, input.plans, params),
    renderCaixaMesCorrente(input.pnl, params),
    renderParametros(params),
  ];
  return sections.filter(Boolean).join("\n\n");
}

// ─── Cabeçalho ────────────────────────────────────────────────────────────────

function renderHeader(now: Date): string {
  return [
    mdHeader(1, "Relatório Financeiro — Clasen Studio"),
    `**Gerado em**: ${formatDateTimeBR(now)}`,
    "**Contexto**: Clasen Studio é uma agência de marketing digital para psicólogas. Modelo de receita: planos recorrentes mensais + receitas avulsas. O relatório separa duas visões: **competência/MRR** (receita contratada, independente do recebimento) e **caixa** (valores efetivamente recebidos/pagos no mês). Use as duas para responder sobre saúde financeira (MRR) e fluxo do mês (caixa).",
  ].join("\n");
}

// ─── Seção 1: Receita Recorrente Ativa (competência) ─────────────────────────

function renderRecorrente(plans: PlanForCfoReport[]): string {
  const ativos = plans.filter((p) => p.status === "ativo" && p.endDate === null);

  if (ativos.length === 0) {
    return [
      mdHeader(2, "1. Receita Recorrente Ativa (competência)"),
      "_Nenhum plano ativo._",
    ].join("\n");
  }

  const rows: string[][] = [
    [
      "Cliente",
      "Plano",
      "Valor atual",
      "Valor c/ reajuste",
      "Status",
      "Vencimento",
      "Último pgto",
      "Posts",
      "$/post",
    ],
  ];

  for (const p of ativos) {
    const totalPosts = p.postsCarrossel + p.postsReels + p.postsEstatico + p.postsTrafego;
    const reajuste = p.adjustmentSuggestion?.suggestedValue ?? null;
    rows.push([
      p.clientName,
      p.planType,
      formatBRL(p.planValue),
      reajuste !== null ? formatBRL(reajuste) : "—",
      statusLabel(p.statusPagamento),
      p.nextPaymentDate ? formatDate(p.nextPaymentDate) : "—",
      p.lastPaymentDate ? formatDate(p.lastPaymentDate) : "—",
      String(totalPosts),
      p.custoPost !== null ? formatBRL(p.custoPost) : "—",
    ]);
  }

  const mrr = ativos.reduce((sum, p) => sum + p.planValue, 0);
  const ticketMedio = mrr / ativos.length;

  return [
    mdHeader(2, "1. Receita Recorrente Ativa (competência)"),
    mdTable(rows),
    "",
    `**TOTAL MRR (atual)**: ${formatBRL(mrr)} — ${ativos.length} planos ativos, ticket médio ${formatBRL(ticketMedio)}`,
  ].join("\n");
}

function statusLabel(s: PlanForCfoReport["statusPagamento"]): string {
  if (s === "em_dia") return "em dia";
  if (s === "atrasado") return "atrasado";
  return "sem pagamento";
}

// ─── Seção 2: Resumo de Reajustes ─────────────────────────────────────────────

function renderReajustes(summary: ReajusteSummary): string {
  const lines = [
    mdHeader(2, "2. Resumo de Reajustes"),
    `- **MRR atual**: ${formatBRL(summary.mrrAtual)}`,
    `- **MRR previsto se reajustes aceitos**: ${formatBRL(summary.mrrPrevisto)}`,
    `- **Diferença**: ${formatBRL(summary.diferenca)}`,
  ];

  if (summary.planosComReajuste.length === 0) {
    lines.push("", "_Nenhum reajuste pendente sugerido._");
    return lines.join("\n");
  }

  const rows: string[][] = [
    ["Cliente", "Valor atual", "Valor proposto", "Diferença R$", "Diferença %", "Capped?"],
  ];
  for (const r of summary.planosComReajuste) {
    rows.push([
      r.clientName,
      formatBRL(r.valorAtual),
      formatBRL(r.valorProposto),
      formatBRL(r.diferenca),
      `${r.percentChange.toFixed(2)}%`,
      r.capped ? "sim" : "não",
    ]);
  }
  lines.push("", mdTable(rows));
  return lines.join("\n");
}

// ─── Seção 3: Receitas Avulsas (últimos 3 meses) ──────────────────────────────

function renderAvulsas(revenues: RevenueRow[], now: Date): string {
  const cutoff = monthsAgo(now, 2); // YYYY-MM string
  const recent = revenues
    .filter((r) => r.date.slice(0, 7) >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date));

  const lines = [mdHeader(2, "3. Receitas Avulsas (últimos 3 meses)")];

  if (recent.length === 0) {
    lines.push("_Nenhuma receita avulsa nos últimos 3 meses._");
    return lines.join("\n");
  }

  const rows: string[][] = [["Data", "Cliente", "Serviço", "Valor", "Pago?"]];
  for (const r of recent) {
    const servico = r.channel ? `${r.product} (${r.channel})` : r.product;
    const cliente = r.clientName ?? "—";
    rows.push([
      formatDate(r.date),
      cliente,
      servico,
      formatBRL(r.amount),
      r.isPaid ? "sim" : "não",
    ]);
  }
  lines.push(mdTable(rows));

  const totalCompetencia = recent.reduce((s, r) => s + r.amount, 0);
  const totalCaixa = recent.filter((r) => r.isPaid).reduce((s, r) => s + r.amount, 0);
  const totalPendente = totalCompetencia - totalCaixa;
  lines.push(
    "",
    `**Total contratado/competência (3m)**: ${formatBRL(totalCompetencia)} • **Recebido/caixa**: ${formatBRL(totalCaixa)} • **Pendente**: ${formatBRL(totalPendente)}`
  );
  return lines.join("\n");
}

// ─── Seção 4: Despesas (últimos 3 meses) ──────────────────────────────────────

function renderDespesas(expenses: ExpenseRow[], now: Date): string {
  const cutoff = monthsAgo(now, 2);
  const recent = expenses
    .filter((e) => e.month >= cutoff)
    .sort((a, b) => (b.month === a.month ? b.id - a.id : b.month.localeCompare(a.month)));

  const lines = [mdHeader(2, "4. Despesas (últimos 3 meses)")];

  if (recent.length === 0) {
    lines.push("_Nenhuma despesa nos últimos 3 meses._");
    return lines.join("\n");
  }

  const rows: string[][] = [["Mês", "Categoria", "Descrição", "Valor", "Tipo", "Pago?"]];
  for (const e of recent) {
    const tipo = e.isRecurring
      ? "recorrente"
      : e.installmentsTotal && e.installmentsTotal > 1
        ? `parcela ${e.installmentNumber}/${e.installmentsTotal}`
        : "pontual";
    rows.push([
      formatMonth(e.month),
      e.category === "fixo" ? "fixo" : "variável",
      e.description,
      formatBRL(e.amount),
      tipo,
      e.isPaid ? "sim" : "não",
    ]);
  }
  lines.push(mdTable(rows));

  const totalCompetencia = recent.reduce((s, e) => s + e.amount, 0);
  const totalCaixa = recent.filter((e) => e.isPaid).reduce((s, e) => s + e.amount, 0);
  const totalPendente = totalCompetencia - totalCaixa;
  lines.push(
    "",
    `**Total competência (3m)**: ${formatBRL(totalCompetencia)} • **Pago/caixa**: ${formatBRL(totalCaixa)} • **Pendente**: ${formatBRL(totalPendente)}`
  );
  return lines.join("\n");
}

// ─── Seção 5: DRE Últimos 3 Meses (regime caixa) ─────────────────────────────

function renderDre3m(pnl: PnLData, params: FinancialParams): string {
  const last3 = pnl.rows.slice(-3);
  const dre = last3.map((row) => calcDreRow(row, params));
  const rows: string[][] = [
    [
      "Mês",
      "Rec. Recorrente",
      "Rec. Avulsa",
      "Receita Total",
      `Tributos (${(params.taxRate * 100).toFixed(0)}%)`,
      "Despesas",
      "Pró-labore",
      "Resultado",
    ],
  ];
  for (const r of dre) {
    rows.push([
      r.label,
      formatBRL(r.receitaRecorrente),
      formatBRL(r.receitaAvulsa),
      formatBRL(r.receitaTotal),
      formatBRL(r.tributos),
      formatBRL(r.despesas),
      formatBRL(r.proLabore),
      formatBRL(r.resultado),
    ]);
  }
  return [
    mdHeader(2, "5. DRE Últimos 3 Meses (regime caixa)"),
    "_Receitas e despesas conforme efetivamente recebidas/pagas no mês. Mostra a tendência recente do fluxo._",
    mdTable(rows),
  ].join("\n");
}

// ─── Seção 6: 3 Cenários (regime competência) ────────────────────────────────

function renderCenarios(
  reajustes: ReajusteSummary,
  params: FinancialParams
): string {
  const cenarios: CenarioResult[] = [
    calcCenario("Atual (MRR)", reajustes.mrrAtual, params),
    calcCenario("Pós-reajuste", reajustes.mrrPrevisto, params),
    calcCenario("Meta R$ 40k", params.monthlyRevenueTarget, params),
  ];

  const rows: string[][] = [
    ["Linha", ...cenarios.map((c) => c.label)],
    ["Receita bruta", ...cenarios.map((c) => formatBRL(c.receitaBruta))],
    [`Tributos (${(params.taxRate * 100).toFixed(0)}%)`, ...cenarios.map((c) => formatBRL(c.tributos))],
    ["Pró-labore", ...cenarios.map((c) => formatBRL(c.proLabore))],
    ["Despesas operacionais fixas", ...cenarios.map((c) => formatBRL(c.despesasFixas))],
    ["**Saída total**", ...cenarios.map((c) => formatBRL(c.saidaTotal))],
    ["**Resultado gerencial**", ...cenarios.map((c) => formatBRL(c.resultado))],
    ["Margem final", ...cenarios.map((c) => formatPercentage(c.margem * 100))],
    ["Sobra p/ reserva/reinvestimento", ...cenarios.map((c) => formatBRL(c.sobraReserva))],
  ];

  return [
    mdHeader(2, "6. DRE — 3 Cenários (regime competência)"),
    "_Receita = MRR contratado (independente de já ter sido recebido). Despesas = lista planejada (sem variáveis). Permite comparar saúde da empresa hoje, com reajustes aceitos, e na meta._",
    mdTable(rows),
  ].join("\n");
}

// ─── Seção 7: Resumo Executivo (gestão) ──────────────────────────────────────

function renderResumoExecutivo(
  reajustes: ReajusteSummary,
  plans: PlanForCfoReport[],
  params: FinancialParams
): string {
  const ativos = plans.filter((p) => p.status === "ativo" && p.endDate === null);
  const ticketMedio = ativos.length > 0 ? reajustes.mrrAtual / ativos.length : 0;
  const breakeven = calcBreakevenPlanejado(params);
  const respiro = calcRespiro(breakeven, params);
  const reservaPj = calcReservaPj(params);

  const gapAtual = calcGapToTarget(reajustes.mrrAtual, ticketMedio, params);
  const gapPosReajuste = calcGapToTarget(reajustes.mrrPrevisto, ticketMedio, params);

  return [
    mdHeader(2, "7. Resumo Executivo (gestão)"),
    "_Visão de saúde do negócio em regime de competência. Use estas métricas pra responder \"como estamos?\" e \"quanto precisamos crescer?\"._",
    "",
    `- **MRR atual**: ${formatBRL(reajustes.mrrAtual)}`,
    `- **MRR pós-reajuste**: ${formatBRL(reajustes.mrrPrevisto)}`,
    `- **Diferença dos reajustes**: ${formatBRL(reajustes.diferenca)}`,
    `- **Ponto de equilíbrio gerencial**: ${formatBRL(breakeven)} _((despesas fixas ${formatBRL(params.plannedFixedExpensesTotal)} + pró-labore ${formatBRL(params.proLaboreMonthly)}) / (1 - ${(params.taxRate * 100).toFixed(0)}%))_`,
    `- **Receita mínima de respiro**: ${formatBRL(respiro)} _(breakeven × ${(1 + params.respiroMargin).toFixed(1)} = ${(params.respiroMargin * 100).toFixed(0)}% acima do ponto de equilíbrio)_`,
    `- **Gap até meta de ${formatBRL(params.monthlyRevenueTarget)}**:`,
    `  - Com **MRR atual**: faltam ${formatBRL(gapAtual.gap)}${gapAtual.clientesEquivalentes > 0 ? ` ≈ +${gapAtual.clientesEquivalentes} clientes ao ticket médio (${formatBRL(ticketMedio)})` : ""}`,
    `  - Com **MRR pós-reajuste**: faltam ${formatBRL(gapPosReajuste.gap)}${gapPosReajuste.clientesEquivalentes > 0 ? ` ≈ +${gapPosReajuste.clientesEquivalentes} clientes` : ""}`,
    `- **Reserva PJ alvo (${params.reserveMonthsTarget} meses de custo fixo)**: ${formatBRL(reservaPj)}`,
  ].join("\n");
}

// ─── Seção 8: Caixa do Mês Corrente ──────────────────────────────────────────

function renderCaixaMesCorrente(pnl: PnLData, params: FinancialParams): string {
  const currentRow: PnLRow | undefined = pnl.rows[pnl.rows.length - 1];
  if (!currentRow) return "";

  const tributosMes = currentRow.receitaTotal * params.taxRate;
  const saidaTotal = currentRow.despesaTotal + tributosMes + params.proLaboreMonthly;
  const sobra = currentRow.receitaTotal - saidaTotal;

  return [
    mdHeader(2, "8. Caixa do Mês Corrente"),
    "_Visão de fluxo: o que efetivamente entrou e saiu este mês (regime caixa). Diferente do MRR, depende dos pagamentos de fato registrados._",
    "",
    `- **Mês**: ${currentRow.label}`,
    `- **Recebido (caixa)**: ${formatBRL(currentRow.receitaTotal)} (recorrente ${formatBRL(currentRow.receitaRecorrente)} + avulsa ${formatBRL(currentRow.receitaAvulsa)})`,
    `- **Saída efetiva**: ${formatBRL(saidaTotal)} (despesas pagas ${formatBRL(currentRow.despesaTotal)} + tributos ${formatBRL(tributosMes)} + pró-labore ${formatBRL(params.proLaboreMonthly)})`,
    `- **Sobra/falta de caixa**: ${formatBRL(sobra)}${sobra < 0 ? " (déficit)" : ""}`,
  ].join("\n");
}

// ─── Rodapé: Parâmetros ───────────────────────────────────────────────────────

function renderParametros(params: FinancialParams): string {
  const itens = (Object.keys(PLANNED_FIXED_EXPENSES) as Array<keyof typeof PLANNED_FIXED_EXPENSES>)
    .map((k) => `${PLANNED_FIXED_EXPENSES_LABELS[k]} ${formatBRL(PLANNED_FIXED_EXPENSES[k])}`)
    .join(", ");

  return [
    mdHeader(2, "Parâmetros usados"),
    `- Pró-labore mensal: ${formatBRL(params.proLaboreMonthly)}`,
    `- Tributo estimado: ${formatPercentage(params.taxRate * 100)} da receita`,
    `- Meta de receita mensal: ${formatBRL(params.monthlyRevenueTarget)}`,
    `- Meta de reserva PJ: ${params.reserveMonthsTarget} meses de custo fixo`,
    `- Margem de respiro acima do breakeven: ${(params.respiroMargin * 100).toFixed(0)}%`,
    `- Despesas operacionais fixas planejadas (total ${formatBRL(params.plannedFixedExpensesTotal)}): ${itens}`,
  ].join("\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthsAgo(now: Date, n: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}
