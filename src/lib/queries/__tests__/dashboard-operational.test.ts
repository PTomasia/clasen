import { describe, it, expect, vi } from "vitest";

// Mocka o módulo db global para não tentar conectar ao Turso durante testes.
vi.mock("../../db", () => ({ db: {} }));

import {
  aggregatePostsPorCliente,
  aggregateOperationalEvolution,
  type PlanForOperational,
} from "../dashboard";

const TODAY = new Date("2026-04-28");

function plan(overrides: Partial<PlanForOperational> = {}): PlanForOperational {
  return {
    id: 1,
    clientId: 1,
    planValue: 500,
    postsCarrossel: 4,
    postsReels: 0,
    postsEstatico: 0,
    postsTrafego: 0,
    startDate: "2026-01-01",
    endDate: null,
    ...overrides,
  };
}

// ─── aggregatePostsPorCliente ────────────────────────────────────────────────

describe("aggregatePostsPorCliente", () => {
  it("retorna 0/0/null quando não há planos ativos", () => {
    const result = aggregatePostsPorCliente([]);
    expect(result).toEqual({ clientes: 0, posts: 0, ratio: null });
  });

  it("conta apenas planos ativos (endDate=null)", () => {
    const plans = [
      plan({ id: 1, clientId: 1, postsCarrossel: 4 }),
      plan({ id: 2, clientId: 2, endDate: "2026-03-01", postsCarrossel: 8 }),
    ];
    const result = aggregatePostsPorCliente(plans);
    expect(result.clientes).toBe(1);
    expect(result.posts).toBe(4);
  });

  it("conta clientes distintos (cliente com 2 planos = 1 cliente)", () => {
    const plans = [
      plan({ id: 1, clientId: 1, postsCarrossel: 4, postsReels: 0 }),
      plan({ id: 2, clientId: 1, postsCarrossel: 0, postsReels: 2 }),
    ];
    const result = aggregatePostsPorCliente(plans);
    expect(result.clientes).toBe(1);
    expect(result.posts).toBe(6); // 4C + 2R
  });

  it("posts são ponderados: estático conta 0,5 + tráfego conta 1", () => {
    const plans = [
      plan({ postsCarrossel: 1, postsReels: 1, postsEstatico: 2, postsTrafego: 1 }),
    ];
    const result = aggregatePostsPorCliente(plans);
    // 1C + 1R + 2E×0.5 + 1T = 1 + 1 + 1 + 1 = 4
    expect(result.posts).toBe(4);
  });

  it("ratio = posts/clientes arredondado em 1 casa", () => {
    const plans = [
      plan({ id: 1, clientId: 1, postsCarrossel: 6 }),
      plan({ id: 2, clientId: 2, postsCarrossel: 4 }),
      plan({ id: 3, clientId: 3, postsCarrossel: 5 }),
    ];
    const result = aggregatePostsPorCliente(plans);
    expect(result.ratio).toBeCloseTo(5.0, 1); // (6+4+5)/3 = 5
  });
});

// ─── aggregateOperationalEvolution ────────────────────────────────────────────

describe("aggregateOperationalEvolution — janela", () => {
  it("retorna 12 meses do atual aos 11 anteriores", () => {
    const result = aggregateOperationalEvolution({ plans: [], today: TODAY });
    expect(result).toHaveLength(12);
    expect(result[0].month).toBe("2025-05");
    expect(result[11].month).toBe("2026-04");
  });

  it("label pt-BR correto", () => {
    const result = aggregateOperationalEvolution({ plans: [], today: TODAY });
    const apr = result.find((r) => r.month === "2026-04")!;
    expect(apr.label).toBe("abr/26");
  });
});

describe("aggregateOperationalEvolution — clientesAtivos", () => {
  it("plano ativo durante o mês inteiro conta", () => {
    const plans = [
      plan({ id: 1, clientId: 1, startDate: "2025-01-01", endDate: null }),
    ];
    const result = aggregateOperationalEvolution({ plans, today: TODAY });
    const apr = result.find((r) => r.month === "2026-04")!;
    expect(apr.clientesAtivos).toBe(1);
  });

  it("plano que iniciou no meio do mês conta naquele mês", () => {
    const plans = [
      plan({ id: 1, clientId: 1, startDate: "2026-04-15", endDate: null }),
    ];
    const result = aggregateOperationalEvolution({ plans, today: TODAY });
    const apr = result.find((r) => r.month === "2026-04")!;
    const mar = result.find((r) => r.month === "2026-03")!;
    expect(apr.clientesAtivos).toBe(1);
    expect(mar.clientesAtivos).toBe(0);
  });

  it("plano encerrado em 15/03 NÃO conta em abril", () => {
    const plans = [
      plan({ id: 1, clientId: 1, startDate: "2025-08-01", endDate: "2026-03-15" }),
    ];
    const result = aggregateOperationalEvolution({ plans, today: TODAY });
    const mar = result.find((r) => r.month === "2026-03")!;
    const apr = result.find((r) => r.month === "2026-04")!;
    expect(mar.clientesAtivos).toBe(1); // estava ativo em parte de março
    expect(apr.clientesAtivos).toBe(0);
  });

  it("cliente com 2 planos no mesmo mês conta 1 vez (DISTINCT)", () => {
    const plans = [
      plan({ id: 1, clientId: 1, startDate: "2025-08-01" }),
      plan({ id: 2, clientId: 1, startDate: "2025-08-01" }),
    ];
    const result = aggregateOperationalEvolution({ plans, today: TODAY });
    const apr = result.find((r) => r.month === "2026-04")!;
    expect(apr.clientesAtivos).toBe(1);
  });
});

describe("aggregateOperationalEvolution — postsTotal e ticketPorPost", () => {
  it("soma posts ponderados de planos ativos no mês", () => {
    const plans = [
      plan({
        id: 1, clientId: 1, startDate: "2025-08-01",
        postsCarrossel: 4, postsReels: 2, postsEstatico: 2, postsTrafego: 1,
      }),
    ];
    const result = aggregateOperationalEvolution({ plans, today: TODAY });
    const apr = result.find((r) => r.month === "2026-04")!;
    // 4 + 2 + 2×0.5 + 1 = 8
    expect(apr.postsTotal).toBe(8);
  });

  it("ticketPorPost = MRR_mês / postsTotal", () => {
    const plans = [
      plan({
        id: 1, clientId: 1, startDate: "2025-08-01", planValue: 800,
        postsCarrossel: 4,
      }),
    ];
    const result = aggregateOperationalEvolution({ plans, today: TODAY });
    const apr = result.find((r) => r.month === "2026-04")!;
    expect(apr.ticketPorPost).toBe(200); // 800 / 4
  });

  it("ticketPorPost é null quando postsTotal=0", () => {
    const plans = [plan({ id: 1, clientId: 1, postsCarrossel: 0, postsReels: 0, postsEstatico: 0, postsTrafego: 0, planValue: 500 })];
    const result = aggregateOperationalEvolution({ plans, today: TODAY });
    const apr = result.find((r) => r.month === "2026-04")!;
    expect(apr.postsTotal).toBe(0);
    expect(apr.ticketPorPost).toBeNull();
  });

  it("mês sem planos ativos: zeros e ticketPorPost null", () => {
    const plans = [
      plan({ id: 1, clientId: 1, startDate: "2026-04-01", endDate: null }),
    ];
    const result = aggregateOperationalEvolution({ plans, today: TODAY });
    const jan = result.find((r) => r.month === "2026-01")!;
    expect(jan.clientesAtivos).toBe(0);
    expect(jan.postsTotal).toBe(0);
    expect(jan.ticketPorPost).toBeNull();
  });
});
