import { describe, it, expect, vi } from "vitest";

// Mocka o módulo db global para não tentar conectar ao Turso/SQLite durante testes.
// Os testes aqui exercitam apenas a função pura `aggregateUnitEconomics`.
vi.mock("../../db", () => ({ db: {} }));

import { aggregateUnitEconomics } from "../unit-economics";

// Helper: encontra uma linha no output por mês
function pickMonth(data: ReturnType<typeof aggregateUnitEconomics>, m: string) {
  const row = data.rows.find((r) => r.month === m);
  if (!row) throw new Error(`mês ${m} não encontrado nos rows`);
  return row;
}

const TODAY = new Date("2026-04-15");

describe("aggregateUnitEconomics — janela de 12 meses", () => {
  it("retorna 12 linhas cobrindo os últimos 12 meses (inclusivo do atual)", () => {
    const data = aggregateUnitEconomics({
      plans: [],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(data.rows).toHaveLength(12);
    expect(data.rows[0].month).toBe("2025-05");
    expect(data.rows[11].month).toBe("2026-04");
  });

  it("label usa abreviação PT-BR com ano de 2 dígitos", () => {
    const data = aggregateUnitEconomics({
      plans: [],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2026-04").label).toBe("Abr/26");
    expect(pickMonth(data, "2025-12").label).toBe("Dez/25");
  });
});

describe("aggregateUnitEconomics — novos clientes", () => {
  it("conta cliente apenas no mês do PRIMEIRO plano, não em upgrades", () => {
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 500, startDate: "2026-01-10", endDate: "2026-02-28" }, // plano 1
        { clientId: 1, planValue: 700, startDate: "2026-03-01", endDate: null }, // upgrade
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2026-01").novosClientes).toBe(1);
    expect(pickMonth(data, "2026-03").novosClientes).toBe(0); // upgrade, não é "novo"
  });

  it("não conta clientes cujo primeiro plano é anterior à janela de 12m", () => {
    const data = aggregateUnitEconomics({
      plans: [
        // antes da janela (2024-06 < 2025-05)
        { clientId: 1, planValue: 500, startDate: "2024-06-01", endDate: null },
        // dentro da janela
        { clientId: 2, planValue: 500, startDate: "2026-02-01", endDate: null },
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    const total = data.rows.reduce((s, r) => s + r.novosClientes, 0);
    expect(total).toBe(1);
    expect(pickMonth(data, "2026-02").novosClientes).toBe(1);
  });
});

describe("aggregateUnitEconomics — churn", () => {
  it("conta churn quando TODOS os planos do cliente têm end_date e o último caiu no mês", () => {
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 500, startDate: "2025-01-01", endDate: "2026-02-28" },
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2026-02").churned).toBe(1);
    expect(pickMonth(data, "2026-03").churned).toBe(0);
  });

  it("NÃO conta churn se o cliente ainda tem um plano ativo", () => {
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 500, startDate: "2025-01-01", endDate: "2026-02-28" },
        { clientId: 1, planValue: 700, startDate: "2026-03-01", endDate: null }, // voltou
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2026-02").churned).toBe(0);
  });

  it("considera o MAIOR end_date quando há múltiplos planos encerrados", () => {
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 500, startDate: "2025-01-01", endDate: "2025-08-31" },
        { clientId: 1, planValue: 700, startDate: "2025-09-01", endDate: "2026-03-31" },
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2025-08").churned).toBe(0); // ainda voltou depois
    expect(pickMonth(data, "2026-03").churned).toBe(1); // último end_date real
  });
});

describe("aggregateUnitEconomics — ativos no início do mês", () => {
  it("plano start=2026-02-15 conta em março (não em fev)", () => {
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 500, startDate: "2026-02-15", endDate: null },
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2026-02").ativosInicio).toBe(0);
    expect(pickMonth(data, "2026-03").ativosInicio).toBe(1);
  });

  it("plano encerrado no meio do mês conta como ativo no início daquele mês", () => {
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 500, startDate: "2025-10-01", endDate: "2026-03-15" },
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2026-03").ativosInicio).toBe(1); // end_date >= monthStart
    expect(pickMonth(data, "2026-04").ativosInicio).toBe(0); // já encerrado
  });

  it("cliente com múltiplos planos no mesmo mês conta 1x (dedupe por clientId)", () => {
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 500, startDate: "2025-10-01", endDate: "2026-01-31" },
        { clientId: 1, planValue: 700, startDate: "2025-11-01", endDate: null }, // upgrade paralelo
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2026-01").ativosInicio).toBe(1);
  });
});

describe("aggregateUnitEconomics — receita", () => {
  it("soma pagamentos pagos + avulsas pagas do mês", () => {
    const data = aggregateUnitEconomics({
      plans: [],
      payments: [
        { clientId: 1, paymentDate: "2026-04-05", amount: 800, status: "pago" },
        { clientId: 2, paymentDate: "2026-04-10", amount: 500, status: "pendente" }, // ignora
      ],
      revenues: [
        { clientId: 1, date: "2026-04-15", amount: 200, isPaid: true },
        { clientId: null, date: "2026-04-15", amount: 100, isPaid: false }, // ignora
      ],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2026-04").receita).toBe(1000); // 800 + 200
  });
});

describe("aggregateUnitEconomics — CAC, ROAS, churn rate", () => {
  it("CAC = ad_spend / novos; null se novos=0", () => {
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 500, startDate: "2026-04-05", endDate: null },
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map([["2026-04", 1200]]),
      today: TODAY,
    });
    expect(pickMonth(data, "2026-04").cac).toBe(1200);
    expect(pickMonth(data, "2026-03").cac).toBeNull(); // sem novos
  });

  it("ROAS null quando ad_spend=0", () => {
    const data = aggregateUnitEconomics({
      plans: [],
      payments: [
        { clientId: 1, paymentDate: "2026-04-05", amount: 500, status: "pago" },
      ],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2026-04").roas).toBeNull();
  });
});

describe("aggregateUnitEconomics — totais", () => {
  it("LTV médio ignora clientes sem pagamento", () => {
    // Cliente 1: 3 pagamentos totalizando 900
    // Cliente 2: 2 pagamentos totalizando 400 + 1 avulsa de 100 → LTV=500
    // Cliente 3: SEM pagamento pago (só pendente) → NÃO entra na média
    const data = aggregateUnitEconomics({
      plans: [],
      payments: [
        { clientId: 1, paymentDate: "2026-01-01", amount: 300, status: "pago" },
        { clientId: 1, paymentDate: "2026-02-01", amount: 300, status: "pago" },
        { clientId: 1, paymentDate: "2026-03-01", amount: 300, status: "pago" },
        { clientId: 2, paymentDate: "2026-01-01", amount: 200, status: "pago" },
        { clientId: 2, paymentDate: "2026-02-01", amount: 200, status: "pago" },
        { clientId: 3, paymentDate: "2026-01-01", amount: 500, status: "pendente" },
      ],
      revenues: [
        { clientId: 2, date: "2026-03-01", amount: 100, isPaid: true },
      ],
      adSpendMap: new Map(),
      today: TODAY,
    });

    // LTV médio = (900 + 500) / 2 = 700
    expect(data.totals.ltvMedio).toBe(700);
  });

  it("ticket médio mensal considera apenas planos ativos", () => {
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 600, startDate: "2025-01-01", endDate: null },
        { clientId: 2, planValue: 1000, startDate: "2025-01-01", endDate: null },
        { clientId: 3, planValue: 9999, startDate: "2024-01-01", endDate: "2025-12-31" }, // encerrado, ignora
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(data.totals.ticketMedioMensal).toBe(800); // média de 600 e 1000
  });

  it("LTV:CAC e Payback ficam null quando CAC é null (sem novos no período)", () => {
    const data = aggregateUnitEconomics({
      plans: [],
      payments: [],
      revenues: [],
      adSpendMap: new Map([["2026-04", 1000]]),
      today: TODAY,
    });
    expect(data.totals.cacMedio).toBeNull();
    expect(data.totals.ltvCacRatio).toBeNull();
    expect(data.totals.paybackMeses).toBeNull();
  });
});

// ─── CUT-1: corte temporal jan/2026 ──────────────────────────────────────────

describe("aggregateUnitEconomics — revenueChurnRate", () => {
  it("revenueChurnRate = receitaPerdida / receitaAtivoInicio", () => {
    // Cliente 1: plano de 500/mês, encerra em fev/26 → churned em fev
    // Cliente 2: plano de 1000/mês, ativo sem fim
    // mrrInicio fev = 500 + 1000 = 1500; receitaPerdida fev = 500
    // revenueChurnRate = 500 / 1500 ≈ 0.3333
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 500, startDate: "2025-01-01", endDate: "2026-02-28" },
        { clientId: 2, planValue: 1000, startDate: "2025-01-01", endDate: null },
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    const fev = pickMonth(data, "2026-02");
    expect(fev.revenueChurnRate).toBeCloseTo(500 / 1500, 5);
  });

  it("revenueChurnRate null quando não há ativos no início do mês", () => {
    const data = aggregateUnitEconomics({
      plans: [],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2026-04").revenueChurnRate).toBeNull();
  });

  it("cliente com múltiplos planos: soma todos os planValues na perda e no início", () => {
    // Cliente 1: dois planos simultâneos (500 + 300), encerram em março
    // Apenas cliente 1 no mês: mrrInicio = 800, receitaPerdida = 800
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 500, startDate: "2025-01-01", endDate: "2026-03-31" },
        { clientId: 1, planValue: 300, startDate: "2025-01-01", endDate: "2026-03-31" },
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    const mar = pickMonth(data, "2026-03");
    expect(mar.revenueChurnRate).toBeCloseTo(1, 5); // 800/800 = 100%
  });

  it("não conta planos de clientes que têm plano ativo (sem churn)", () => {
    // Cliente tem plano antigo encerrado + plano novo ativo → sem churn
    const data = aggregateUnitEconomics({
      plans: [
        { clientId: 1, planValue: 500, startDate: "2025-01-01", endDate: "2026-02-28" },
        { clientId: 1, planValue: 700, startDate: "2026-03-01", endDate: null }, // voltou
        { clientId: 2, planValue: 1000, startDate: "2025-01-01", endDate: null },
      ],
      payments: [],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    // Cliente 1 não churn em fev (tem plano ativo); revenueChurnRate deve ser 0/mrrInicio
    const fev = pickMonth(data, "2026-02");
    expect(fev.revenueChurnRate).toBe(0); // nenhuma receita perdida / mrrInicio > 0
  });
});

describe("aggregateUnitEconomics — corte temporal (financialDataStart)", () => {
  it("exclui pagamentos anteriores ao corte da receita mensal", () => {
    const data = aggregateUnitEconomics({
      plans: [],
      payments: [
        { clientId: 1, paymentDate: "2025-12-10", amount: 9999, status: "pago" }, // excluído
        { clientId: 1, paymentDate: "2026-01-10", amount: 500, status: "pago" },  // incluído
      ],
      revenues: [],
      adSpendMap: new Map(),
      financialDataStart: "2026-01-01",
      today: TODAY,
    });
    expect(pickMonth(data, "2025-12").receita).toBe(0);
    expect(pickMonth(data, "2026-01").receita).toBe(500);
  });

  it("exclui receitas avulsas anteriores ao corte", () => {
    const data = aggregateUnitEconomics({
      plans: [],
      payments: [],
      revenues: [
        { clientId: 1, date: "2025-11-05", amount: 7777, isPaid: true }, // excluído
        { clientId: 1, date: "2026-02-05", amount: 200, isPaid: true },  // incluído
      ],
      adSpendMap: new Map(),
      financialDataStart: "2026-01-01",
      today: TODAY,
    });
    expect(pickMonth(data, "2025-11").receita).toBe(0);
    expect(pickMonth(data, "2026-02").receita).toBe(200);
  });

  it("LTV exclui pagamentos pré-corte (recalculado apenas com 2026+)", () => {
    const data = aggregateUnitEconomics({
      plans: [],
      payments: [
        { clientId: 1, paymentDate: "2025-06-01", amount: 5000, status: "pago" }, // excluído do LTV
        { clientId: 1, paymentDate: "2026-01-01", amount: 600, status: "pago" },  // incluído
      ],
      revenues: [],
      adSpendMap: new Map(),
      financialDataStart: "2026-01-01",
      today: TODAY,
    });
    // LTV de cliente 1 = 600 (apenas 2026+)
    expect(data.totals.ltvMedio).toBe(600);
  });

  it("sem financialDataStart inclui tudo (comportamento legacy)", () => {
    const data = aggregateUnitEconomics({
      plans: [],
      payments: [
        { clientId: 1, paymentDate: "2025-12-01", amount: 400, status: "pago" },
      ],
      revenues: [],
      adSpendMap: new Map(),
      today: TODAY,
    });
    expect(pickMonth(data, "2025-12").receita).toBe(400);
  });
});
