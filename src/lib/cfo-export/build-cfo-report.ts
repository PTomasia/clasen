import type { PnLData } from "../queries/profit-and-loss";
import type { ExpenseRow } from "../services/expenses";
import type { RevenueRow } from "../services/revenues";
import { formatBRL, formatDate, formatMonth, formatPercentage } from "../utils/formatting";
import {
  calcAvgDespesas3m,
  calcBreakeven,
  calcDre12m,
  calcGapToTarget,
  calcReajusteSummary,
  type PlanForReajuste,
} from "./calculations";
import { FINANCIAL_PARAMS, type FinancialParams } from "./financial-params";
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
  const sections = [
    renderHeader(input.now),
    renderRecorrente(input.plans),
    renderReajustes(input.plans),
    renderAvulsas(input.revenues, input.now),
    renderDespesas(input.expenses, input.now),
    renderDre(input.pnl, params),
    renderRespostas(input, params),
    renderParametros(input.pnl, params),
  ];
  return sections.filter(Boolean).join("\n\n");
}

// ─── Cabeçalho ────────────────────────────────────────────────────────────────

function renderHeader(now: Date): string {
  return [
    mdHeader(1, "Relatório Financeiro — Clasen Studio"),
    `**Gerado em**: ${formatDateTimeBR(now)}`,
    "**Contexto**: Clasen Studio é uma agência de marketing digital para psicólogas. Modelo de receita: planos recorrentes mensais + receitas avulsas. A cobrança é mensal por cliente, no dia configurado em `billing_cycle_days`. As perguntas-chave que este relatório responde estão listadas no final.",
  ].join("\n");
}

// ─── Seção 1: Receita Recorrente Ativa ────────────────────────────────────────

function renderRecorrente(plans: PlanForCfoReport[]): string {
  const ativos = plans.filter((p) => p.status === "ativo" && p.endDate === null);

  if (ativos.length === 0) {
    return [mdHeader(2, "1. Receita Recorrente Ativa"), "_Nenhum plano ativo._"].join("\n");
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
    mdHeader(2, "1. Receita Recorrente Ativa"),
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

function renderReajustes(plans: PlanForCfoReport[]): string {
  const summary = calcReajusteSummary(plans);
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

// ─── Seção 3: Receitas Avulsas (mês corrente + 2 anteriores) ──────────────────

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

  const totalPago = recent.filter((r) => r.isPaid).reduce((s, r) => s + r.amount, 0);
  const totalPendente = recent.filter((r) => !r.isPaid).reduce((s, r) => s + r.amount, 0);
  lines.push(
    "",
    `**Total pago (3m)**: ${formatBRL(totalPago)} • **Pendente**: ${formatBRL(totalPendente)}`
  );
  return lines.join("\n");
}

// ─── Seção 4: Despesas (mês corrente + 2 anteriores) ──────────────────────────

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

  const totalPago = recent.filter((e) => e.isPaid).reduce((s, e) => s + e.amount, 0);
  const totalPendente = recent.filter((e) => !e.isPaid).reduce((s, e) => s + e.amount, 0);
  lines.push(
    "",
    `**Total pago (3m)**: ${formatBRL(totalPago)} • **Pendente**: ${formatBRL(totalPendente)}`
  );
  return lines.join("\n");
}

// ─── Seção 5: DRE 12 meses ────────────────────────────────────────────────────

function renderDre(pnl: PnLData, params: FinancialParams): string {
  const dre = calcDre12m(pnl, params);
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
    mdHeader(2, "5. DRE Mensal Simples (12 meses)"),
    mdTable(rows),
  ].join("\n");
}

// ─── Seção 6: Respostas-chave ────────────────────────────────────────────────

function renderRespostas(input: BuildCfoReportInput, params: FinancialParams): string {
  const currentRow = input.pnl.rows[input.pnl.rows.length - 1];
  const ativos = input.plans.filter((p) => p.status === "ativo" && p.endDate === null);
  const mrrAtivo = ativos.reduce((s, p) => s + p.planValue, 0);
  const ticketMedio = ativos.length > 0 ? mrrAtivo / ativos.length : 0;

  const tributosMes = currentRow.receitaTotal * params.taxRate;
  const saidaTotal = currentRow.despesaTotal + tributosMes + params.proLaboreMonthly;
  const sobra = currentRow.receitaTotal - saidaTotal;

  const reajustes = calcReajusteSummary(input.plans);
  const avgDespesas = calcAvgDespesas3m(input.pnl);
  const breakeven = calcBreakeven(avgDespesas, params);
  const gap = calcGapToTarget(currentRow.receitaTotal, ticketMedio, params);

  const reservaPj = (avgDespesas + params.proLaboreMonthly) * params.reserveMonthsTarget;

  return [
    mdHeader(2, "6. Respostas-chave"),
    `- **Receita do mês corrente (${currentRow.label})**: ${formatBRL(currentRow.receitaTotal)} (recorrente ${formatBRL(currentRow.receitaRecorrente)} + avulsa ${formatBRL(currentRow.receitaAvulsa)})`,
    `- **Saída total do mês**: ${formatBRL(saidaTotal)} (despesas ${formatBRL(currentRow.despesaTotal)} + tributos ${formatBRL(tributosMes)} + pró-labore ${formatBRL(params.proLaboreMonthly)})`,
    `- **Sobra/falta após pró-labore**: ${formatBRL(sobra)}${sobra < 0 ? " (déficit)" : ""}`,
    `- **MRR atual**: ${formatBRL(reajustes.mrrAtual)} • **MRR previsto pós-reajustes**: ${formatBRL(reajustes.mrrPrevisto)} (delta ${formatBRL(reajustes.diferenca)})`,
    `- **Ponto de equilíbrio mensal**: ${formatBRL(breakeven)} — fórmula: (despesas médias 3m ${formatBRL(avgDespesas)} + pró-labore ${formatBRL(params.proLaboreMonthly)}) / (1 - ${(params.taxRate * 100).toFixed(0)}%)`,
    `- **Gap até meta de ${formatBRL(params.monthlyRevenueTarget)}**: faltam ${formatBRL(gap.gap)}${gap.clientesEquivalentes > 0 ? ` ≈ +${gap.clientesEquivalentes} clientes ao ticket médio atual de ${formatBRL(ticketMedio)}` : ""}`,
    `- **Reserva PJ alvo (${params.reserveMonthsTarget} meses de custo fixo)**: ${formatBRL(reservaPj)}`,
  ].join("\n");
}

// ─── Rodapé: Parâmetros ───────────────────────────────────────────────────────

function renderParametros(_pnl: PnLData, params: FinancialParams): string {
  return [
    mdHeader(2, "Parâmetros usados"),
    `- Pró-labore mensal: ${formatBRL(params.proLaboreMonthly)}`,
    `- Tributo estimado: ${formatPercentage(params.taxRate * 100)} da receita`,
    `- Meta de receita mensal: ${formatBRL(params.monthlyRevenueTarget)}`,
    `- Meta de reserva PJ: ${params.reserveMonthsTarget} meses de custo fixo`,
    `- Custos planejados de referência: Designer ${formatBRL(params.designerMonthly)}, Copywriter ${formatBRL(params.copywriterPlannedMonthly)}, Claude ${formatBRL(params.claudeMonthly)}, Contador ${formatBRL(params.contadorMonthly)}`,
  ].join("\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthsAgo(now: Date, n: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}
