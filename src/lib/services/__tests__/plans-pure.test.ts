import { describe, it, expect } from "vitest";
import {
  calculateGapsForPlan,
  findLastPaymentDate,
  type PlanForGaps,
} from "../plans";

// ─── findLastPaymentDate ──────────────────────────────────────────────────────

describe("findLastPaymentDate", () => {
  it("retorna null quando lista vazia", () => {
    expect(findLastPaymentDate([])).toBe(null);
  });

  it("retorna a data quando há um único pagamento", () => {
    expect(
      findLastPaymentDate([{ paymentDate: "2026-04-10", skipped: false }])
    ).toBe("2026-04-10");
  });

  it("retorna a mais recente entre múltiplos pagamentos", () => {
    expect(
      findLastPaymentDate([
        { paymentDate: "2026-02-10", skipped: false },
        { paymentDate: "2026-04-10", skipped: false },
        { paymentDate: "2026-03-10", skipped: false },
      ])
    ).toBe("2026-04-10");
  });

  it("ignora registros com skipped=true", () => {
    expect(
      findLastPaymentDate([
        { paymentDate: "2026-02-10", skipped: false },
        { paymentDate: "2026-05-10", skipped: true },
        { paymentDate: "2026-03-10", skipped: false },
      ])
    ).toBe("2026-03-10");
  });

  it("retorna null se todos forem skipped", () => {
    expect(
      findLastPaymentDate([
        { paymentDate: "2026-02-10", skipped: true },
        { paymentDate: "2026-04-10", skipped: true },
      ])
    ).toBe(null);
  });
});

// ─── calculateGapsForPlan ─────────────────────────────────────────────────────

const REF = "2026-05-15";

function plan(p: Partial<PlanForGaps>): PlanForGaps {
  return {
    startDate: "2026-01-15",
    endDate: null,
    billingCycleDays: 15,
    billingCycleDays2: null,
    ...p,
  };
}

describe("calculateGapsForPlan", () => {
  it("retorna [] quando billingCycleDays é null", () => {
    expect(
      calculateGapsForPlan(plan({ billingCycleDays: null }), [], REF)
    ).toEqual([]);
  });

  it("retorna [] quando todos os meses esperados têm pagamento", () => {
    const payments = [
      { paymentDate: "2026-02-15", skipped: false },
      { paymentDate: "2026-03-15", skipped: false },
      { paymentDate: "2026-04-15", skipped: false },
      { paymentDate: "2026-05-15", skipped: false },
    ];
    expect(calculateGapsForPlan(plan({}), payments, REF)).toEqual([]);
  });

  it("detecta meses sem pagamento como gaps", () => {
    // Plano começa 15/01, hoje 15/05 — esperados: fev, mar, abr, mai
    // Pago: só maio (mais recente). Gaps: fev, mar, abr.
    const payments = [{ paymentDate: "2026-05-15", skipped: false }];
    expect(calculateGapsForPlan(plan({}), payments, REF)).toEqual([
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  it("registros com skipped=true fecham o gap daquele mês", () => {
    const payments = [
      { paymentDate: "2026-02-15", skipped: false },
      { paymentDate: "2026-03-15", skipped: true }, // congelado
      { paymentDate: "2026-04-15", skipped: false },
      { paymentDate: "2026-05-15", skipped: false },
    ];
    expect(calculateGapsForPlan(plan({}), payments, REF)).toEqual([]);
  });

  it("respeita endDate", () => {
    // Plano encerrado em 15/03 — só fev é esperado entre fev e mar.
    const payments: Array<{ paymentDate: string; skipped: boolean }> = [];
    expect(
      calculateGapsForPlan(
        plan({ endDate: "2026-03-15" }),
        payments,
        REF
      )
    ).toEqual(["2026-02-15", "2026-03-15"]);
  });

  it("respeita minDate (corte histórico)", () => {
    const payments: Array<{ paymentDate: string; skipped: boolean }> = [];
    // Sem cutoff: gaps começam em fev/26
    // Com minDate 2026-04-01: gaps começam só de abr/26
    expect(
      calculateGapsForPlan(plan({}), payments, REF, "2026-04-01")
    ).toEqual(["2026-04-15", "2026-05-15"]);
  });

  it("caso Gabriele: 4 meses em aberto, 1 pago (mais recente) → 3 gaps", () => {
    // Plano fev/26 → maio/26, paga só o último
    const payments = [{ paymentDate: "2026-05-15", skipped: false }];
    const result = calculateGapsForPlan(plan({}), payments, REF);
    expect(result).toHaveLength(3);
    expect(result).toEqual(["2026-02-15", "2026-03-15", "2026-04-15"]);
  });
});
