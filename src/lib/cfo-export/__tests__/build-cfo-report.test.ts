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
      permanencia: 12,
      nextAdjustmentDate: "2026-08-10",
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
      permanencia: 1,
      nextAdjustmentDate: "2026-09-15",
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
      permanencia: 1,
      nextAdjustmentDate: null,
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
      description: null,
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
      description: null,
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
      description: null,
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
      expenseType: null,
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
      expenseType: null,
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
      expenseType: null,
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
  it("inclui cabeçalho com data formatada e contexto da Clasen + competência/caixa", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("# Relatório Financeiro — Clasen Studio");
    expect(md).toContain("**Gerado em**: 04/05/2026 14:32");
    expect(md).toContain("agência de marketing digital para psicólogas");
    expect(md).toContain("competência/MRR");
    expect(md).toContain("caixa");
  });

  it("seção 1: lista apenas planos ativos com reajuste e MRR total", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 1. Receita Recorrente Ativa (competência)");
    expect(md).toContain("| Ana Souza | Essential | R$ 1.200,00 | R$ 1.500,00 |");
    expect(md).toContain("| Bia Lima | Personalizado | R$ 2.000,00 | — |");
    expect(md).not.toContain("Cris Velha"); // cancelado: não aparece
    expect(md).toContain("**TOTAL MRR (atual)**: R$ 3.200,00 — 2 planos ativos, ticket médio R$ 1.600,00");
  });

  it("seção 1: inclui permanência e data prevista de reajuste por plano", () => {
    const md = buildCfoReportMarkdown(buildInput());
    // Cabeçalho com as novas colunas
    expect(md).toContain("| Cliente | Plano | Valor atual | Valor c/ reajuste | Próx. reajuste | Permanência |");
    // Ana: reajuste 10/08/2026, 12 meses de permanência
    expect(md).toContain("| R$ 1.500,00 | 10/08/2026 | 12 meses |");
    // Bia: reajuste 15/09/2026, 1 mês (singular)
    expect(md).toContain("| — | 15/09/2026 | 1 mês |");
  });

  it("seção 2: resumo de reajustes com diferença e tabela", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 2. Resumo de Reajustes");
    expect(md).toContain("**MRR atual**: R$ 3.200,00");
    expect(md).toContain("**MRR previsto se reajustes aceitos**: R$ 3.500,00");
    expect(md).toContain("**Diferença**: R$ 300,00");
    expect(md).toContain("| Ana Souza | R$ 1.200,00 | R$ 1.500,00 | R$ 300,00 | 25.00% | sim |");
  });

  it("seção 3: receitas avulsas com totais separados competência/caixa", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 3. Receitas Avulsas");
    expect(md).toContain("Carrossel avulso (Instagram)");
    expect(md).toContain("PDF");
    expect(md).not.toContain("Antigo"); // 2025-12 fora da janela
    expect(md).toContain("**Total contratado/competência (3m)**: R$ 950,00");
    expect(md).toContain("**Recebido/caixa**: R$ 350,00");
    expect(md).toContain("**Pendente**: R$ 600,00");
  });

  it("seção 4: despesas com tipo correto + totais competência/caixa", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 4. Despesas");
    expect(md).toContain("| Mai/2026 | fixo | Designer | R$ 2.500,00 | recorrente | sim |");
    expect(md).toContain("| Mai/2026 | variável | Anúncios Google | R$ 800,00 | pontual | não |");
    expect(md).toContain("| Abr/2026 | fixo | Computador novo | R$ 300,00 | parcela 3/12 | sim |");
    expect(md).toContain("**Total competência (3m)**: R$ 3.600,00");
    expect(md).toContain("**Pago/caixa**: R$ 2.800,00");
  });

  it("seção 5: DRE últimos 3 meses (caixa, não 12)", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 5. DRE Últimos 3 Meses (regime caixa)");
    // Mai/26: receita 3550 (3200 recorr + 350 avulsa), tributos 213, despesas 2500, proLab 15000, resultado -14163
    expect(md).toMatch(/\| Mai\/26 \| R\$ 3\.200,00 \| R\$ 350,00 \| R\$ 3\.550,00 \| R\$ 213,00 \| R\$ 2\.500,00 \| R\$ 15\.000,00 \| -R\$ 14\.163,00 \|/);
    // Não deve incluir meses anteriores (Jan, Fev) — só os 3 últimos.
    expect(md).not.toContain("| Jan/26 |");
    expect(md).not.toContain("| Fev/26 |");
  });

  it("seção 6: 3 cenários usam alíquota efetiva do Simples (não mais 6% fixo)", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 6. DRE — 3 Cenários (regime competência)");
    expect(md).toContain("| Linha | Atual (MRR) | Pós-reajuste | Meta R$ 40k |");
    // Receita bruta dos 3 cenários: Atual 3200, Pós 3500, Meta 40000
    expect(md).toContain("| Receita bruta | R$ 3.200,00 | R$ 3.500,00 | R$ 40.000,00 |");
    expect(md).toContain("Alíquota efetiva (Simples)");
    // DAS estimado: Atual/Pós ficam na Faixa 1 (6% → 192/210); Meta sobe p/ Faixa 3 (3.930)
    expect(md).toContain("| (-) DAS estimado | R$ 192,00 | R$ 210,00 | R$ 3.930,00 |");
    expect(md).toContain("| (-) Despesas operacionais fixas | R$ 5.810,00 | R$ 5.810,00 | R$ 5.810,00 |");
    expect(md).toContain("(-) Pró-labore | R$ 15.000,00 | R$ 15.000,00 | R$ 15.000,00 |");
    // Resultado meta: 40000 - 3930 - 15000 - 5810 = 15260
    expect(md).toContain("| **Resultado gerencial** | -R$ 17.802,00 | -R$ 17.520,00 | R$ 15.260,00 |");
  });

  it("seção 7: resumo executivo com 7 itens estruturados", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 7. Resumo Executivo (gestão)");
    expect(md).toContain("- **MRR atual**: R$ 3.200,00");
    expect(md).toContain("- **MRR pós-reajuste**: R$ 3.500,00");
    expect(md).toContain("- **Diferença dos reajustes**: R$ 300,00");
    // Breakeven planejado = (5810 + 15000) / 0.94 = 22138.30
    expect(md).toContain("**Ponto de equilíbrio gerencial**: R$ 22.138,30");
    // Respiro = 22138.30 × 1.2 = 26565.96
    expect(md).toContain("**Receita mínima de respiro**: R$ 26.565,96");
    // Gap atual: 40000 - 3200 = 36800; pós: 40000 - 3500 = 36500
    expect(md).toContain("Com **MRR atual**: faltam R$ 36.800,00");
    expect(md).toContain("Com **MRR pós-reajuste**: faltam R$ 36.500,00");
    // Reserva: (5810 + 15000) × 2 = 41620
    expect(md).toContain("**Reserva PJ alvo (2 meses de custo fixo)**: R$ 41.620,00");
  });

  it("seção 8: caixa do mês corrente em regime caixa", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## 8. Caixa do Mês Corrente");
    expect(md).toContain("**Mês**: Mai/26");
    expect(md).toContain("**Recebido (caixa)**: R$ 3.550,00");
    expect(md).toContain("(déficit)");
  });

  it("rodapé inclui parâmetros e lista completa de despesas planejadas", () => {
    const md = buildCfoReportMarkdown(buildInput());
    expect(md).toContain("## Parâmetros usados");
    expect(md).toContain("Pró-labore mensal (gerencial): R$ 15.000,00");
    expect(md).toContain("DAS estimado pelo Simples Nacional");
    expect(md).toContain("Pró-labore contábil (Fator R): 28,00% da receita do mês");
    expect(md).toContain("Meta de receita mensal: R$ 40.000,00");
    expect(md).toContain("Margem de respiro acima do breakeven: 20%");
    expect(md).toContain("Despesas operacionais fixas planejadas (total R$ 5.810,00)");
    expect(md).toContain("Bibo (design) R$ 2.500,00");
    expect(md).toContain("Claude R$ 550,00");
    expect(md).toContain("Capcut R$ 65,00");
  });

  it("seção Estimativa Tributária: campos do Simples + alerta de valor não oficial", () => {
    const tax = {
      mesApuracao: "2026-05",
      dasPorMes: { "2026-05": 213 },
      estimativa: {
        receitaBrutaMes: 3_550,
        rbt12: 42_600,
        rbt12Tipo: "proporcionalizada" as const,
        mesesApurados: 4,
        faixa: 1,
        aliquotaNominal: 0.06,
        parcelaDeduzir: 0,
        aliquotaEfetiva: 0.06,
        das: 213,
        receitaLiquidaAposDas: 3_337,
        proLaboreContabil: 994,
        folha12m: 11_928,
        fatorR: 0.28,
        fatorRStatus: "ok_anexo_iii" as const,
        dasSeisPorcento: 213,
        diferencaVs6: 0,
      },
    };
    const md = buildCfoReportMarkdown({ ...buildInput(), tax });
    expect(md).toContain("## Estimativa Tributária (Simples Nacional · Anexo III)");
    expect(md).toContain("**Receita bruta do mês**: R$ 3.550,00");
    expect(md).toContain("**RBT12 usada**: R$ 42.600,00 — proporcionalizada (4 meses)");
    expect(md).toContain("**Faixa do Anexo III**: Faixa 1");
    expect(md).toContain("**DAS estimado do mês**: R$ 213,00");
    expect(md).toContain("**Receita líquida após DAS**: R$ 3.337,00");
    expect(md).toContain("OK — Anexo III");
    // Sem despesa de tributos paga → alerta de valor estimado
    expect(md).toContain("⚠️");
    expect(md).toContain("não foi substituído pelo valor oficial");
    // Frase-modelo de leitura
    expect(md).toContain("se enquadra na Faixa 1 do Anexo III");
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
    // Mesmo sem planos, cenário Meta (R$ 40k) ainda renderiza no scenario table.
    expect(md).toContain("| Receita bruta | R$ 0,00 | R$ 0,00 | R$ 40.000,00 |");
  });
});
