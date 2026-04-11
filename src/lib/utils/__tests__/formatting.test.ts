import { describe, it, expect } from "vitest";
import { formatBRL, formatDate, formatPercentage } from "../formatting";

// ─── Formatação BRL ────────────────────────────────────────────────────────────
describe("formatBRL", () => {
  it("formata valor inteiro", () => {
    expect(formatBRL(1000)).toBe("R$ 1.000,00");
  });

  it("formata valor com centavos", () => {
    expect(formatBRL(128.57)).toBe("R$ 128,57");
  });

  it("formata zero", () => {
    expect(formatBRL(0)).toBe("R$ 0,00");
  });

  it("formata valor grande", () => {
    expect(formatBRL(17002)).toBe("R$ 17.002,00");
  });

  it("arredonda para 2 casas decimais", () => {
    expect(formatBRL(128.571)).toBe("R$ 128,57");
  });

  it("formata valor negativo", () => {
    expect(formatBRL(-500)).toBe("-R$ 500,00");
  });
});

// ─── Formatação de Data ────────────────────────────────────────────────────────
describe("formatDate", () => {
  it("formata ISO para dd/MM/yyyy", () => {
    expect(formatDate("2026-04-11")).toBe("11/04/2026");
  });

  it("formata primeiro dia do mês", () => {
    expect(formatDate("2024-01-01")).toBe("01/01/2024");
  });

  it("retorna string vazia para null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("retorna string vazia para undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });
});

// ─── Formatação de Percentual ──────────────────────────────────────────────────
describe("formatPercentage", () => {
  it("formata porcentagem inteira", () => {
    expect(formatPercentage(42.58)).toBe("42,58%");
  });

  it("formata zero", () => {
    expect(formatPercentage(0)).toBe("0,00%");
  });

  it("formata 100%", () => {
    expect(formatPercentage(100)).toBe("100,00%");
  });
});
