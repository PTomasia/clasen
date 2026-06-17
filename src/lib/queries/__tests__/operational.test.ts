import { describe, it, expect } from "vitest";
import {
  aggregateCargaPlanejada,
  pickLatestCheck,
  buildEvolutionSeries,
  type PlanForCarga,
} from "../operational";
import type { OperationalCheckRow } from "../../services/operational";
import type { CheckPeriod } from "../../constants";

// ─── aggregateCargaPlanejada ───────────────────────────────────────────────────

describe("aggregateCargaPlanejada", () => {
  const plan = (over: Partial<PlanForCarga> = {}): PlanForCarga => ({
    postsCarrossel: 2,
    postsReels: 2,
    postsEstatico: 1,
    postsTrafego: 1,
    pesoCarrossel: 1,
    pesoReels: 0.75,
    startDate: "2026-01-01",
    endDate: null,
    ...over,
  });

  it("soma planos ativos no mês e calcula UO com pesos", () => {
    const carga = aggregateCargaPlanejada({
      plans: [plan(), plan()],
      avulsosCount: 3,
      month: "2026-06",
    });
    expect(carga.carrosseis).toBe(4);
    expect(carga.reels).toBe(4);
    expect(carga.estaticos).toBe(2);
    expect(carga.criativosTrafego).toBe(2);
    expect(carga.postsTotais).toBe(12); // 4+4+2+2
    // UO por plano = 2*1 + 2*0.75 + 1*0.5 = 4,0 → 2 planos = 8,0
    expect(carga.unidadesOperacionais).toBe(8);
    expect(carga.avulsos).toBe(3);
  });

  it("exclui plano encerrado antes do mês", () => {
    const carga = aggregateCargaPlanejada({
      plans: [plan({ endDate: "2026-05-31" })],
      avulsosCount: 0,
      month: "2026-06",
    });
    expect(carga.postsTotais).toBe(0);
    expect(carga.unidadesOperacionais).toBe(0);
  });

  it("exclui plano que começa depois do mês", () => {
    const carga = aggregateCargaPlanejada({
      plans: [plan({ startDate: "2026-07-01" })],
      avulsosCount: 0,
      month: "2026-06",
    });
    expect(carga.postsTotais).toBe(0);
  });

  it("inclui plano encerrado dentro do mês", () => {
    const carga = aggregateCargaPlanejada({
      plans: [plan({ endDate: "2026-06-20" })],
      avulsosCount: 0,
      month: "2026-06",
    });
    expect(carga.postsTotais).toBe(6);
  });
});

// ─── Helpers de check para os testes de evolução/latest ─────────────────────────

let nextId = 1;
function check(over: Partial<OperationalCheckRow> = {}): OperationalCheckRow {
  return {
    id: nextId++,
    referenceMonth: "2026-06",
    period: "meio_mes" as CheckPeriod,
    notaExecucaoDireta: 3,
    notaRevisao: 3,
    notaDirecaoCriativa: 3,
    notaEnergia: 3,
    notaCapacidade: 3,
    entregasExecutadasGabi: null,
    gargalos: [],
    clientesPesadasIds: [],
    motivosPeso: [],
    comentarioClientesPesadas: null,
    comentario: null,
    postsTotais: null,
    unidadesOperacionais: null,
    carrosseis: null,
    reels: null,
    estaticos: null,
    criativosTrafego: null,
    avulsos: null,
    copysDevolvidas: null,
    designsRefeitos: null,
    postsRevisadosGabi: null,
    postsRevisadosPedro: null,
    createdAt: "2026-06-15 10:00:00",
    updatedAt: "2026-06-15 10:00:00",
    ...over,
  };
}

// ─── pickLatestCheck ───────────────────────────────────────────────────────────

describe("pickLatestCheck", () => {
  it("retorna null sem checks", () => {
    expect(pickLatestCheck([])).toBeNull();
  });

  it("pega o mês mais recente", () => {
    const latest = pickLatestCheck([
      check({ referenceMonth: "2026-04" }),
      check({ referenceMonth: "2026-06" }),
      check({ referenceMonth: "2026-05" }),
    ]);
    expect(latest?.referenceMonth).toBe("2026-06");
  });

  it("dentro do mesmo mês, prefere fim_mes", () => {
    const latest = pickLatestCheck([
      check({ referenceMonth: "2026-06", period: "meio_mes" }),
      check({ referenceMonth: "2026-06", period: "fim_mes" }),
    ]);
    expect(latest?.period).toBe("fim_mes");
  });
});

// ─── buildEvolutionSeries ──────────────────────────────────────────────────────

describe("buildEvolutionSeries", () => {
  it("um ponto por mês, ordenado ascendente", () => {
    const series = buildEvolutionSeries([
      check({ referenceMonth: "2026-06" }),
      check({ referenceMonth: "2026-04" }),
      check({ referenceMonth: "2026-05" }),
    ]);
    expect(series.map((p) => p.month)).toEqual(["2026-04", "2026-05", "2026-06"]);
  });

  it("prefere fim_mes quando há os dois no mês", () => {
    const series = buildEvolutionSeries([
      check({ referenceMonth: "2026-06", period: "meio_mes", notaCapacidade: 2 }),
      check({ referenceMonth: "2026-06", period: "fim_mes", notaCapacidade: 5 }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].capacidade).toBe(5);
  });

  it("calcula score e mapeia entregas/UO/capacidade", () => {
    const series = buildEvolutionSeries([
      check({
        referenceMonth: "2026-06",
        notaExecucaoDireta: 5,
        notaRevisao: 5,
        notaDirecaoCriativa: 5,
        notaEnergia: 5,
        notaCapacidade: 5,
        entregasExecutadasGabi: 8,
        unidadesOperacionais: 96.5,
      }),
    ]);
    expect(series[0].score).toBe(5);
    expect(series[0].entregasGabi).toBe(8);
    expect(series[0].unidadesOperacionais).toBe(96.5);
    expect(series[0].capacidade).toBe(5);
    expect(series[0].label).toBe("jun/26");
  });
});
