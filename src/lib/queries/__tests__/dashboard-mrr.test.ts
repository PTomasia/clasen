import { describe, it, expect, vi } from "vitest";

// Mocka o módulo db global para não tentar conectar ao Turso durante testes.
vi.mock("../../db", () => ({ db: {} }));

import {
  aggregateMrr,
  type MRRPoint,
  type PlanForMrr,
  type PaymentForMrr,
} from "../dashboard";

const TODAY = new Date("2026-05-22");
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
    paymentDate: "2026-04-15",
    amount: 1000,
    status: "pago",
    skipped: false,
    ...overrides,
  };
}

// ─── Janela ──────────────────────────────────────────────────────────────────

describe("aggregateMrr — janela", () => {
  it("retorna 12 meses do atual aos 11 anteriores", () => {
    const result = aggregateMrr({ plans: [], payments: [], today: TODAY, cutoff: CUTOFF });
    expect(result).toHaveLength(12);
    expect(result[0].month).toBe("2025-06");
    expect(result[11].month).toBe("2026-05");
  });

  it("label pt-BR (Mai/26)", () => {
    const result = aggregateMrr({ plans: [], payments: [], today: TODAY, cutoff: CUTOFF });
    const may = result.find((r) => r.month === "2026-05")!;
    expect(may.label).toBe("Mai/26");
  });
});

// ─── Meses passados: realizado (pago + pendente) ─────────────────────────────

describe("aggregateMrr — meses passados (realizado)", () => {
  it("soma pagamentos com status='pago' no mês", () => {
    const payments = [
      payment({ planId: 1, paymentDate: "2026-04-10", amount: 800, status: "pago" }),
      payment({ planId: 2, paymentDate: "2026-04-20", amount: 700, status: "pago" }),
    ];
    const result = aggregateMrr({ plans: [], payments, today: TODAY, cutoff: CUTOFF });
    const apr = result.find((r) => r.month === "2026-04")!;
    expect(apr.value).toBe(1500);
  });

  it("soma pagamentos com status='pendente' no mês", () => {
    const payments = [
      payment({ paymentDate: "2026-04-10", amount: 500, status: "pago" }),
      payment({ paymentDate: "2026-04-15", amount: 300, status: "pendente" }),
    ];
    const result = aggregateMrr({ plans: [], payments, today: TODAY, cutoff: CUTOFF });
    const apr = result.find((r) => r.month === "2026-04")!;
    expect(apr.value).toBe(800);
  });

  it("ignora status='inadimplente'", () => {
    const payments = [
      payment({ paymentDate: "2026-04-10", amount: 500, status: "pago" }),
      payment({ paymentDate: "2026-04-20", amount: 400, status: "inadimplente" }),
    ];
    const result = aggregateMrr({ plans: [], payments, today: TODAY, cutoff: CUTOFF });
    const apr = result.find((r) => r.month === "2026-04")!;
    expect(apr.value).toBe(500);
  });

  it("pagamentos congelados (skipped=true, amount=0) não somam", () => {
    const payments = [
      payment({ paymentDate: "2026-04-10", amount: 500, status: "pago" }),
      payment({ paymentDate: "2026-04-15", amount: 0, status: "pago", skipped: true }),
    ];
    const result = aggregateMrr({ plans: [], payments, today: TODAY, cutoff: CUTOFF });
    const apr = result.find((r) => r.month === "2026-04")!;
    expect(apr.value).toBe(500);
  });

  it("respeita cutoff FINANCIAL_DATA_START — meses antes do cutoff ficam zerados", () => {
    const payments = [
      payment({ paymentDate: "2025-12-10", amount: 800, status: "pago" }),
    ];
    const result = aggregateMrr({ plans: [], payments, today: TODAY, cutoff: CUTOFF });
    const dec25 = result.find((r) => r.month === "2025-12")!;
    expect(dec25.value).toBe(0);
  });

  it("não conta pagamentos de outros meses dentro do mesmo mês alvo", () => {
    const payments = [
      payment({ paymentDate: "2026-03-30", amount: 500, status: "pago" }),
      payment({ paymentDate: "2026-04-01", amount: 700, status: "pago" }),
    ];
    const result = aggregateMrr({ plans: [], payments, today: TODAY, cutoff: CUTOFF });
    const apr = result.find((r) => r.month === "2026-04")!;
    const mar = result.find((r) => r.month === "2026-03")!;
    expect(apr.value).toBe(700);
    expect(mar.value).toBe(500);
  });
});

// ─── Mês corrente: contratado (planos ativos) ─────────────────────────────────

describe("aggregateMrr — mês corrente (contratado)", () => {
  it("soma planValue dos planos ativos no mês corrente, ignorando pagamentos", () => {
    const plans = [
      plan({ id: 1, planValue: 1500, startDate: "2026-01-01", endDate: null }),
      plan({ id: 2, planValue: 800, startDate: "2026-03-01", endDate: null }),
    ];
    // pagamentos do mês corrente NÃO devem influenciar
    const payments = [
      payment({ planId: 1, paymentDate: "2026-05-10", amount: 1500, status: "pago" }),
    ];
    const result = aggregateMrr({ plans, payments, today: TODAY, cutoff: CUTOFF });
    const may = result.find((r) => r.month === "2026-05")!;
    expect(may.value).toBe(2300);
  });

  it("inclui plano que entrou no mês corrente (startDate <= último dia)", () => {
    const plans = [
      plan({ id: 1, planValue: 1000, startDate: "2026-05-20", endDate: null }),
    ];
    const result = aggregateMrr({ plans, payments: [], today: TODAY, cutoff: CUTOFF });
    const may = result.find((r) => r.month === "2026-05")!;
    expect(may.value).toBe(1000);
  });

  it("exclui plano cuja endDate é antes do primeiro dia do mês corrente", () => {
    const plans = [
      plan({ id: 1, planValue: 1000, startDate: "2026-01-01", endDate: "2026-04-30" }),
    ];
    const result = aggregateMrr({ plans, payments: [], today: TODAY, cutoff: CUTOFF });
    const may = result.find((r) => r.month === "2026-05")!;
    expect(may.value).toBe(0);
  });

  it("inclui plano cancelado no meio do mês corrente (endDate >= primeiro dia)", () => {
    const plans = [
      plan({ id: 1, planValue: 1000, startDate: "2026-01-01", endDate: "2026-05-15" }),
    ];
    const result = aggregateMrr({ plans, payments: [], today: TODAY, cutoff: CUTOFF });
    const may = result.find((r) => r.month === "2026-05")!;
    expect(may.value).toBe(1000);
  });

  it("exclui plano que só vai começar depois do mês corrente", () => {
    const plans = [
      plan({ id: 1, planValue: 1000, startDate: "2026-06-01", endDate: null }),
    ];
    const result = aggregateMrr({ plans, payments: [], today: TODAY, cutoff: CUTOFF });
    const may = result.find((r) => r.month === "2026-05")!;
    expect(may.value).toBe(0);
  });
});

// ─── Integração: cenário do bug ──────────────────────────────────────────────

describe("aggregateMrr — cenário real (22/05/2026)", () => {
  it("mês corrente reflete planos ativos mesmo sem pagamentos ainda registrados", () => {
    // 4 planos ativos somando R$ 21.000
    const plans = [
      plan({ id: 1, planValue: 6000, startDate: "2026-01-01", endDate: null }),
      plan({ id: 2, planValue: 5000, startDate: "2026-02-01", endDate: null }),
      plan({ id: 3, planValue: 5000, startDate: "2026-03-01", endDate: null }),
      plan({ id: 4, planValue: 5000, startDate: "2026-04-01", endDate: null }),
    ];
    // Em 22/05, só metade dos pagamentos de maio foram registrados
    const payments = [
      payment({ planId: 1, paymentDate: "2026-05-05", amount: 6000, status: "pago" }),
      payment({ planId: 2, paymentDate: "2026-05-10", amount: 5000, status: "pago" }),
    ];
    const result = aggregateMrr({ plans, payments, today: TODAY, cutoff: CUTOFF });
    const may = result.find((r) => r.month === "2026-05")!;
    // ANTES: somaria só R$11k (pagos). DEPOIS: R$21k (contratado).
    expect(may.value).toBe(21000);
  });
});
