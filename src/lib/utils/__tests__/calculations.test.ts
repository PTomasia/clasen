import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calcularCustoPost,
  calcularPermanencia,
  calcularStatusPagamento,
  calcularMediana,
  calcularTotalPostsEquivalentes,
  assertBillingDays,
  isDataPassada,
  calcularPermanenciaCliente,
} from "../calculations";

// ─── $/post ────────────────────────────────────────────────────────────────────
describe("calcularCustoPost", () => {
  it("caso base: Borba Gato — 4 carrosseis + 6 estáticos", () => {
    expect(
      calcularCustoPost({
        valor: 900,
        carrossel: 4,
        reels: 0,
        estatico: 6,
        trafego: 0,
      })
    ).toBeCloseTo(128.57, 2);
    // 900 / (4 + 0 + 6*0.5) = 900/7 = 128.57
  });

  it("Fernanda Muniz — 4 carrosseis + 2 reels + 4 estáticos", () => {
    expect(
      calcularCustoPost({
        valor: 1005,
        carrossel: 4,
        reels: 2,
        estatico: 4,
        trafego: 0,
      })
    ).toBeCloseTo(125.63, 2);
    // 1005 / (4 + 2 + 4*0.5) = 1005/8 = 125.63
  });

  it("Jessica Ortega — 1 carrossel + 4 estáticos", () => {
    expect(
      calcularCustoPost({
        valor: 380,
        carrossel: 1,
        reels: 0,
        estatico: 4,
        trafego: 0,
      })
    ).toBeCloseTo(126.67, 2);
    // 380 / (1 + 0 + 4*0.5) = 380/3 = 126.67
  });

  it("tráfego NÃO entra no denominador", () => {
    // Com tráfego, mas denominador é o mesmo
    expect(
      calcularCustoPost({
        valor: 900,
        carrossel: 4,
        reels: 0,
        estatico: 6,
        trafego: 5,
      })
    ).toBeCloseTo(128.57, 2);
  });

  it("retorna null quando só tem tráfego (sem posts de conteúdo)", () => {
    expect(
      calcularCustoPost({
        valor: 400,
        carrossel: 0,
        reels: 0,
        estatico: 0,
        trafego: 1,
      })
    ).toBeNull();
  });

  it("retorna null quando todos os posts são zero", () => {
    expect(
      calcularCustoPost({
        valor: 500,
        carrossel: 0,
        reels: 0,
        estatico: 0,
        trafego: 0,
      })
    ).toBeNull();
  });

  it("funciona com apenas reels", () => {
    expect(
      calcularCustoPost({
        valor: 300,
        carrossel: 0,
        reels: 3,
        estatico: 0,
        trafego: 0,
      })
    ).toBeCloseTo(100, 2);
  });

  it("funciona com apenas estáticos", () => {
    expect(
      calcularCustoPost({
        valor: 200,
        carrossel: 0,
        reels: 0,
        estatico: 4,
        trafego: 0,
      })
    ).toBeCloseTo(100, 2);
    // 200 / (4*0.5) = 200/2 = 100
  });

  it("valor muito pequeno não gera erro", () => {
    expect(
      calcularCustoPost({
        valor: 0.01,
        carrossel: 1,
        reels: 0,
        estatico: 0,
        trafego: 0,
      })
    ).toBeCloseTo(0.01, 2);
  });

  it("composição mista grande calcula correto", () => {
    // Pedagobia Macedo: 670 / (4 + 2 + 4*0.5) = 670/8 = 83.75
    expect(
      calcularCustoPost({
        valor: 670,
        carrossel: 4,
        reels: 2,
        estatico: 4,
        trafego: 0,
      })
    ).toBeCloseTo(83.75, 2);
  });
});

// ─── Total de Posts Equivalentes ───────────────────────────────────────────────
describe("calcularTotalPostsEquivalentes", () => {
  it("soma carrossel + reels + estático×0.5", () => {
    expect(
      calcularTotalPostsEquivalentes({ carrossel: 4, reels: 0, estatico: 6 })
    ).toBe(7);
  });

  it("retorna 0 quando tudo é zero", () => {
    expect(
      calcularTotalPostsEquivalentes({ carrossel: 0, reels: 0, estatico: 0 })
    ).toBe(0);
  });
});

// ─── Permanência ───────────────────────────────────────────────────────────────
describe("calcularPermanencia", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Borba Gato: 24 meses (abr/2024 → abr/2026)", () => {
    expect(calcularPermanencia("2024-04-01", "2026-04-01")).toBe(24);
  });

  it("mês incompleto não conta (floor)", () => {
    expect(calcularPermanencia("2024-04-01", "2026-04-11")).toBe(24);
  });

  it("Isabela Godoy: 14 meses", () => {
    expect(calcularPermanencia("2025-02-01", null)).toBe(14);
  });

  it("cliente novo com menos de 1 mês retorna 0", () => {
    expect(calcularPermanencia("2026-04-01", null)).toBe(0);
  });

  it("plano ativo (end_date null) usa hoje", () => {
    expect(calcularPermanencia("2026-03-01", null)).toBe(1);
  });

  it("plano inativo usa end_date", () => {
    expect(calcularPermanencia("2025-02-01", "2026-03-01")).toBe(13);
  });

  it("mesmo dia retorna 0", () => {
    expect(calcularPermanencia("2026-04-11", null)).toBe(0);
  });

  it("data de início no futuro retorna 0 (não negativo)", () => {
    // Cliente cadastrado com data de início futura
    const result = calcularPermanencia("2026-05-01", null);
    expect(result).toBeLessThanOrEqual(0);
  });

  it("plano de longa duração calcula corretamente", () => {
    // Thauane: mar/2023 → fev/2026 = 35 meses
    expect(calcularPermanencia("2023-03-01", "2026-02-27")).toBe(35);
  });
});

// ─── Status de Pagamento ───────────────────────────────────────────────────────
describe("calcularStatusPagamento", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("em_dia quando next_payment_date é hoje", () => {
    expect(calcularStatusPagamento("2026-04-11")).toBe("em_dia");
  });

  it("em_dia quando next_payment_date é no futuro", () => {
    expect(calcularStatusPagamento("2026-04-15")).toBe("em_dia");
  });

  it("atrasado quando next_payment_date é no passado", () => {
    expect(calcularStatusPagamento("2026-04-10")).toBe("atrasado");
  });

  it("atrasado com data bem antiga", () => {
    expect(calcularStatusPagamento("2026-03-01")).toBe("atrasado");
  });

  it("sem_pagamento quando null", () => {
    expect(calcularStatusPagamento(null)).toBe("sem_pagamento");
  });

  it("sem_pagamento quando undefined", () => {
    expect(calcularStatusPagamento(undefined)).toBe("sem_pagamento");
  });
});

// ─── Mediana ───────────────────────────────────────────────────────────────────
describe("calcularMediana", () => {
  it("lista ímpar retorna elemento do meio", () => {
    expect(calcularMediana([1, 3, 5, 7, 9])).toBe(5);
  });

  it("lista par retorna média dos dois do meio", () => {
    expect(calcularMediana([1, 3, 5, 7])).toBe(4);
  });

  it("lista de um elemento retorna ele mesmo", () => {
    expect(calcularMediana([7])).toBe(7);
  });

  it("lista vazia retorna null", () => {
    expect(calcularMediana([])).toBeNull();
  });

  it("ordena automaticamente (não exige lista pré-ordenada)", () => {
    expect(calcularMediana([9, 1, 5, 3, 7])).toBe(5);
  });

  it("funciona com números decimais", () => {
    expect(calcularMediana([1.5, 2.5, 3.5])).toBe(2.5);
  });

  it("par com decimais retorna média correta", () => {
    expect(calcularMediana([1, 2, 3, 4])).toBe(2.5);
  });
});

// ─── assertBillingDays ─────────────────────────────────────────────────────────
describe("assertBillingDays", () => {
  it("aceita inteiro 1-31 com day2 null", () => {
    expect(() => assertBillingDays(1, null)).not.toThrow();
    expect(() => assertBillingDays(15, null)).not.toThrow();
    expect(() => assertBillingDays(31, null)).not.toThrow();
  });

  it("aceita dois dias diferentes 1-31", () => {
    expect(() => assertBillingDays(10, 25)).not.toThrow();
  });

  it("rejeita day1 fora de 1-31", () => {
    expect(() => assertBillingDays(0, null)).toThrow(/entre 1 e 31/);
    expect(() => assertBillingDays(32, null)).toThrow(/entre 1 e 31/);
    expect(() => assertBillingDays(-1, null)).toThrow(/entre 1 e 31/);
  });

  it("rejeita day1 não-inteiro", () => {
    expect(() => assertBillingDays(1.5, null)).toThrow(/inteiro/);
  });

  it("rejeita day2 fora de 1-31", () => {
    expect(() => assertBillingDays(10, 0)).toThrow(/segundo dia/);
    expect(() => assertBillingDays(10, 32)).toThrow(/segundo dia/);
  });

  it("rejeita day2 não-inteiro", () => {
    expect(() => assertBillingDays(10, 25.5)).toThrow(/segundo dia/);
  });

  it("rejeita dois dias iguais", () => {
    expect(() => assertBillingDays(10, 10)).toThrow(/diferentes/);
  });

  it("aceita day1 undefined (sem ciclo)", () => {
    expect(() => assertBillingDays(undefined, undefined)).not.toThrow();
    expect(() => assertBillingDays(null, null)).not.toThrow();
  });

  it("rejeita day2 informado sem day1", () => {
    expect(() => assertBillingDays(null, 10)).toThrow(/segundo dia.*sem.*primeiro/i);
  });
});

// ─── isDataPassada ────────────────────────────────────────────────────────────
describe("isDataPassada", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("retorna true para data anterior a hoje", () => {
    expect(isDataPassada("2026-04-14")).toBe(true);
  });

  it("retorna false para data igual a hoje (hoje não está atrasada)", () => {
    expect(isDataPassada("2026-04-15")).toBe(false);
  });

  it("retorna false para data futura", () => {
    expect(isDataPassada("2026-04-16")).toBe(false);
  });

  it("aceita referência custom", () => {
    expect(isDataPassada("2026-04-10", "2026-04-15")).toBe(true);
    expect(isDataPassada("2026-04-15", "2026-04-15")).toBe(false);
  });
});

// ─── calcularPermanenciaCliente ───────────────────────────────────────────────
describe("calcularPermanenciaCliente", () => {
  const refDate = new Date("2026-04-15T00:00:00");

  it("cliente ativo: conta do firstStart até referenceDate", () => {
    expect(
      calcularPermanenciaCliente(
        { clientSince: null },
        [{ startDate: "2026-01-15", endDate: null }],
        refDate
      )
    ).toBe(3);
  });

  it("clientSince override prevalece sobre menor startDate", () => {
    expect(
      calcularPermanenciaCliente(
        { clientSince: "2025-04-15" },
        [{ startDate: "2026-01-15", endDate: null }],
        refDate
      )
    ).toBe(12);
  });

  it("cliente inativo: conta do firstStart até maior endDate", () => {
    expect(
      calcularPermanenciaCliente(
        { clientSince: null },
        [
          { startDate: "2025-01-15", endDate: "2025-06-15" },
          { startDate: "2025-07-15", endDate: "2025-12-15" },
        ],
        refDate
      )
    ).toBe(11);
  });

  it("múltiplos planos ativos: usa o startDate mais antigo", () => {
    expect(
      calcularPermanenciaCliente(
        { clientSince: null },
        [
          { startDate: "2025-10-15", endDate: null },
          { startDate: "2025-04-15", endDate: null },
        ],
        refDate
      )
    ).toBe(12);
  });

  it("retorna null se não há plano nem clientSince", () => {
    expect(
      calcularPermanenciaCliente({ clientSince: null }, [], refDate)
    ).toBeNull();
  });

  it("plano sem endDate é tratado como ativo (conta até refDate)", () => {
    expect(
      calcularPermanenciaCliente(
        { clientSince: null },
        [{ startDate: "2025-04-15", endDate: null }],
        refDate
      )
    ).toBe(12);
  });
});
