import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calcularProximoReajuste,
  calcularSugestaoReajuste,
} from "../adjustments";

// ─── calcularProximoReajuste ──────────────────────────────────────────────────

describe("calcularProximoReajuste", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retorna startDate + 6 meses quando não há lastAdjustmentDate", () => {
    expect(
      calcularProximoReajuste("2026-01-10", null)
    ).toBe("2026-07-10");
  });

  it("retorna lastAdjustmentDate + 6 meses quando existe", () => {
    expect(
      calcularProximoReajuste("2024-01-01", "2026-02-15")
    ).toBe("2026-08-15");
  });

  it("plano antigo sem reajuste retorna data no passado", () => {
    // startDate 2024-01-01, sem adjustment → 2024-07-01 (já passou)
    expect(
      calcularProximoReajuste("2024-01-01", null)
    ).toBe("2024-07-01");
  });
});

// ─── calcularSugestaoReajuste ─────────────────────────────────────────────────

describe("calcularSugestaoReajuste", () => {
  it("sugere valor ideal quando aumento ≤ 25%", () => {
    // 4C + 0R + 6E×0.5 = 7 posts eq. | target 178 → ideal = 178×7 = 1246
    // atual 1100 → aumento = 13.3% (< 25%) → retorna 1246
    const result = calcularSugestaoReajuste({
      planValue: 1100,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 6,
      targetCostPerPost: 178,
    });
    expect(result.suggestedValue).toBeCloseTo(1246, 0);
    expect(result.percentChange).toBeCloseTo(13.27, 0);
    expect(result.capped).toBe(false);
  });

  it("limita a 25% quando o ideal ultrapassa o teto", () => {
    // 4C + 0R + 6E×0.5 = 7 posts eq. | target 178 → ideal = 1246
    // atual 900 → aumento = 38.4% → cap a 25% → 900 × 1.25 = 1125
    const result = calcularSugestaoReajuste({
      planValue: 900,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 6,
      targetCostPerPost: 178,
    });
    expect(result.suggestedValue).toBeCloseTo(1125, 0);
    expect(result.percentChange).toBe(25);
    expect(result.capped).toBe(true);
  });

  it("retorna null quando plano já está acima do alvo", () => {
    // 4C + 0R + 0E = 4 posts eq. | target 178 → ideal = 712
    // atual 800 → $/post 200 > 178 → sem sugestão de aumento
    const result = calcularSugestaoReajuste({
      planValue: 800,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 0,
      targetCostPerPost: 178,
    });
    expect(result.suggestedValue).toBeNull();
    expect(result.percentChange).toBe(0);
    expect(result.capped).toBe(false);
  });

  it("retorna null quando não tem posts de conteúdo (tráfego only)", () => {
    const result = calcularSugestaoReajuste({
      planValue: 400,
      postsCarrossel: 0,
      postsReels: 0,
      postsEstatico: 0,
      targetCostPerPost: 178,
    });
    expect(result.suggestedValue).toBeNull();
    expect(result.percentChange).toBe(0);
    expect(result.capped).toBe(false);
  });

  it("funciona com teto customizado (maxPercent)", () => {
    // ideal = 178×7 = 1246 | atual 900 | default 25% → 1125
    // com teto 10% → 900 × 1.10 = 990
    const result = calcularSugestaoReajuste({
      planValue: 900,
      postsCarrossel: 4,
      postsReels: 0,
      postsEstatico: 6,
      targetCostPerPost: 178,
      maxPercent: 10,
    });
    expect(result.suggestedValue).toBeCloseTo(990, 0);
    expect(result.percentChange).toBe(10);
    expect(result.capped).toBe(true);
  });

  it("arredonda o valor sugerido para 2 casas decimais", () => {
    // 3C + 2R + 0E = 5 posts eq. | target 178 → ideal = 890
    // atual 850 → aumento = 4.7% → retorna 890.00
    const result = calcularSugestaoReajuste({
      planValue: 850,
      postsCarrossel: 3,
      postsReels: 2,
      postsEstatico: 0,
      targetCostPerPost: 178,
    });
    expect(result.suggestedValue).toBe(890);
    expect(result.percentChange).toBeCloseTo(4.71, 0);
  });
});
