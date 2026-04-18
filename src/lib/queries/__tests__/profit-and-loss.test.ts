import { describe, it, expect, vi } from "vitest";

// Mocka o módulo db global para não tentar conectar ao Turso/SQLite durante testes.
// Os testes aqui exercitam apenas a função pura `aggregateProfitAndLoss`.
vi.mock("../../db", () => ({ db: {} }));

import { aggregateProfitAndLoss } from "../profit-and-loss";

const TODAY = new Date("2026-04-15");

function pickMonth(data: ReturnType<typeof aggregateProfitAndLoss>, m: string) {
  const row = data.rows.find((r) => r.month === m);
  if (!row) throw new Error(`mês ${m} não encontrado`);
  return row;
}

describe("aggregateProfitAndLoss — janela", () => {
  it("retorna 12 linhas do mês atual aos 11 anteriores", () => {
    const data = aggregateProfitAndLoss({
      payments: [], revenues: [], expenses: [], today: TODAY,
    });
    expect(data.rows).toHaveLength(12);
    expect(data.rows[0].month).toBe("2025-05");
    expect(data.rows[11].month).toBe("2026-04");
  });

  it("label PT-BR correto", () => {
    const data = aggregateProfitAndLoss({
      payments: [], revenues: [], expenses: [], today: TODAY,
    });
    expect(pickMonth(data, "2026-04").label).toBe("Abr/26");
    expect(pickMonth(data, "2025-12").label).toBe("Dez/25");
  });
});

describe("aggregateProfitAndLoss — receita", () => {
  it("soma pagamentos pagos no mês (ignora pendentes)", () => {
    const data = aggregateProfitAndLoss({
      payments: [
        { paymentDate: "2026-04-05", amount: 800, status: "pago" },
        { paymentDate: "2026-04-10", amount: 500, status: "pendente" },
      ],
      revenues: [],
      expenses: [],
      today: TODAY,
    });
    expect(pickMonth(data, "2026-04").receitaRecorrente).toBe(800);
  });

  it("soma avulsas pagas no mês (ignora não pagas)", () => {
    const data = aggregateProfitAndLoss({
      payments: [],
      revenues: [
        { date: "2026-04-10", amount: 300, isPaid: true },
        { date: "2026-04-12", amount: 999, isPaid: false },
      ],
      expenses: [],
      today: TODAY,
    });
    expect(pickMonth(data, "2026-04").receitaAvulsa).toBe(300);
  });

  it("receitaTotal = receitaRecorrente + receitaAvulsa", () => {
    const data = aggregateProfitAndLoss({
      payments: [{ paymentDate: "2026-04-05", amount: 1000, status: "pago" }],
      revenues: [{ date: "2026-04-10", amount: 250, isPaid: true }],
      expenses: [],
      today: TODAY,
    });
    const row = pickMonth(data, "2026-04");
    expect(row.receitaTotal).toBe(1250);
  });
});

describe("aggregateProfitAndLoss — despesas", () => {
  it("só soma despesas pagas, separando fixo/variável", () => {
    const data = aggregateProfitAndLoss({
      payments: [],
      revenues: [],
      expenses: [
        { month: "2026-04", category: "fixo", amount: 2500, isPaid: true },
        { month: "2026-04", category: "variavel", amount: 300, isPaid: true },
        { month: "2026-04", category: "variavel", amount: 999, isPaid: false }, // pendente, ignora
      ],
      today: TODAY,
    });
    const row = pickMonth(data, "2026-04");
    expect(row.despesaFixa).toBe(2500);
    expect(row.despesaVariavel).toBe(300);
    expect(row.despesaTotal).toBe(2800);
  });

  it("despesas de outros meses não contaminam o mês corrente", () => {
    const data = aggregateProfitAndLoss({
      payments: [],
      revenues: [],
      expenses: [
        { month: "2026-03", category: "fixo", amount: 2500, isPaid: true },
        { month: "2026-04", category: "fixo", amount: 100, isPaid: true },
      ],
      today: TODAY,
    });
    expect(pickMonth(data, "2026-04").despesaTotal).toBe(100);
    expect(pickMonth(data, "2026-03").despesaTotal).toBe(2500);
  });
});

describe("aggregateProfitAndLoss — lucro e margem", () => {
  it("lucro = receita - despesa", () => {
    const data = aggregateProfitAndLoss({
      payments: [{ paymentDate: "2026-04-05", amount: 5000, status: "pago" }],
      revenues: [],
      expenses: [{ month: "2026-04", category: "fixo", amount: 2000, isPaid: true }],
      today: TODAY,
    });
    const row = pickMonth(data, "2026-04");
    expect(row.lucroLiquido).toBe(3000);
  });

  it("lucro negativo quando despesa > receita", () => {
    const data = aggregateProfitAndLoss({
      payments: [{ paymentDate: "2026-04-05", amount: 500, status: "pago" }],
      revenues: [],
      expenses: [{ month: "2026-04", category: "fixo", amount: 3000, isPaid: true }],
      today: TODAY,
    });
    const row = pickMonth(data, "2026-04");
    expect(row.lucroLiquido).toBe(-2500);
  });

  it("margemLiquida = lucro / receita (0..1)", () => {
    const data = aggregateProfitAndLoss({
      payments: [{ paymentDate: "2026-04-05", amount: 5000, status: "pago" }],
      revenues: [],
      expenses: [{ month: "2026-04", category: "fixo", amount: 1000, isPaid: true }],
      today: TODAY,
    });
    expect(pickMonth(data, "2026-04").margemLiquida).toBe(0.8); // 4000/5000
  });

  it("margemLiquida é null quando receitaTotal = 0", () => {
    const data = aggregateProfitAndLoss({
      payments: [],
      revenues: [],
      expenses: [{ month: "2026-04", category: "fixo", amount: 500, isPaid: true }],
      today: TODAY,
    });
    expect(pickMonth(data, "2026-04").margemLiquida).toBeNull();
  });

  it("mês sem movimentação nenhuma tem zeros", () => {
    const data = aggregateProfitAndLoss({
      payments: [], revenues: [], expenses: [], today: TODAY,
    });
    const row = pickMonth(data, "2026-01");
    expect(row.receitaTotal).toBe(0);
    expect(row.despesaTotal).toBe(0);
    expect(row.lucroLiquido).toBe(0);
    expect(row.margemLiquida).toBeNull();
  });
});

describe("aggregateProfitAndLoss — totais", () => {
  it("soma correta de todos os meses", () => {
    const data = aggregateProfitAndLoss({
      payments: [
        { paymentDate: "2026-03-05", amount: 4000, status: "pago" },
        { paymentDate: "2026-04-05", amount: 5000, status: "pago" },
      ],
      revenues: [],
      expenses: [
        { month: "2026-03", category: "fixo", amount: 1000, isPaid: true },
        { month: "2026-04", category: "fixo", amount: 1200, isPaid: true },
      ],
      today: TODAY,
    });
    expect(data.totals.receitaTotal).toBe(9000);
    expect(data.totals.despesaTotal).toBe(2200);
    expect(data.totals.lucroTotal).toBe(6800);
  });

  it("mesesNoLucro e mesesNoPrejuizo contam corretamente (meses vazios ignorados)", () => {
    const data = aggregateProfitAndLoss({
      payments: [
        { paymentDate: "2026-03-05", amount: 1000, status: "pago" }, // lucro: sem despesa
        { paymentDate: "2026-04-05", amount: 500, status: "pago" },   // prejuízo: despesa maior
      ],
      revenues: [],
      expenses: [
        { month: "2026-04", category: "fixo", amount: 2000, isPaid: true },
      ],
      today: TODAY,
    });
    expect(data.totals.mesesNoLucro).toBe(1);    // março
    expect(data.totals.mesesNoPrejuizo).toBe(1); // abril
  });

  it("margemMedia null quando receita total = 0", () => {
    const data = aggregateProfitAndLoss({
      payments: [],
      revenues: [],
      expenses: [{ month: "2026-04", category: "fixo", amount: 500, isPaid: true }],
      today: TODAY,
    });
    expect(data.totals.margemMedia).toBeNull();
  });

  it("breakdown fixo/variável nos totais", () => {
    const data = aggregateProfitAndLoss({
      payments: [],
      revenues: [],
      expenses: [
        { month: "2026-03", category: "fixo", amount: 2000, isPaid: true },
        { month: "2026-04", category: "fixo", amount: 2000, isPaid: true },
        { month: "2026-04", category: "variavel", amount: 500, isPaid: true },
      ],
      today: TODAY,
    });
    expect(data.totals.despesaFixaTotal).toBe(4000);
    expect(data.totals.despesaVariavelTotal).toBe(500);
  });
});
