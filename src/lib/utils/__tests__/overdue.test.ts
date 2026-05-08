import { describe, it, expect } from "vitest";
import { buildOverdueRows, type PlanForOverdue } from "../overdue";

const TODAY = new Date("2026-05-08T12:00:00Z");

function plan(overrides: Partial<PlanForOverdue> = {}): PlanForOverdue {
  return {
    id: 1,
    clientName: "Cliente",
    planType: "Padrão",
    planValue: 1000,
    billingCycleDays: 10,
    billingCycleDays2: null,
    gapMonths: [],
    ...overrides,
  };
}

describe("buildOverdueRows", () => {
  it("retorna lista vazia quando o plano não tem gaps", () => {
    const rows = buildOverdueRows([plan({ gapMonths: [] })], TODAY);
    expect(rows).toEqual([]);
  });

  it("gera 1 linha para 1 gap (single billing) com valor cheio", () => {
    const rows = buildOverdueRows(
      [plan({ gapMonths: ["2026-04-10"] })],
      TODAY
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      planId: 1,
      clientName: "Cliente",
      planType: "Padrão",
      rowValue: 1000,
      dueDate: "2026-04-10",
      hasBillingCycle: true,
    });
    // 8 de maio - 10 de abril = 28 dias
    expect(rows[0].diasAtraso).toBe(28);
  });

  it("gera múltiplas linhas para múltiplos gaps (caso Gabrielle: jan + fev)", () => {
    const rows = buildOverdueRows(
      [
        plan({
          id: 42,
          clientName: "Gabrielle Rousseau",
          gapMonths: ["2026-01-10", "2026-02-10"],
        }),
      ],
      TODAY
    );
    expect(rows).toHaveLength(2);
    // Mais antigo primeiro (maior diasAtraso)
    expect(rows[0].dueDate).toBe("2026-01-10");
    expect(rows[1].dueDate).toBe("2026-02-10");
    expect(rows[0].diasAtraso).toBeGreaterThan(rows[1].diasAtraso);
    // Cada linha referencia o mesmo plano
    expect(rows[0].planId).toBe(42);
    expect(rows[1].planId).toBe(42);
  });

  it("usa planValue/2 quando há billingCycleDays2 (cada vencimento é meia mensalidade)", () => {
    const rows = buildOverdueRows(
      [
        plan({
          planValue: 800,
          billingCycleDays: 10,
          billingCycleDays2: 25,
          gapMonths: ["2026-04-10", "2026-04-25"],
        }),
      ],
      TODAY
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].rowValue).toBe(400);
    expect(rows[1].rowValue).toBe(400);
  });

  it("ordena cross-plan: mais antigo de qualquer cliente vem primeiro", () => {
    const rows = buildOverdueRows(
      [
        plan({ id: 1, clientName: "A", gapMonths: ["2026-03-10"] }),
        plan({ id: 2, clientName: "B", gapMonths: ["2026-01-10"] }),
        plan({ id: 3, clientName: "C", gapMonths: ["2026-04-10"] }),
      ],
      TODAY
    );
    expect(rows.map((r) => r.clientName)).toEqual(["B", "A", "C"]);
  });

  it("hasBillingCycle=false quando o plano não tem billingCycleDays", () => {
    const rows = buildOverdueRows(
      [plan({ billingCycleDays: null, gapMonths: ["2026-04-10"] })],
      TODAY
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].hasBillingCycle).toBe(false);
  });

  it("ignora plano sem gapMonths definidos (array vazio é equivalente)", () => {
    const rows = buildOverdueRows(
      [
        plan({ id: 1, gapMonths: [] }),
        plan({ id: 2, gapMonths: ["2026-02-10"] }),
      ],
      TODAY
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].planId).toBe(2);
  });

  it("diasAtraso é zero quando o gap é hoje", () => {
    const rows = buildOverdueRows(
      [plan({ gapMonths: ["2026-05-08"] })],
      TODAY
    );
    expect(rows[0].diasAtraso).toBe(0);
  });
});
