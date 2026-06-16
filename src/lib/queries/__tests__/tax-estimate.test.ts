import { describe, it, expect } from "vitest";
import {
  aggregateReceitaCompetencia,
  buildTaxEstimate,
} from "../tax-estimate";

const CUTOFF = "2026-01-01";

describe("aggregateReceitaCompetencia", () => {
  it("mês corrente = MRR contratado (planos ativos) + avulsas por competência", () => {
    const series = aggregateReceitaCompetencia({
      plans: [
        { id: 1, clientId: 1, planValue: 10_000, startDate: "2026-01-01", endDate: null },
      ],
      payments: [],
      revenues: [
        { date: "2026-03-10", amount: 2_000 }, // avulsa do mês corrente
        { date: "2025-12-01", amount: 9_999 }, // antes do cutoff → ignorada
      ],
      today: new Date("2026-03-15"),
      cutoff: CUTOFF,
      monthsBack: 3,
    });
    const mar = series.find((s) => s.month === "2026-03");
    expect(mar?.receitaBruta).toBe(12_000); // 10k contratado + 2k avulsa
  });

  it("mês passado = pagamentos pago+pendente + avulsas do mês (independe de isPaid)", () => {
    const series = aggregateReceitaCompetencia({
      plans: [
        { id: 1, clientId: 1, planValue: 10_000, startDate: "2026-01-01", endDate: null },
      ],
      payments: [
        { planId: 1, paymentDate: "2026-02-05", amount: 8_000, status: "pago", skipped: false },
      ],
      revenues: [
        { date: "2026-02-20", amount: 1_500 }, // avulsa competência (mesmo não paga)
      ],
      today: new Date("2026-03-15"),
      cutoff: CUTOFF,
      monthsBack: 3,
    });
    const fev = series.find((s) => s.month === "2026-02");
    expect(fev?.receitaBruta).toBe(9_500); // 8k pagto + 1,5k avulsa
  });
});

describe("buildTaxEstimate", () => {
  // Série Clasen: 5 meses anteriores a ~14k + mês corrente 14k → Faixa 1.
  const series = [
    { month: "2026-01", receitaBruta: 14_000 },
    { month: "2026-02", receitaBruta: 14_000 },
    { month: "2026-03", receitaBruta: 14_000 },
    { month: "2026-04", receitaBruta: 14_000 },
    { month: "2026-05", receitaBruta: 14_000 },
    { month: "2026-06", receitaBruta: 14_000 },
  ];

  it("estima o mês de apuração com RBT12 proporcionalizada", () => {
    const r = buildTaxEstimate({
      series,
      mesApuracao: "2026-06",
      cutoffMonth: "2026-01",
      proLaboreContabilRate: 0.28,
    });
    expect(r.mesApuracao).toBe("2026-06");
    expect(r.estimativa.receitaBrutaMes).toBe(14_000);
    expect(r.estimativa.rbt12).toBe(168_000); // 5 meses anteriores × 14k → (70k/5)×12
    expect(r.estimativa.rbt12Tipo).toBe("proporcionalizada");
    expect(r.estimativa.faixa).toBe(1);
    expect(r.estimativa.das).toBe(840); // 14k × 6%
    expect(r.estimativa.fatorRStatus).toBe("ok_anexo_iii");
  });

  it("dasPorMes traz o DAS estimado de cada mês em operação", () => {
    const r = buildTaxEstimate({
      series,
      mesApuracao: "2026-06",
      cutoffMonth: "2026-01",
      proLaboreContabilRate: 0.28,
    });
    // 1º mês: RBT12 = 14k×12 = 168k → Faixa 1 → DAS = 840
    expect(r.dasPorMes["2026-01"]).toBe(840);
    expect(r.dasPorMes["2026-06"]).toBe(840);
  });

  it("ignora meses anteriores ao cutoff no cálculo da RBT12", () => {
    const withPre = [
      { month: "2025-11", receitaBruta: 0 },
      { month: "2025-12", receitaBruta: 0 },
      ...series,
    ];
    const r = buildTaxEstimate({
      series: withPre,
      mesApuracao: "2026-06",
      cutoffMonth: "2026-01",
      proLaboreContabilRate: 0.28,
    });
    // mesmos 5 meses de operação → RBT12 idêntica (pré-cutoff não dilui)
    expect(r.estimativa.rbt12).toBe(168_000);
    expect(r.estimativa.mesesApurados).toBe(5);
  });
});
