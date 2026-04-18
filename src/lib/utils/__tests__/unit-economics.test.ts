import { describe, it, expect } from "vitest";
import {
  calcularCAC,
  calcularROAS,
  calcularChurnRate,
  calcularLTV,
  calcularPayback,
} from "../unit-economics";

describe("calcularCAC", () => {
  it("retorna ad_spend / novos_clientes", () => {
    expect(calcularCAC(1000, 4)).toBe(250);
  });

  it("retorna null quando novos_clientes = 0", () => {
    expect(calcularCAC(1000, 0)).toBeNull();
  });

  it("retorna 0 quando ad_spend = 0 e novos > 0", () => {
    expect(calcularCAC(0, 3)).toBe(0);
  });
});

describe("calcularROAS", () => {
  it("retorna receita / ad_spend", () => {
    expect(calcularROAS(3200, 1000)).toBe(3.2);
  });

  it("retorna null quando ad_spend = 0", () => {
    expect(calcularROAS(3200, 0)).toBeNull();
  });

  it("retorna 0 quando receita = 0 e ad_spend > 0", () => {
    expect(calcularROAS(0, 500)).toBe(0);
  });
});

describe("calcularChurnRate", () => {
  it("retorna churned / ativos_inicio", () => {
    expect(calcularChurnRate(2, 50)).toBe(0.04);
  });

  it("retorna null quando ativos_inicio = 0", () => {
    expect(calcularChurnRate(0, 0)).toBeNull();
  });

  it("retorna 0 quando churned = 0 e ativos > 0", () => {
    expect(calcularChurnRate(0, 30)).toBe(0);
  });
});

describe("calcularLTV", () => {
  it("soma pagamentos recorrentes e avulsas", () => {
    expect(calcularLTV({ planPayments: [100, 200], oneTimeRevenues: [50] })).toBe(350);
  });

  it("retorna 0 quando não há pagamentos", () => {
    expect(calcularLTV({ planPayments: [], oneTimeRevenues: [] })).toBe(0);
  });

  it("funciona apenas com pagamentos recorrentes", () => {
    expect(calcularLTV({ planPayments: [100, 200, 300] })).toBe(600);
  });
});

describe("calcularPayback", () => {
  it("retorna CAC / ticket_medio em meses", () => {
    expect(calcularPayback(300, 150)).toBe(2);
  });

  it("retorna null quando ticket = 0", () => {
    expect(calcularPayback(300, 0)).toBeNull();
  });

  it("retorna null quando CAC é null", () => {
    expect(calcularPayback(null, 150)).toBeNull();
  });
});
