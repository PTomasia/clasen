import { describe, it, expect, vi } from "vitest";

// Mocka o módulo db global para não tentar conectar ao Turso durante testes.
vi.mock("../../db", () => ({ db: {} }));

import { isPlanAtrasado } from "../dashboard";

const TODAY = "2026-05-29";

describe("isPlanAtrasado", () => {
  it("atrasado quando há gaps (mês vencido sem resolução), independente do nextPaymentDate", () => {
    expect(
      isPlanAtrasado(
        { billingCycleDays: 10, nextPaymentDate: "2026-06-10" },
        ["2026-03-10"],
        TODAY
      )
    ).toBe(true);
  });

  it("NÃO atrasado quando sem gaps e mês congelado deixou nextPaymentDate no passado (Dara/Maju)", () => {
    // Mês congelado já saiu dos gaps → gaps vazios. nextPaymentDate ficou no
    // passado por não ter sido avançado, mas o cliente está em dia.
    expect(
      isPlanAtrasado(
        { billingCycleDays: 10, nextPaymentDate: "2026-05-10" },
        [],
        TODAY
      )
    ).toBe(false);
  });

  it("NÃO atrasado quando sem gaps e nextPaymentDate futuro", () => {
    expect(
      isPlanAtrasado(
        { billingCycleDays: 10, nextPaymentDate: "2026-06-10" },
        [],
        TODAY
      )
    ).toBe(false);
  });

  it("fallback: plano sem dia de vencimento usa nextPaymentDate vencido", () => {
    expect(
      isPlanAtrasado(
        { billingCycleDays: null, nextPaymentDate: "2026-05-10" },
        [],
        TODAY
      )
    ).toBe(true);
  });

  it("fallback: plano sem dia de vencimento e sem nextPaymentDate → não atrasado", () => {
    expect(
      isPlanAtrasado({ billingCycleDays: null, nextPaymentDate: null }, [], TODAY)
    ).toBe(false);
  });
});
