import { describe, it, expect, beforeEach } from "vitest";
import { sortPlans, filterPlans, type SortKey, type SortDirection } from "../table-helpers";
import type { StatusPagamento } from "../calculations";

// ─── Factory ──────────────────────────────────────────────────────────────────

function makePlan(overrides: Partial<ReturnType<typeof basePlan>> = {}) {
  return { ...basePlan(), ...overrides };
}

let counter = 0;
function basePlan() {
  counter++;
  return {
    id: counter,
    clientId: counter,
    clientName: `Cliente ${counter}`,
    clientContactOrigin: null as string | null,
    clientNotes: null as string | null,
    planType: "Personalizado",
    planValue: 500,
    billingCycleDays: 30 as number | null,
    postsCarrossel: 4,
    postsReels: 0,
    postsEstatico: 0,
    postsTrafego: 0,
    startDate: "2026-01-01",
    endDate: null as string | null,
    movementType: null as string | null,
    lastPaymentDate: null as string | null,
    nextPaymentDate: null as string | null,
    status: "ativo",
    notes: null as string | null,
    custoPost: 125 as number | null,
    permanencia: 3,
    statusPagamento: "em_dia" as StatusPagamento,
  };
}

// Reset counter before each describe
beforeEach(() => {
  counter = 0;
});

// ─── sortPlans ────────────────────────────────────────────────────────────────

describe("sortPlans", () => {
  it("ordena por clientName asc (A→Z)", () => {
    const plans = [
      makePlan({ clientName: "Zara" }),
      makePlan({ clientName: "Ana" }),
      makePlan({ clientName: "Maria" }),
    ];
    const sorted = sortPlans(plans, "clientName", "asc");
    expect(sorted.map((p) => p.clientName)).toEqual(["Ana", "Maria", "Zara"]);
  });

  it("ordena por clientName desc (Z→A)", () => {
    const plans = [
      makePlan({ clientName: "Ana" }),
      makePlan({ clientName: "Zara" }),
    ];
    const sorted = sortPlans(plans, "clientName", "desc");
    expect(sorted.map((p) => p.clientName)).toEqual(["Zara", "Ana"]);
  });

  it("ordena por planValue asc (menor→maior)", () => {
    const plans = [
      makePlan({ planValue: 900 }),
      makePlan({ planValue: 350 }),
      makePlan({ planValue: 670 }),
    ];
    const sorted = sortPlans(plans, "planValue", "asc");
    expect(sorted.map((p) => p.planValue)).toEqual([350, 670, 900]);
  });

  it("ordena por planValue desc (maior→menor)", () => {
    const plans = [
      makePlan({ planValue: 350 }),
      makePlan({ planValue: 900 }),
    ];
    const sorted = sortPlans(plans, "planValue", "desc");
    expect(sorted.map((p) => p.planValue)).toEqual([900, 350]);
  });

  it("ordena por custoPost asc com nulls no final", () => {
    const plans = [
      makePlan({ custoPost: 150 }),
      makePlan({ custoPost: null }),
      makePlan({ custoPost: 80 }),
    ];
    const sorted = sortPlans(plans, "custoPost", "asc");
    expect(sorted.map((p) => p.custoPost)).toEqual([80, 150, null]);
  });

  it("ordena por custoPost desc com nulls no final", () => {
    const plans = [
      makePlan({ custoPost: null }),
      makePlan({ custoPost: 80 }),
      makePlan({ custoPost: 150 }),
    ];
    const sorted = sortPlans(plans, "custoPost", "desc");
    expect(sorted.map((p) => p.custoPost)).toEqual([150, 80, null]);
  });

  it("ordena por permanencia asc", () => {
    const plans = [
      makePlan({ permanencia: 12 }),
      makePlan({ permanencia: 0 }),
      makePlan({ permanencia: 7 }),
    ];
    const sorted = sortPlans(plans, "permanencia", "asc");
    expect(sorted.map((p) => p.permanencia)).toEqual([0, 7, 12]);
  });

  it("ordena por permanencia desc", () => {
    const plans = [
      makePlan({ permanencia: 0 }),
      makePlan({ permanencia: 12 }),
    ];
    const sorted = sortPlans(plans, "permanencia", "desc");
    expect(sorted.map((p) => p.permanencia)).toEqual([12, 0]);
  });

  it("ordena por planType asc (alfabético)", () => {
    const plans = [
      makePlan({ planType: "Tráfego" }),
      makePlan({ planType: "Essential" }),
      makePlan({ planType: "Personalizado" }),
    ];
    const sorted = sortPlans(plans, "planType", "asc");
    expect(sorted.map((p) => p.planType)).toEqual(["Essential", "Personalizado", "Tráfego"]);
  });

  it("ordena por billingCycleDays asc com nulls no final", () => {
    const plans = [
      makePlan({ billingCycleDays: 25 }),
      makePlan({ billingCycleDays: null }),
      makePlan({ billingCycleDays: 5 }),
      makePlan({ billingCycleDays: 15 }),
    ];
    const sorted = sortPlans(plans, "billingCycleDays", "asc");
    expect(sorted.map((p) => p.billingCycleDays)).toEqual([5, 15, 25, null]);
  });

  it("ordena por billingCycleDays desc com nulls no final", () => {
    const plans = [
      makePlan({ billingCycleDays: null }),
      makePlan({ billingCycleDays: 5 }),
      makePlan({ billingCycleDays: 25 }),
    ];
    const sorted = sortPlans(plans, "billingCycleDays", "desc");
    expect(sorted.map((p) => p.billingCycleDays)).toEqual([25, 5, null]);
  });

  it("ordena por statusPagamento asc (atrasado primeiro)", () => {
    const plans = [
      makePlan({ statusPagamento: "sem_pagamento" }),
      makePlan({ statusPagamento: "atrasado" }),
      makePlan({ statusPagamento: "em_dia" }),
    ];
    const sorted = sortPlans(plans, "statusPagamento", "asc");
    expect(sorted.map((p) => p.statusPagamento)).toEqual([
      "atrasado",
      "em_dia",
      "sem_pagamento",
    ]);
  });

  it("não modifica o array original (imutável)", () => {
    const plans = [
      makePlan({ planValue: 900 }),
      makePlan({ planValue: 350 }),
    ];
    const original = [...plans];
    sortPlans(plans, "planValue", "asc");
    expect(plans.map((p) => p.planValue)).toEqual(original.map((p) => p.planValue));
  });

  it("retorna array vazio para input vazio", () => {
    expect(sortPlans([], "planValue", "asc")).toEqual([]);
  });

  it("retorna mesmo array para um único elemento", () => {
    const plans = [makePlan({ planValue: 500 })];
    const sorted = sortPlans(plans, "planValue", "asc");
    expect(sorted).toHaveLength(1);
    expect(sorted[0].planValue).toBe(500);
  });
});

// ─── filterPlans ──────────────────────────────────────────────────────────────

describe("filterPlans", () => {
  it("filtra por texto no nome do cliente (case insensitive)", () => {
    const plans = [
      makePlan({ clientName: "Borba Gato" }),
      makePlan({ clientName: "Ana Silva" }),
      makePlan({ clientName: "Bia Gracher" }),
    ];
    const result = filterPlans(plans, { search: "borba" });
    expect(result).toHaveLength(1);
    expect(result[0].clientName).toBe("Borba Gato");
  });

  it("filtra por texto parcial no nome", () => {
    const plans = [
      makePlan({ clientName: "Isabela Godoy" }),
      makePlan({ clientName: "Isabelle Taborda" }),
      makePlan({ clientName: "Ana Silva" }),
    ];
    const result = filterPlans(plans, { search: "isab" });
    expect(result).toHaveLength(2);
  });

  it("busca vazia retorna todos", () => {
    const plans = [makePlan(), makePlan(), makePlan()];
    expect(filterPlans(plans, { search: "" })).toHaveLength(3);
    expect(filterPlans(plans, {})).toHaveLength(3);
  });

  it("filtra por tipo de plano", () => {
    const plans = [
      makePlan({ planType: "Essential" }),
      makePlan({ planType: "Personalizado" }),
      makePlan({ planType: "Essential" }),
      makePlan({ planType: "Tráfego" }),
    ];
    const result = filterPlans(plans, { planType: "Essential" });
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.planType === "Essential")).toBe(true);
  });

  it("filtra por status de pagamento", () => {
    const plans = [
      makePlan({ statusPagamento: "atrasado" }),
      makePlan({ statusPagamento: "em_dia" }),
      makePlan({ statusPagamento: "atrasado" }),
      makePlan({ statusPagamento: "sem_pagamento" }),
    ];
    const result = filterPlans(plans, { statusPagamento: "atrasado" });
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.statusPagamento === "atrasado")).toBe(true);
  });

  it("combina múltiplos filtros (AND)", () => {
    const plans = [
      makePlan({ clientName: "Ana", planType: "Essential", statusPagamento: "em_dia" }),
      makePlan({ clientName: "Ana", planType: "Personalizado", statusPagamento: "em_dia" }),
      makePlan({ clientName: "Bia", planType: "Essential", statusPagamento: "atrasado" }),
      makePlan({ clientName: "Ana", planType: "Essential", statusPagamento: "atrasado" }),
    ];
    const result = filterPlans(plans, {
      search: "ana",
      planType: "Essential",
    });
    expect(result).toHaveLength(2); // Ana + Essential (em_dia e atrasado)
  });

  it("combina busca + tipo + pagamento", () => {
    const plans = [
      makePlan({ clientName: "Ana", planType: "Essential", statusPagamento: "atrasado" }),
      makePlan({ clientName: "Ana", planType: "Essential", statusPagamento: "em_dia" }),
      makePlan({ clientName: "Bia", planType: "Essential", statusPagamento: "atrasado" }),
    ];
    const result = filterPlans(plans, {
      search: "ana",
      planType: "Essential",
      statusPagamento: "atrasado",
    });
    expect(result).toHaveLength(1);
    expect(result[0].clientName).toBe("Ana");
  });

  it("retorna vazio quando nenhum item atende os filtros", () => {
    const plans = [
      makePlan({ clientName: "Ana", planType: "Essential" }),
    ];
    const result = filterPlans(plans, { planType: "Tráfego" });
    expect(result).toHaveLength(0);
  });

  it("filtro 'todos' no planType não filtra", () => {
    const plans = [
      makePlan({ planType: "Essential" }),
      makePlan({ planType: "Personalizado" }),
    ];
    const result = filterPlans(plans, { planType: "todos" });
    expect(result).toHaveLength(2);
  });

  it("filtro 'todos' no statusPagamento não filtra", () => {
    const plans = [
      makePlan({ statusPagamento: "em_dia" }),
      makePlan({ statusPagamento: "atrasado" }),
    ];
    const result = filterPlans(plans, { statusPagamento: "todos" });
    expect(result).toHaveLength(2);
  });

  it("busca com acentos funciona", () => {
    const plans = [
      makePlan({ clientName: "Beatriz Viçoza" }),
      makePlan({ clientName: "Ana" }),
    ];
    const result = filterPlans(plans, { search: "viçoza" });
    expect(result).toHaveLength(1);
  });
});
