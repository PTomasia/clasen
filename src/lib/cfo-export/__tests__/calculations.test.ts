import { describe, it, expect } from "vitest";
import type { PnLData, PnLRow } from "../../queries/profit-and-loss";
import {
  calcDreRow,
  calcDre12m,
  calcAvgDespesas3m,
  calcBreakeven,
  calcGapToTarget,
  calcReajusteSummary,
  type PlanForReajuste,
} from "../calculations";
import { FINANCIAL_PARAMS } from "../financial-params";

function pnlRow(partial: Partial<PnLRow>): PnLRow {
  return {
    month: "2026-04",
    label: "Abr/26",
    receitaRecorrente: 0,
    receitaAvulsa: 0,
    receitaTotal: 0,
    despesaFixa: 0,
    despesaVariavel: 0,
    despesaTotal: 0,
    lucroLiquido: 0,
    margemLiquida: null,
    ...partial,
  };
}

function buildPnL(rows: PnLRow[]): PnLData {
  return {
    rows,
    totals: {
      receitaTotal: rows.reduce((s, r) => s + r.receitaTotal, 0),
      despesaTotal: rows.reduce((s, r) => s + r.despesaTotal, 0),
      despesaFixaTotal: rows.reduce((s, r) => s + r.despesaFixa, 0),
      despesaVariavelTotal: rows.reduce((s, r) => s + r.despesaVariavel, 0),
      lucroTotal: rows.reduce((s, r) => s + r.lucroLiquido, 0),
      margemMedia: null,
      mesesNoLucro: 0,
      mesesNoPrejuizo: 0,
    },
  };
}

describe("calcDreRow", () => {
  it("calcula tributos a 6%, subtrai despesas e pró-labore", () => {
    const row = calcDreRow(
      pnlRow({
        month: "2026-04",
        receitaRecorrente: 25_000,
        receitaAvulsa: 5_000,
        receitaTotal: 30_000,
        despesaFixa: 4_000,
        despesaVariavel: 2_000,
        despesaTotal: 6_000,
        lucroLiquido: 24_000,
      }),
      FINANCIAL_PARAMS
    );
    expect(row.tributos).toBe(1_800); // 30k * 6%
    expect(row.despesas).toBe(6_000);
    expect(row.proLabore).toBe(15_000);
    expect(row.resultado).toBe(7_200); // 30000 - 1800 - 6000 - 15000
  });

  it("zera pró-labore em mês totalmente vazio", () => {
    const row = calcDreRow(pnlRow({ month: "2025-06" }), FINANCIAL_PARAMS);
    expect(row.proLabore).toBe(0);
    expect(row.tributos).toBe(0);
    expect(row.resultado).toBe(0);
  });
});

describe("calcDre12m", () => {
  it("retorna uma linha por mês do PnL", () => {
    const pnl = buildPnL([
      pnlRow({ month: "2026-03", receitaTotal: 20_000, despesaTotal: 5_000 }),
      pnlRow({ month: "2026-04", receitaTotal: 30_000, despesaTotal: 6_000 }),
    ]);
    const dre = calcDre12m(pnl, FINANCIAL_PARAMS);
    expect(dre).toHaveLength(2);
    expect(dre[0].month).toBe("2026-03");
    expect(dre[1].resultado).toBe(7_200);
  });
});

describe("calcAvgDespesas3m", () => {
  it("média dos 3 últimos meses com atividade", () => {
    const pnl = buildPnL([
      pnlRow({ month: "2025-12", despesaTotal: 0, receitaTotal: 0 }), // ignorado
      pnlRow({ month: "2026-01", despesaTotal: 4_000, receitaTotal: 20_000 }),
      pnlRow({ month: "2026-02", despesaTotal: 5_000, receitaTotal: 22_000 }),
      pnlRow({ month: "2026-03", despesaTotal: 6_000, receitaTotal: 25_000 }),
      pnlRow({ month: "2026-04", despesaTotal: 7_000, receitaTotal: 30_000 }),
    ]);
    expect(calcAvgDespesas3m(pnl)).toBe(6_000); // (5k + 6k + 7k) / 3
  });

  it("retorna 0 se não houver atividade", () => {
    const pnl = buildPnL([
      pnlRow({ month: "2026-04" }),
    ]);
    expect(calcAvgDespesas3m(pnl)).toBe(0);
  });
});

describe("calcBreakeven", () => {
  it("(despesas + proLabore) / (1 - taxRate)", () => {
    // (5000 + 15000) / 0.94 = 21276.595...
    const result = calcBreakeven(5_000, FINANCIAL_PARAMS);
    expect(result).toBe(21_276.6);
  });

  it("apenas pró-labore quando despesas zeradas", () => {
    // 15000 / 0.94 = 15957.446...
    expect(calcBreakeven(0, FINANCIAL_PARAMS)).toBe(15_957.45);
  });
});

describe("calcGapToTarget", () => {
  it("calcula gap e clientes equivalentes", () => {
    const result = calcGapToTarget(20_000, 800, FINANCIAL_PARAMS);
    expect(result.gap).toBe(20_000); // 40k - 20k
    expect(result.clientesEquivalentes).toBe(25); // ceil(20000/800)
  });

  it("zera gap se já atingiu a meta", () => {
    const result = calcGapToTarget(45_000, 800, FINANCIAL_PARAMS);
    expect(result.gap).toBe(0);
    expect(result.clientesEquivalentes).toBe(0);
  });

  it("ticketMedio zero não divide por zero", () => {
    const result = calcGapToTarget(20_000, 0, FINANCIAL_PARAMS);
    expect(result.gap).toBe(20_000);
    expect(result.clientesEquivalentes).toBe(0);
  });
});

describe("calcReajusteSummary", () => {
  function plan(partial: Partial<PlanForReajuste>): PlanForReajuste {
    return {
      id: 1,
      clientName: "Cliente",
      planValue: 1_000,
      status: "ativo",
      endDate: null,
      adjustmentSuggestion: null,
      ...partial,
    };
  }

  it("ignora planos cancelados / com endDate", () => {
    const plans = [
      plan({ id: 1, clientName: "Ana", planValue: 1_000 }),
      plan({ id: 2, clientName: "Bia", planValue: 2_000, status: "cancelado" }),
      plan({ id: 3, clientName: "Cris", planValue: 3_000, endDate: "2026-01-01" }),
    ];
    const r = calcReajusteSummary(plans);
    expect(r.mrrAtual).toBe(1_000);
    expect(r.mrrPrevisto).toBe(1_000);
    expect(r.diferenca).toBe(0);
  });

  it("soma valores propostos e lista planos com reajuste", () => {
    const plans = [
      plan({
        id: 1,
        clientName: "Ana",
        planValue: 1_000,
        adjustmentSuggestion: { suggestedValue: 1_200, percentChange: 20, capped: false },
      }),
      plan({
        id: 2,
        clientName: "Bia",
        planValue: 800,
        adjustmentSuggestion: { suggestedValue: 1_000, percentChange: 25, capped: true },
      }),
      plan({ id: 3, clientName: "Cris", planValue: 1_500 }), // sem sugestão
    ];
    const r = calcReajusteSummary(plans);
    expect(r.mrrAtual).toBe(3_300);
    expect(r.mrrPrevisto).toBe(3_700); // 1200 + 1000 + 1500
    expect(r.diferenca).toBe(400);
    expect(r.planosComReajuste).toHaveLength(2);
    expect(r.planosComReajuste[0]).toEqual({
      clientName: "Ana",
      valorAtual: 1_000,
      valorProposto: 1_200,
      diferenca: 200,
      percentChange: 20,
      capped: false,
    });
    expect(r.planosComReajuste[1].capped).toBe(true);
  });

  it("ignora suggestedValue null mesmo com adjustmentSuggestion presente", () => {
    const plans = [
      plan({
        id: 1,
        clientName: "Ana",
        planValue: 1_000,
        adjustmentSuggestion: { suggestedValue: null, percentChange: 0, capped: false },
      }),
    ];
    const r = calcReajusteSummary(plans);
    expect(r.planosComReajuste).toHaveLength(0);
    expect(r.mrrPrevisto).toBe(1_000); // mantém valor atual
  });
});
