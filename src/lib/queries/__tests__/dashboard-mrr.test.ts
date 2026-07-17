import { describe, it, expect, vi } from "vitest";

// Mocka o módulo db global para não tentar conectar ao Turso durante testes.
vi.mock("../../db", () => ({ db: {} }));

import { aggregateMrr, type PlanForMrr } from "../dashboard";

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

// ─── Janela ──────────────────────────────────────────────────────────────────

describe("aggregateMrr — janela", () => {
  it("retorna 12 meses do atual aos 11 anteriores", () => {
    const result = aggregateMrr({ plans: [], today: TODAY, cutoff: CUTOFF });
    expect(result).toHaveLength(12);
    expect(result[0].month).toBe("2025-06");
    expect(result[11].month).toBe("2026-05");
  });

  it("label pt-BR (Mai/26)", () => {
    const result = aggregateMrr({ plans: [], today: TODAY, cutoff: CUTOFF });
    const may = result.find((r) => r.month === "2026-05")!;
    expect(may.label).toBe("Mai/26");
  });
});

// ─── Contratado em TODOS os meses (passados e corrente) ──────────────────────
// MRR = receita recorrente contratada: soma planValue dos planos ativos em
// algum dia do mês. Não depende de pagamentos — conciliação atrasada ou
// inadimplência não altera a série (o realizado vive no P&L).

describe("aggregateMrr — contratado em todos os meses", () => {
  it("plano ativo desde janeiro aparece com o mesmo valor em meses passados e no corrente", () => {
    const plans = [plan({ id: 1, planValue: 1000, startDate: "2026-01-01", endDate: null })];
    const result = aggregateMrr({ plans, today: TODAY, cutoff: CUTOFF });
    for (const m of ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]) {
      expect(result.find((r) => r.month === m)!.value).toBe(1000);
    }
  });

  it("mês passado inclui plano que entrou naquele mês (startDate <= último dia)", () => {
    const plans = [plan({ id: 1, planValue: 800, startDate: "2026-03-25", endDate: null })];
    const result = aggregateMrr({ plans, today: TODAY, cutoff: CUTOFF });
    expect(result.find((r) => r.month === "2026-02")!.value).toBe(0);
    expect(result.find((r) => r.month === "2026-03")!.value).toBe(800);
    expect(result.find((r) => r.month === "2026-04")!.value).toBe(800);
  });

  it("plano encerrado no meio de um mês passado conta naquele mês e some no seguinte", () => {
    const plans = [
      plan({ id: 1, planValue: 900, startDate: "2026-01-01", endDate: "2026-03-15" }),
    ];
    const result = aggregateMrr({ plans, today: TODAY, cutoff: CUTOFF });
    expect(result.find((r) => r.month === "2026-03")!.value).toBe(900);
    expect(result.find((r) => r.month === "2026-04")!.value).toBe(0);
  });

  it("mês corrente segue a mesma regra (planos ativos no mês)", () => {
    const plans = [
      plan({ id: 1, planValue: 1500, startDate: "2026-01-01", endDate: null }),
      plan({ id: 2, planValue: 800, startDate: "2026-05-20", endDate: null }),
      plan({ id: 3, planValue: 300, startDate: "2026-01-01", endDate: "2026-05-10" }),
    ];
    const result = aggregateMrr({ plans, today: TODAY, cutoff: CUTOFF });
    // ativo o mês todo + entrou no mês + saiu no meio do mês: todos contam
    expect(result.find((r) => r.month === "2026-05")!.value).toBe(2600);
  });

  it("exclui plano que só começa depois do mês", () => {
    const plans = [plan({ id: 1, planValue: 1000, startDate: "2026-06-01", endDate: null })];
    const result = aggregateMrr({ plans, today: TODAY, cutoff: CUTOFF });
    expect(result.find((r) => r.month === "2026-05")!.value).toBe(0);
  });

  it("respeita cutoff FINANCIAL_DATA_START — meses 100% antes do cutoff ficam zerados", () => {
    const plans = [plan({ id: 1, planValue: 1000, startDate: "2025-06-01", endDate: null })];
    const result = aggregateMrr({ plans, today: TODAY, cutoff: CUTOFF });
    expect(result.find((r) => r.month === "2025-12")!.value).toBe(0);
    expect(result.find((r) => r.month === "2026-01")!.value).toBe(1000);
  });
});

// ─── Mês do reajuste: vale o valor antigo, não o pós-reajuste ────────────────
// Reajuste = changePlan: encerra o plano antigo (endDate=D) e cria um novo
// (startDate=D, valor novo). No mês do reajuste os dois ficam "ativos no mês";
// vale o que vigia no início do mês (o antigo). No mês seguinte, o novo.

describe("aggregateMrr — reajuste (Upgrade/Downgrade)", () => {
  it("no mês do reajuste conta o valor antigo; no mês seguinte, o novo", () => {
    const plans = [
      plan({ id: 1, clientId: 1, planValue: 1000, startDate: "2026-01-01", endDate: "2026-03-15" }),
      plan({ id: 2, clientId: 1, planValue: 1200, startDate: "2026-03-15", endDate: null }),
    ];
    const result = aggregateMrr({ plans, today: TODAY, cutoff: CUTOFF });
    expect(result.find((r) => r.month === "2026-03")!.value).toBe(1000); // mês do reajuste
    expect(result.find((r) => r.month === "2026-04")!.value).toBe(1200); // já com valor novo
  });

  it("reajuste no mês corrente segue a mesma regra", () => {
    const plans = [
      plan({ id: 1, clientId: 1, planValue: 1000, startDate: "2026-01-01", endDate: "2026-05-15" }),
      plan({ id: 2, clientId: 1, planValue: 1200, startDate: "2026-05-15", endDate: null }),
    ];
    const result = aggregateMrr({ plans, today: TODAY, cutoff: CUTOFF });
    expect(result.find((r) => r.month === "2026-05")!.value).toBe(1000);
  });

  it("não confunde planos concorrentes (2 planos ativos do mesmo cliente) com reajuste", () => {
    const plans = [
      plan({ id: 1, clientId: 1, planValue: 1000, startDate: "2026-01-01", endDate: null }),
      plan({ id: 2, clientId: 1, planValue: 700, startDate: "2026-02-01", endDate: null }),
    ];
    const result = aggregateMrr({ plans, today: TODAY, cutoff: CUTOFF });
    expect(result.find((r) => r.month === "2026-05")!.value).toBe(1700);
    expect(result.find((r) => r.month === "2026-04")!.value).toBe(1700);
  });
});

// ─── Cenário real: conciliação atrasada não derruba mês fechado ──────────────

describe("aggregateMrr — conciliação atrasada (bug de jul/2026)", () => {
  it("mês fechado sem pagamentos conciliados mostra o contratado, não zero", () => {
    // Junho contratado ~R$21k; conciliação parou dia 22 → antes o gráfico caía
    // para o realizado (R$10k) quando julho começava. Contratado não depende disso.
    const plans = [
      plan({ id: 1, planValue: 6000, startDate: "2026-01-01", endDate: null }),
      plan({ id: 2, planValue: 5000, startDate: "2026-02-01", endDate: null }),
      plan({ id: 3, planValue: 5000, startDate: "2026-03-01", endDate: null }),
      plan({ id: 4, planValue: 5000, startDate: "2026-04-01", endDate: null }),
    ];
    const julyToday = new Date("2026-07-17");
    const result = aggregateMrr({ plans, today: julyToday, cutoff: CUTOFF });
    expect(result.find((r) => r.month === "2026-06")!.value).toBe(21000);
    expect(result.find((r) => r.month === "2026-07")!.value).toBe(21000);
  });
});
