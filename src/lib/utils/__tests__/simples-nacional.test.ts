import { describe, it, expect } from "vitest";
import {
  ANEXO_III_FAIXAS,
  FATOR_R_THRESHOLD,
  findFaixaAnexoIII,
  calcAliquotaEfetiva,
  calcRBT12,
  calcDasEstimado,
  calcFatorR,
  fatorRStatus,
  calcEstimativaTributaria,
} from "../simples-nacional";

// ─── Tabela Anexo III ─────────────────────────────────────────────────────────

describe("ANEXO_III_FAIXAS", () => {
  it("tem as 6 faixas do Anexo III", () => {
    expect(ANEXO_III_FAIXAS).toHaveLength(6);
    expect(ANEXO_III_FAIXAS[0]).toMatchObject({
      faixa: 1,
      aliquotaNominal: 0.06,
      parcelaDeduzir: 0,
    });
    expect(ANEXO_III_FAIXAS[5]).toMatchObject({
      faixa: 6,
      aliquotaNominal: 0.33,
      parcelaDeduzir: 648_000,
    });
  });
});

// ─── findFaixaAnexoIII ────────────────────────────────────────────────────────

describe("findFaixaAnexoIII", () => {
  it("acerta as fronteiras de cada faixa", () => {
    expect(findFaixaAnexoIII(0).faixa).toBe(1);
    expect(findFaixaAnexoIII(180_000).faixa).toBe(1);
    expect(findFaixaAnexoIII(180_000.01).faixa).toBe(2);
    expect(findFaixaAnexoIII(360_000).faixa).toBe(2);
    expect(findFaixaAnexoIII(360_000.01).faixa).toBe(3);
    expect(findFaixaAnexoIII(720_000).faixa).toBe(3);
    expect(findFaixaAnexoIII(720_000.01).faixa).toBe(4);
    expect(findFaixaAnexoIII(1_800_000).faixa).toBe(4);
    expect(findFaixaAnexoIII(1_800_000.01).faixa).toBe(5);
    expect(findFaixaAnexoIII(3_600_000).faixa).toBe(5);
    expect(findFaixaAnexoIII(3_600_000.01).faixa).toBe(6);
    expect(findFaixaAnexoIII(4_800_000).faixa).toBe(6);
  });
});

// ─── calcAliquotaEfetiva ──────────────────────────────────────────────────────

describe("calcAliquotaEfetiva", () => {
  it("faixa 1 sempre dá exatamente 6% (parcela a deduzir = 0)", () => {
    expect(calcAliquotaEfetiva(50_000)).toBeCloseTo(0.06, 10);
    expect(calcAliquotaEfetiva(180_000)).toBeCloseTo(0.06, 10);
  });

  it("rbt12 = 0 retorna 0 (sem divisão por zero)", () => {
    expect(calcAliquotaEfetiva(0)).toBe(0);
  });

  it("faixa 2: (RBT12×11,2% − 9.360) / RBT12", () => {
    // (300000×0.112 − 9360) / 300000 = 24240/300000 = 0.0808
    expect(calcAliquotaEfetiva(300_000)).toBeCloseTo(0.0808, 6);
  });

  it("faixa 3: RBT12 480k → 9,825%", () => {
    // (480000×0.135 − 17640) / 480000 = 47160/480000 = 0.09825
    expect(calcAliquotaEfetiva(480_000)).toBeCloseTo(0.09825, 6);
  });
});

// ─── calcRBT12 ────────────────────────────────────────────────────────────────

describe("calcRBT12", () => {
  it("≥12 meses anteriores → RBT12 real (soma dos 12 últimos)", () => {
    const anteriores = Array.from({ length: 13 }, () => 40_000); // 13 meses
    const r = calcRBT12({ receitasMesesAnteriores: anteriores, receitaMesApuracao: 40_000 });
    expect(r.tipo).toBe("real");
    expect(r.rbt12).toBe(480_000); // 12 × 40k
    expect(r.mesesApurados).toBe(12);
  });

  it("<12 meses → RBT12 proporcionalizada (média × 12)", () => {
    const anteriores = [14_000, 14_000, 14_000, 14_000, 14_000]; // 5 meses
    const r = calcRBT12({ receitasMesesAnteriores: anteriores, receitaMesApuracao: 14_000 });
    expect(r.tipo).toBe("proporcionalizada");
    expect(r.rbt12).toBe(168_000); // (70000/5) × 12
    expect(r.mesesApurados).toBe(5);
  });

  it("primeiro mês de atividade (sem meses anteriores) → receita do mês × 12", () => {
    const r = calcRBT12({ receitasMesesAnteriores: [], receitaMesApuracao: 14_000 });
    expect(r.tipo).toBe("proporcionalizada");
    expect(r.rbt12).toBe(168_000); // 14000 × 12
    expect(r.mesesApurados).toBe(1);
  });

  it("sem receita nenhuma → RBT12 zero", () => {
    const r = calcRBT12({ receitasMesesAnteriores: [], receitaMesApuracao: 0 });
    expect(r.rbt12).toBe(0);
  });
});

// ─── calcDasEstimado ──────────────────────────────────────────────────────────

describe("calcDasEstimado", () => {
  it("faixa 1: DAS = 6% da receita do mês", () => {
    const r = calcDasEstimado({ receitaBrutaMes: 20_000, rbt12: 100_000 });
    expect(r.faixa).toBe(1);
    expect(r.aliquotaEfetiva).toBeCloseTo(0.06, 10);
    expect(r.das).toBe(1_200); // 20000 × 6%
    expect(r.receitaLiquidaAposDas).toBe(18_800);
  });

  it("faixa 3: usa alíquota efetiva (9,825%)", () => {
    const r = calcDasEstimado({ receitaBrutaMes: 40_000, rbt12: 480_000 });
    expect(r.faixa).toBe(3);
    expect(r.aliquotaNominal).toBe(0.135);
    expect(r.parcelaDeduzir).toBe(17_640);
    expect(r.das).toBe(3_930); // 40000 × 0.09825
    expect(r.receitaLiquidaAposDas).toBe(36_070);
  });
});

// ─── Fator R ──────────────────────────────────────────────────────────────────

describe("calcFatorR / fatorRStatus", () => {
  it("pró-labore contábil = 28% da receita → Fator R = 28% (OK Anexo III)", () => {
    const rbt12 = 168_000;
    const folha12m = 0.28 * rbt12;
    const fatorR = calcFatorR({ folha12m, rbt12 });
    expect(fatorR).toBeCloseTo(0.28, 10);
    expect(fatorRStatus(fatorR)).toBe("ok_anexo_iii");
  });

  it("Fator R abaixo de 28% → risco de Anexo V", () => {
    const fatorR = calcFatorR({ folha12m: 20_000, rbt12: 168_000 }); // ~0.119
    expect(fatorR).toBeLessThan(FATOR_R_THRESHOLD);
    expect(fatorRStatus(fatorR)).toBe("risco_anexo_v");
  });

  it("rbt12 = 0 não divide por zero", () => {
    expect(calcFatorR({ folha12m: 5_000, rbt12: 0 })).toBe(0);
  });
});

// ─── Fachada: calcEstimativaTributaria ────────────────────────────────────────

describe("calcEstimativaTributaria", () => {
  it("caso Clasen (Faixa 1, proporcionalizada) → DAS ≈ 6% e Fator R OK", () => {
    const e = calcEstimativaTributaria({
      receitaBrutaMes: 14_000,
      receitasMesesAnteriores: [14_000, 14_000, 14_000, 14_000, 14_000],
      proLaboreContabilRate: 0.28,
    });
    expect(e.rbt12).toBe(168_000);
    expect(e.rbt12Tipo).toBe("proporcionalizada");
    expect(e.faixa).toBe(1);
    expect(e.aliquotaEfetiva).toBeCloseTo(0.06, 10);
    expect(e.das).toBe(840); // 14000 × 6%
    expect(e.receitaLiquidaAposDas).toBe(13_160);
    expect(e.proLaboreContabil).toBe(3_920); // 28% × 14000
    expect(e.fatorR).toBeCloseTo(0.28, 10);
    expect(e.fatorRStatus).toBe("ok_anexo_iii");
    expect(e.dasSeisPorcento).toBe(840);
    expect(e.diferencaVs6).toBe(0);
  });

  it("caso crescimento (Faixa 3, real) → diferença vs 6% fixo aparece", () => {
    const anteriores = Array.from({ length: 13 }, () => 40_000);
    const e = calcEstimativaTributaria({
      receitaBrutaMes: 40_000,
      receitasMesesAnteriores: anteriores,
      proLaboreContabilRate: 0.28,
    });
    expect(e.rbt12).toBe(480_000);
    expect(e.rbt12Tipo).toBe("real");
    expect(e.faixa).toBe(3);
    expect(e.das).toBe(3_930);
    expect(e.dasSeisPorcento).toBe(2_400); // 40000 × 6%
    expect(e.diferencaVs6).toBe(1_530); // 3930 − 2400
    expect(e.fatorRStatus).toBe("ok_anexo_iii");
  });
});
