import { describe, it, expect, vi } from "vitest";

// Mocka o módulo db global para não tentar conectar ao Turso durante testes.
vi.mock("../../db", () => ({ db: {} }));

import {
  aggregateResumoMensal,
  aggregateCobrancaMensal,
  type PlanForMrr,
  type PaymentForMrr,
} from "../dashboard";

const TODAY = new Date("2026-07-17");
const CUTOFF = "2026-01-01";

function plan(overrides: Partial<PlanForMrr> = {}): PlanForMrr {
  return {
    id: 1,
    clientId: 1,
    planValue: 1000,
    startDate: "2026-01-01",
    endDate: null,
    ...overrides,
  };
}

function payment(overrides: Partial<PaymentForMrr> = {}): PaymentForMrr {
  return {
    planId: 1,
    paymentDate: "2026-06-10",
    amount: 1000,
    status: "pago",
    skipped: false,
    ...overrides,
  };
}

describe("aggregateResumoMensal", () => {
  it("só retorna meses a partir do cutoff (jan/26 em diante)", () => {
    const result = aggregateResumoMensal({
      plans: [plan()],
      payments: [],
      today: TODAY,
      cutoff: CUTOFF,
    });
    expect(result[0].month).toBe("2026-01");
    expect(result[result.length - 1].month).toBe("2026-07");
    expect(result).toHaveLength(7);
  });

  it("contratado espelha o MRR (planos ativos no mês); realizado soma os pagamentos do mês", () => {
    const plans = [plan({ id: 1, planValue: 1000 }), plan({ id: 2, planValue: 500, startDate: "2026-06-01" })];
    const payments = [
      payment({ planId: 1, paymentDate: "2026-06-05", amount: 1000 }),
      payment({ planId: 2, paymentDate: "2026-06-20", amount: 500 }),
      payment({ planId: 1, paymentDate: "2026-05-05", amount: 1000 }),
    ];
    const result = aggregateResumoMensal({ plans, payments, today: TODAY, cutoff: CUTOFF });
    const jun = result.find((r) => r.month === "2026-06")!;
    const mai = result.find((r) => r.month === "2026-05")!;
    expect(jun.contratado).toBe(1500);
    expect(jun.realizado).toBe(1500);
    expect(jun.pagamentos).toBe(2);
    expect(mai.contratado).toBe(1000);
    expect(mai.realizado).toBe(1000);
    expect(mai.pagamentos).toBe(1);
  });

  it("realizado conta pago+pendente e ignora inadimplente", () => {
    const payments = [
      payment({ paymentDate: "2026-06-05", amount: 800, status: "pago" }),
      payment({ paymentDate: "2026-06-10", amount: 200, status: "pendente" }),
      payment({ paymentDate: "2026-06-15", amount: 999, status: "inadimplente" }),
    ];
    const result = aggregateResumoMensal({ plans: [plan()], payments, today: TODAY, cutoff: CUTOFF });
    const jun = result.find((r) => r.month === "2026-06")!;
    expect(jun.realizado).toBe(1000);
    expect(jun.pagamentos).toBe(2);
  });

  it("mês congelado (skipped) não soma valor nem conta pagamento", () => {
    const payments = [
      payment({ paymentDate: "2026-06-05", amount: 0, skipped: true }),
      payment({ paymentDate: "2026-06-10", amount: 500 }),
    ];
    const result = aggregateResumoMensal({ plans: [plan()], payments, today: TODAY, cutoff: CUTOFF });
    const jun = result.find((r) => r.month === "2026-06")!;
    expect(jun.realizado).toBe(500);
    expect(jun.pagamentos).toBe(1);
  });

  it("mês sem pagamentos: realizado 0, contratado mantém (cenário conciliação atrasada)", () => {
    const result = aggregateResumoMensal({
      plans: [plan({ planValue: 2000 })],
      payments: [],
      today: TODAY,
      cutoff: CUTOFF,
    });
    const jul = result.find((r) => r.month === "2026-07")!;
    expect(jul.contratado).toBe(2000);
    expect(jul.realizado).toBe(0);
    expect(jul.pagamentos).toBe(0);
  });

  it("avulsas pagas somam no campo avulsas do mês; realizado (pacotes) fica intocado", () => {
    const payments = [payment({ paymentDate: "2026-06-05", amount: 1000 })];
    const revenues = [
      { date: "2026-06-10", amount: 350, isPaid: true },
      { date: "2026-06-25", amount: 150, isPaid: true },
      { date: "2026-05-02", amount: 90, isPaid: true },
    ];
    const result = aggregateResumoMensal({
      plans: [plan()],
      payments,
      revenues,
      today: TODAY,
      cutoff: CUTOFF,
    });
    const jun = result.find((r) => r.month === "2026-06")!;
    expect(jun.realizado).toBe(1000); // só pacotes
    expect(jun.avulsas).toBe(500); // 350 + 150
    expect(result.find((r) => r.month === "2026-05")!.avulsas).toBe(90);
  });

  it("avulsa não paga e avulsa antes do cutoff ficam fora", () => {
    const revenues = [
      { date: "2026-06-10", amount: 400, isPaid: false }, // pendente
      { date: "2025-12-20", amount: 999, isPaid: true }, // antes do cutoff
    ];
    const result = aggregateResumoMensal({
      plans: [plan()],
      payments: [],
      revenues,
      today: TODAY,
      cutoff: CUTOFF,
    });
    expect(result.find((r) => r.month === "2026-06")!.avulsas).toBe(0);
    expect(result.every((r) => r.avulsas === 0)).toBe(true);
  });

  it("sem revenues no input, avulsas = 0 (compatibilidade)", () => {
    const result = aggregateResumoMensal({
      plans: [plan()],
      payments: [],
      today: TODAY,
      cutoff: CUTOFF,
    });
    expect(result.every((r) => r.avulsas === 0)).toBe(true);
  });
});

describe("aggregateCobrancaMensal (competência: vencimentos do mês)", () => {
  const TODAY_STR = "2026-07-17";

  it("classifica vencimentos por mês: pago, congelado e em aberto", () => {
    // Plano dia 10, início jan → 1º vencimento em FEV. Fev pago, mar congelado,
    // abr..jul em aberto (mês corrente: dia 10 já venceu em 17/07).
    const plans = [
      { id: 1, startDate: "2026-01-01", endDate: null, billingCycleDays: 10, billingCycleDays2: null },
    ];
    const paymentsByPlan = new Map([
      [1, [
        { paymentDate: "2026-02-10", skipped: false },
        { paymentDate: "2026-03-05", skipped: true },
      ]],
    ]);
    const cobranca = aggregateCobrancaMensal({
      plans,
      paymentsByPlan,
      today: TODAY_STR,
      cutoff: CUTOFF,
    });
    expect(cobranca.get("2026-01")).toBeUndefined(); // sem vencimento no mês do start
    expect(cobranca.get("2026-02")).toEqual({ vencimentos: 1, pagos: 1, congelados: 0, abertos: 0 });
    expect(cobranca.get("2026-03")).toEqual({ vencimentos: 1, pagos: 0, congelados: 1, abertos: 0 });
    expect(cobranca.get("2026-04")).toEqual({ vencimentos: 1, pagos: 0, congelados: 0, abertos: 1 });
    expect(cobranca.get("2026-07")).toEqual({ vencimentos: 1, pagos: 0, congelados: 0, abertos: 1 });
  });

  it("mês corrente só conta vencimentos já vencidos (dia futuro fica fora)", () => {
    // Plano dia 25: em 17/07 o vencimento de julho ainda não chegou.
    const plans = [
      { id: 1, startDate: "2026-05-01", endDate: null, billingCycleDays: 25, billingCycleDays2: null },
    ];
    const cobranca = aggregateCobrancaMensal({
      plans,
      paymentsByPlan: new Map(),
      today: TODAY_STR,
      cutoff: CUTOFF,
    });
    expect(cobranca.get("2026-06")).toEqual({ vencimentos: 1, pagos: 0, congelados: 0, abertos: 1 });
    expect(cobranca.get("2026-07")).toBeUndefined(); // dia 25 ainda no futuro
  });

  it("dois vencimentos/mês somam 2 no denominador do mês", () => {
    const plans = [
      { id: 1, startDate: "2026-04-01", endDate: null, billingCycleDays: 5, billingCycleDays2: 20 },
    ];
    const paymentsByPlan = new Map([
      [1, [{ paymentDate: "2026-05-04", skipped: false }]], // cobre o dia 5
    ]);
    const cobranca = aggregateCobrancaMensal({
      plans,
      paymentsByPlan,
      today: TODAY_STR,
      cutoff: CUTOFF,
    });
    expect(cobranca.get("2026-05")).toEqual({ vencimentos: 2, pagos: 1, congelados: 0, abertos: 1 });
  });

  it("anexa a cobrança no ResumoMensalPoint pelo mês (e null sem vencimentos)", () => {
    const cobrancaPorMes = new Map([
      ["2026-06", { vencimentos: 10, pagos: 8, congelados: 1, abertos: 1 }],
    ]);
    const result = aggregateResumoMensal({
      plans: [plan()],
      payments: [],
      cobrancaPorMes,
      today: TODAY,
      cutoff: CUTOFF,
    });
    expect(result.find((r) => r.month === "2026-06")!.cobranca).toEqual({
      vencimentos: 10,
      pagos: 8,
      congelados: 1,
      abertos: 1,
    });
    expect(result.find((r) => r.month === "2026-05")!.cobranca).toBeNull();
  });
});
