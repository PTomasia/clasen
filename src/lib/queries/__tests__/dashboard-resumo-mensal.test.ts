import { describe, it, expect, vi } from "vitest";

// Mocka o módulo db global para não tentar conectar ao Turso durante testes.
vi.mock("../../db", () => ({ db: {} }));

import {
  aggregateResumoMensal,
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
