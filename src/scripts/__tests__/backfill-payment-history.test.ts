import { describe, expect, it } from "vitest";

import {
  buildPaymentBackfill,
  normalizeName,
  resolvePlan,
  toIsoDate,
} from "../../../scripts/backfill-payment-history.mjs";

const activePlan = {
  id: 10,
  client_id: 20,
  plan_value: 400,
  billing_cycle_days: 30,
  billing_cycle_days_2: null,
  start_date: "2024-10-01",
  status: "ativo",
  end_date: null,
};

describe("backfill-payment-history", () => {
  it("normaliza nomes com acentos, caixa e espaços", () => {
    expect(normalizeName("  Beatriz   Viçoza ")).toBe("beatriz vicoza");
  });

  it("converte datas brasileiras para ISO", () => {
    expect(toIsoDate("13/03/2026")).toBe("2026-03-13");
  });

  it("gera pagamentos mensais do mês seguinte ao início até o mês pago", () => {
    const result = buildPaymentBackfill(
      activePlan,
      { clientName: "Bárbara Brandao", paidUntil: "13/03/2026", billingDay: 30, amount: 400 },
      []
    );

    expect(result.payments).toHaveLength(17);
    expect(result.payments[0]).toMatchObject({
      month: "2024-11",
      paymentDate: "2024-11-30",
      amount: 400,
    });
    expect(result.payments.at(-1)).toMatchObject({
      month: "2026-03",
      paymentDate: "2026-03-13",
    });
    expect(result.nextPaymentDate).toBe("2026-04-30");
  });

  it("não duplica mês que já tem pagamento registrado", () => {
    const result = buildPaymentBackfill(
      activePlan,
      { clientName: "Bárbara Brandao", paidUntil: "13/03/2026", billingDay: 30, amount: 400 },
      [{ payment_date: "2025-02-15" }]
    );

    expect(result.payments.map((payment: { month: string }) => payment.month)).not.toContain("2025-02");
    expect(result.payments).toHaveLength(16);
  });

  it("seleciona o plano inativo quando o alvo exige inativo", () => {
    const active = { ...activePlan, id: 1, status: "ativo", end_date: null };
    const inactive = { ...activePlan, id: 2, status: "cancelado", end_date: "2026-03-20" };

    const result = resolvePlan([active, inactive], {
      clientName: "Borba Gato",
      paidUntil: "11/03/2026",
      billingDay: 10,
      amount: 400,
      inactiveOnly: true,
    });

    expect(result.status).toBe("ok");
    expect(result.plan.id).toBe(2);
  });

  it("seleciona plano inativo pelo valor quando o plano ativo é outro contrato", () => {
    const active = { ...activePlan, id: 1, plan_value: 1620, status: "ativo", end_date: null };
    const inactive = { ...activePlan, id: 2, plan_value: 1000, status: "cancelado", end_date: "2026-05-01" };

    const result = resolvePlan([active, inactive], {
      clientName: "Rebeca",
      paidUntil: "10/03/2026",
      billingDay: 30,
      amount: 1000,
    });

    expect(result.status).toBe("ok");
    expect(result.plan.id).toBe(2);
    expect(result.warnings).toContain("plano selecionado está inativo/cancelado");
  });

  it("bloqueia quando nenhum plano bate com o valor informado", () => {
    const result = resolvePlan([{ ...activePlan, plan_value: 800, status: "cancelado", end_date: "2026-04-12" }], {
      clientName: "Borba Gato",
      paidUntil: "11/03/2026",
      billingDay: 10,
      amount: 900,
      inactiveOnly: true,
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("valor informado");
  });

  it("bloqueia seleção ambígua", () => {
    const planA = { ...activePlan, id: 1 };
    const planB = { ...activePlan, id: 2 };

    const result = resolvePlan([planA, planB], {
      clientName: "Cliente Duplicado",
      paidUntil: "13/03/2026",
      billingDay: 30,
      amount: 400,
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("ambígua");
  });
});
