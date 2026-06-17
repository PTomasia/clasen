import { describe, it, expect } from "vitest";
import {
  calcScoreOperacional,
  interpretarScore,
  derivarStatusAgenda,
  sugerirDecisoes,
  avaliarDependencia,
  getPendingChecks,
  type NotasOperacionais,
} from "../operational-metrics";

// ─── calcScoreOperacional ──────────────────────────────────────────────────────

describe("calcScoreOperacional", () => {
  const notas = (n: Partial<NotasOperacionais>): NotasOperacionais => ({
    execucaoDireta: 3,
    revisao: 3,
    direcaoCriativa: 3,
    energia: 3,
    capacidade: 3,
    ...n,
  });

  it("média das 5 notas — tudo 5 = 5,0", () => {
    expect(calcScoreOperacional(notas({ execucaoDireta: 5, revisao: 5, direcaoCriativa: 5, energia: 5, capacidade: 5 }))).toBe(5);
  });

  it("tudo 1 = 1,0", () => {
    expect(calcScoreOperacional(notas({ execucaoDireta: 1, revisao: 1, direcaoCriativa: 1, energia: 1, capacidade: 1 }))).toBe(1);
  });

  it("calcula média com 1 casa decimal", () => {
    // (5+5+5+5+1)/5 = 4,2
    expect(calcScoreOperacional(notas({ execucaoDireta: 5, revisao: 5, direcaoCriativa: 5, energia: 5, capacidade: 1 }))).toBe(4.2);
    // (1+2+3+4+4)/5 = 2,8
    expect(calcScoreOperacional(notas({ execucaoDireta: 1, revisao: 2, direcaoCriativa: 3, energia: 4, capacidade: 4 }))).toBe(2.8);
  });
});

// ─── interpretarScore ──────────────────────────────────────────────────────────

describe("interpretarScore", () => {
  it("4,3 a 5,0 = saudável", () => {
    expect(interpretarScore(5.0).key).toBe("saudavel");
    expect(interpretarScore(4.3).key).toBe("saudavel");
  });

  it("3,5 a 4,2 = boa, com pontos de atenção", () => {
    expect(interpretarScore(4.2).key).toBe("boa");
    expect(interpretarScore(3.5).key).toBe("boa");
  });

  it("2,8 a 3,4 = no limite", () => {
    expect(interpretarScore(3.4).key).toBe("limite");
    expect(interpretarScore(2.8).key).toBe("limite");
  });

  it("2,0 a 2,7 = contenção", () => {
    expect(interpretarScore(2.7).key).toBe("contencao");
    expect(interpretarScore(2.0).key).toBe("contencao");
  });

  it("abaixo de 2,0 = crítico", () => {
    expect(interpretarScore(1.9).key).toBe("critico");
    expect(interpretarScore(1.0).key).toBe("critico");
  });

  it("retorna label legível", () => {
    expect(interpretarScore(4.5).label).toBe("Saudável");
  });
});

// ─── derivarStatusAgenda ───────────────────────────────────────────────────────

describe("derivarStatusAgenda", () => {
  // Base "limpa": score saudável, UO baixa, Gabi não executando — sem travas.
  const limpo = { score: 4.5, unidadesOperacionais: 50, notaExecucaoDireta: 5 };

  it("base pela nota de capacidade (sem travas)", () => {
    expect(derivarStatusAgenda({ ...limpo, notaCapacidade: 5 })).toBe("saudavel");
    expect(derivarStatusAgenda({ ...limpo, notaCapacidade: 4 })).toBe("saudavel");
    expect(derivarStatusAgenda({ ...limpo, notaCapacidade: 3 })).toBe("atencao");
    expect(derivarStatusAgenda({ ...limpo, notaCapacidade: 2 })).toBe("contencao");
    expect(derivarStatusAgenda({ ...limpo, notaCapacidade: 1 })).toBe("critico");
  });

  it("trava: score < 2,8 rebaixa para no mínimo contenção", () => {
    expect(
      derivarStatusAgenda({ notaCapacidade: 5, score: 2.5, unidadesOperacionais: 50, notaExecucaoDireta: 5 })
    ).toBe("contencao");
  });

  it("trava: UO > 120 rebaixa para no mínimo atenção", () => {
    expect(
      derivarStatusAgenda({ notaCapacidade: 5, score: 4.5, unidadesOperacionais: 130, notaExecucaoDireta: 5 })
    ).toBe("atencao");
  });

  it("trava: Gabi executando muito (nota execução ≤ 2) rebaixa para no mínimo atenção", () => {
    expect(
      derivarStatusAgenda({ notaCapacidade: 5, score: 4.5, unidadesOperacionais: 50, notaExecucaoDireta: 2 })
    ).toBe("atencao");
  });

  it("trava: Gabi segurando a operação (nota execução = 1) rebaixa para no mínimo contenção", () => {
    expect(
      derivarStatusAgenda({ notaCapacidade: 5, score: 4.5, unidadesOperacionais: 50, notaExecucaoDireta: 1 })
    ).toBe("contencao");
  });

  it("travas só pioram — pior delas vence", () => {
    // base saudável; travas: contenção (score), atenção (UO), contenção (exec=1) → contenção
    expect(
      derivarStatusAgenda({ notaCapacidade: 5, score: 2.0, unidadesOperacionais: 130, notaExecucaoDireta: 1 })
    ).toBe("contencao");
  });

  it("crítico (base) não é melhorado por travas leves", () => {
    expect(
      derivarStatusAgenda({ notaCapacidade: 1, score: 5.0, unidadesOperacionais: 10, notaExecucaoDireta: 5 })
    ).toBe("critico");
  });

  it("respeita teto customizado de UO", () => {
    expect(
      derivarStatusAgenda({ notaCapacidade: 5, score: 4.5, unidadesOperacionais: 90, notaExecucaoDireta: 5, teto: 80 })
    ).toBe("atencao");
  });
});

// ─── sugerirDecisoes ───────────────────────────────────────────────────────────

describe("sugerirDecisoes", () => {
  it("agenda saudável sugere abrir agenda", () => {
    const d = sugerirDecisoes({ statusAgenda: "saudavel", score: 4.5, notaExecucaoDireta: 5, notaRevisao: 5, gargalos: [] });
    expect(d).toContain("Abrir agenda");
  });

  it("agenda em atenção sugere manter controlada", () => {
    const d = sugerirDecisoes({ statusAgenda: "atencao", score: 3.6, notaExecucaoDireta: 5, notaRevisao: 4, gargalos: [] });
    expect(d).toContain("Manter agenda controlada");
  });

  it("agenda em contenção/crítico sugere pausar entradas", () => {
    expect(sugerirDecisoes({ statusAgenda: "contencao", score: 2.5, notaExecucaoDireta: 3, notaRevisao: 3, gargalos: [] })).toContain("Pausar novas entradas");
    expect(sugerirDecisoes({ statusAgenda: "critico", score: 1.5, notaExecucaoDireta: 1, notaRevisao: 1, gargalos: [] })).toContain("Pausar novas entradas");
  });

  it("Gabi executando muito sugere reduzir carga e acionar freela", () => {
    const d = sugerirDecisoes({ statusAgenda: "atencao", score: 3.2, notaExecucaoDireta: 2, notaRevisao: 3, gargalos: [] });
    expect(d).toContain("Reduzir carga da Gabi");
    expect(d).toContain("Acionar freela");
  });

  it("gargalo de briefing sugere melhorar briefing", () => {
    const d = sugerirDecisoes({ statusAgenda: "atencao", score: 3.2, notaExecucaoDireta: 4, notaRevisao: 4, gargalos: ["Briefing"] });
    expect(d).toContain("Melhorar briefing");
  });

  it("gargalo de cliente específica sugere revê-la", () => {
    const d = sugerirDecisoes({ statusAgenda: "atencao", score: 3.2, notaExecucaoDireta: 4, notaRevisao: 4, gargalos: ["Cliente específica"] });
    expect(d).toContain("Rever cliente específica");
  });
});

// ─── avaliarDependencia ────────────────────────────────────────────────────────

describe("avaliarDependencia", () => {
  const check = (n: Partial<{ notaExecucaoDireta: number; notaRevisao: number; notaDirecaoCriativa: number; entregasExecutadasGabi: number | null; postsRevisadosPedro: number | null }>) => ({
    notaExecucaoDireta: 3,
    notaRevisao: 3,
    notaDirecaoCriativa: 3,
    entregasExecutadasGabi: null,
    postsRevisadosPedro: null,
    ...n,
  });

  it("sem check anterior retorna 'sem base'", () => {
    expect(avaliarDependencia(check({}), null).toLowerCase()).toContain("sem base");
  });

  it("notas melhorando indica dependência diminuindo", () => {
    const atual = check({ notaExecucaoDireta: 4, notaRevisao: 4, notaDirecaoCriativa: 5 });
    const anterior = check({ notaExecucaoDireta: 2, notaRevisao: 2, notaDirecaoCriativa: 2 });
    expect(avaliarDependencia(atual, anterior).toLowerCase()).toContain("diminuindo");
  });

  it("notas piorando indica dependência aumentando", () => {
    const atual = check({ notaExecucaoDireta: 1, notaRevisao: 2, notaDirecaoCriativa: 2 });
    const anterior = check({ notaExecucaoDireta: 4, notaRevisao: 4, notaDirecaoCriativa: 4 });
    expect(avaliarDependencia(atual, anterior).toLowerCase()).toContain("aument");
  });

  it("notas iguais indica estabilidade", () => {
    expect(avaliarDependencia(check({}), check({})).toLowerCase()).toContain("estável");
  });
});

// ─── getPendingChecks ──────────────────────────────────────────────────────────

describe("getPendingChecks", () => {
  const d = (s: string) => new Date(`${s}T12:00:00`);

  it("dias 1-14: lembra do fim do mês anterior se faltando", () => {
    expect(getPendingChecks([], d("2026-07-05"))).toEqual([
      { month: "2026-06", period: "fim_mes" },
    ]);
  });

  it("dias 1-14: não lembra se o fim do mês anterior já existe", () => {
    expect(
      getPendingChecks([{ referenceMonth: "2026-06", period: "fim_mes" }], d("2026-07-05"))
    ).toEqual([]);
  });

  it("dia 15+: lembra do meio do mês atual se faltando", () => {
    expect(getPendingChecks([], d("2026-06-20"))).toEqual([
      { month: "2026-06", period: "meio_mes" },
    ]);
  });

  it("dia 15+: não lembra se o meio do mês atual já existe", () => {
    expect(
      getPendingChecks([{ referenceMonth: "2026-06", period: "meio_mes" }], d("2026-06-20"))
    ).toEqual([]);
  });

  it("handoff exatamente no dia 15", () => {
    expect(getPendingChecks([], d("2026-06-14"))[0].period).toBe("fim_mes");
    expect(getPendingChecks([], d("2026-06-15"))[0].period).toBe("meio_mes");
  });

  it("vira o ano corretamente (janeiro → dezembro anterior)", () => {
    expect(getPendingChecks([], d("2026-01-05"))).toEqual([
      { month: "2025-12", period: "fim_mes" },
    ]);
  });
});
