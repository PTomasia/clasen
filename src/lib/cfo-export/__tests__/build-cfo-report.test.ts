import { describe, it, expect, vi } from "vitest";

// Mocka módulo db para evitar conexão real com Turso durante imports.
vi.mock("../../db", () => ({ db: {} }));

import { aggregateProfitAndLoss } from "../../queries/profit-and-loss";
import { buildCfoReportMarkdown, type PlanForCfoReport } from "../build-cfo-report";
import type { ExpenseRow } from "../../services/expenses";
import type { RevenueRow } from "../../services/revenues";

const NOW = new Date(2026, 4, 4, 14, 32, 0); // 04/05/2026 14:32 local

function buildInput() {
  const plans: PlanForCfoReport[] = [
    {
      id: 1,
      clientName: "Ana Souza",
      planType: "Essential",
      planValue: 1_200,
      status: "ativo",
      endDate: null,
      postsCarrossel: 4,
      postsReels: 2,
      postsEstatico: 0,
      postsTrafego: 0,
      custoPost: 200,
      nextPaymentDate: "2026-05-10",
      lastPaymentDate: "2026-04-10",
      statusPagamento: "em_dia",
      adjustmentSuggestion: { suggestedValue: 1_500, percentChange: 25, capped: true },
    },
    {
      id: 2,
      clientName: "Bia Lima",
      planType: "Personalizado",
      planValue: 2_000,
      status: "ativo",
      endDate: null,
      postsCarrossel: 8,
      postsReels: 4,
      postsEstatico: 4,
      postsTrafego: 0,
      custoPost: 142.86,
      nextPaymentDate: "2026-05-15",
      lastPaymentDate: "2026-04-15",
      statusPagamento: "em_dia",
      adjustmentSuggestion: null,
    },
    {
      id: 3,
      clientName: "Cris Velha",
      planType: "Essential",
      planValue: 800,
      status: "cancelado",
      endDate: "2026-02-01",
      postsCarrossel: 2,
      postsReels: 1,
      postsEstatico: 0,
      postsTrafego: 0,
      custoPost: 266.67,
      nextPaymentDate: null,
      lastPaymentDate: "2026-01-20",
      statusPagamento: "sem_pagamento",
      adjustmentSuggestion: null,
    },
  ];

  const revenues: RevenueRow[] = [
    {
      id: 10,
      clientId: 1,
      clientName: "Ana Souza",
      date: "2026-05-02",
      amount: 350,
      product: "Carrossel avulso",
      channel: "Instagram",
      campaign: null,
      isPaid: true,
      installmentsTotal: null,
      installmentNumber: null,
      installmentGroupId: null,
      notes: null,
    },
    {
      id: 11,
      clientId: 2,
      clientName: "Bia Lima",
      date: "2026-04-20",
      amount: 600,
      product: "PDF",
      channel: null,
      campaign: null,
      isPaid: false,
      installmentsTotal: null,
      installmentNumber: null,
      installmentGroupId: null,
      notes: null,
    },
    {
      id: 12,
      clientId: null,
      clientName: null,
      date: "2025-12-10", // antigo, fora dos últimos 3 meses
      amount: 999,
      product: "Antigo",
      channel: null,
      campaign: null,
      isPaid: true,
      installmentsTotal: null,
      installmentNumber: null,
      installmentGroupId: null,
      notes: null,
    },
  ];

  const expenses: ExpenseRow[] = [
    {
      id: 100,
      month: "2026-05",
      description: "Designer",
      category: "fixo",
      amount: 2_500,
      isPaid: true,
      isRecurring: true,
      recurringUntil: null,
      installmentsTotal: null,
      installmentNumber: null,
      installmentGroupId: null,
      notes: null,
    },
    {
      id: 101,
      month: "2026-05",
      description: "Anúncios Google",
      category: "variavel",
      amount: 800,
      isPaid: false,
      isRecurring: false,
      recurringUntil: null,
      installmentsTotal: null,
      installmentNumber: null,
      installmentGroupId: null,
      notes: null,
    },
    {
      id: 102,
      month: "2026-04",
      description: "Computador novo",
      category: "fixo",
      amount: 300,
      isPaid: true,
      isRecurring: false,
      recurringUntil: null,
      installmentsTotal: 12,
      installmentNumber: 3,
      installmentGroupId: "uuid-comp",
      notes: null,
    },
  ];

  // PnL com mês corrente 2026-05 ativo + 2 anteriores
  const pnl = aggregateProfitAndLoss({
    payments: [
      { paymentDate: "2026-05-10", amount: 1_200, status: "pago" },
      { paymentDate: "2026-05-15", amount: 2_000, status: "pago" },
      { paymentDate: "2026-04-10", amount: 1_200, status: "pago" },
      { paymentDate: "2026-04-15", amount: 2_000, status: "pago" },
      { paymentDate: "2026-03-10", amount: 1_200, status: "pago" },
      { paymentDate: "2026-03-15", amount: 2_000, status: "pago" },
    ],
    revenues: [
      { date: "2026-05-02", amount: 350, isPaid: true },
      { date: "2026-04-20", amount: 600, isPaid: false }, // não entra no PnL
    ],
    expenses: [
      { month: "2026-05", category: "fixo", amount: 2_500, isPaid: true },
      { month: "2026-05", category: "variavel", amount: 800, isPaid: false },
      { month: "2026-04", category: "fixo", amount: 300, isPaid: true },
      { month: "2026-04", category: "fixo", amount: 2_000, isPaid: true },
      { month: "2026-03", category: "fixo", amount: 2_000, isPaid: true },
    ],
    today: NOW,
  });

  return { now: NOW, pnl, plans, revenues, expenses };
}

describe("buildCfoReportMarkdown", () => {
  it("inclui cabeçalho com data formatada e contexto da Clasen", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("# Relatório Financeiro — Clasen Studio");
    expect(md).toContain("**Gerado em**: 04/05/2026 14:32");
    expect(md).toContain("agência de marketing digital para psicólogas");
  });

  it("seção 1: lista apenas planos ativos com reajuste e MRR total", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 1. Receita Recorrente Ativa");
    expect(md).toContain("| Ana Souza | Essential | R$ 1.200,00 | R$ 1.500,00 |");
    expect(md).toContain("| Bia Lima | Personalizado | R$ 2.000,00 | — |");
    expect(md).not.toContain("Cris Velha"); // cancelado: não aparece
    expect(md).toContain("**TOTAL MRR (atual)**: R$ 3.200,00 — 2 planos ativos, ticket médio R$ 1.600,00");
  });

  it("seção 2: resumo de reajustes com diferença e tabela", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 2. Resumo de Reajustes");
    expect(md).toContain("**MRR atual**: R$ 3.200,00");
    expect(md).toContain("**MRR previsto se reajustes aceitos**: R$ 3.500,00");
    expect(md).toContain("**Diferença**: R$ 300,00");
    expect(md).toContain("| Ana Souza | R$ 1.200,00 | R$ 1.500,00 | R$ 300,00 | 25.00% | sim |");
  });

  it("seção 3: receitas avulsas só dos últimos 3 meses", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 3. Receitas Avulsas");
    expect(md).toContain("Carrossel avulso (Instagram)");
    expect(md).toContain("PDF");
    expect(md).not.toContain("Antigo"); // 2025-12 fora da janela
    expect(md).toContain("**Total pago (3m)**: R$ 350,00");
    expect(md).toContain("**Pendente**: R$ 600,00");
  });

  it("seção 4: despesas com tipo correto (recorrente / parcela / pontual)", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 4. Despesas");
    expect(md).toContain("| Mai/2026 | fixo | Designer | R$ 2.500,00 | recorrente | sim |");
    expect(md).toContain("| Mai/2026 | variável | Anúncios Google | R$ 800,00 | pontual | não |");
    expect(md).toContain("| Abr/2026 | fixo | Computador novo | R$ 300,00 | parcela 3/12 | sim |");
  });

  it("seção 5: DRE 12 meses com tributos a 6% e pró-labore quando há atividade", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 5. DRE Mensal Simples (12 meses)");
    // Mai/26: receita 3550 (3200 recorr + 350 avulsa), tributos 213, despesas 2500, proLab 15000, resultado -14163
    expect(md).toMatch(/\| Mai\/26 \| R\$ 3\.200,00 \| R\$ 350,00 \| R\$ 3\.550,00 \| R\$ 213,00 \| R\$ 2\.500,00 \| R\$ 15\.000,00 \| -R\$ 14\.163,00 \|/);
  });

  it("seção 6: respostas-chave com receita, saída, sobra, breakeven e gap", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 6. Respostas-chave");
    expect(md).toContain("**Receita do mês corrente (Mai/26)**: R$ 3.550,00");
    expect(md).toContain("**Saída total do mês**: R$ 17.713,00 (despesas R$ 2.500,00 + tributos R$ 213,00 + pró-labore R$ 15.000,00)");
    expect(md).toContain("(déficit)"); // sobra negativa
    expect(md).toContain("**Ponto de equilíbrio mensal**:");
    expect(md).toContain("**Gap até meta de R$ 40.000,00**: faltam R$ 36.450,00");
    expect(md).toContain("clientes ao ticket médio atual de R$ 1.600,00");
    expect(md).toContain("**Reserva PJ alvo (2 meses de custo fixo)**:");
  });

  it("rodapé inclui parâmetros usados", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## Parâmetros usados");
    expect(md).toContain("Pró-labore mensal: R$ 15.000,00");
    expect(md).toContain("Tributo estimado: 6,00% da receita");
    expect(md).toContain("Meta de receita mensal: R$ 40.000,00");
    expect(md).toContain("Designer R$ 2.500,00");
  });

  it("não quebra com listas vazias (zero planos, zero avulsas, zero despesas)", () => {
    const empty = aggregateProfitAndLoss({
      payments: [],
      revenues: [],
      expenses: [],
      today: NOW,
    });
    const md = buildCfoReportMarkdown({
      now: NOW,
      pnl: empty,
      plans: [],
      revenues: [],
      expenses: [],
    });
    expect(md).toContain("_Nenhum plano ativo._");
    expect(md).toContain("_Nenhuma receita avulsa nos últimos 3 meses._");
    expect(md).toContain("_Nenhuma despesa nos últimos 3 meses._");
    expect(md).toContain("**MRR atual**: R$ 0,00");
  });
});
