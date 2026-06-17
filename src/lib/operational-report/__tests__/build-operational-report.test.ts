import { describe, it, expect } from "vitest";
import { buildOperationalReportMarkdown } from "../build-operational-report";
import type { OperationalCheckRow } from "../../services/operational";

let nextId = 1;
function check(over: Partial<OperationalCheckRow> = {}): OperationalCheckRow {
  return {
    id: nextId++,
    referenceMonth: "2026-06",
    period: "fim_mes",
    notaExecucaoDireta: 4,
    notaRevisao: 4,
    notaDirecaoCriativa: 4,
    notaEnergia: 4,
    notaCapacidade: 4,
    entregasExecutadasGabi: 2, // Pouco
    gargalos: ["Copy", "Briefing"],
    clientesPesadasIds: [1, 2],
    motivosPeso: ["Retrabalho de copy", "Urgência"],
    comentarioClientesPesadas: "Duas clientes puxando muito atendimento",
    comentario: "Mês mais tranquilo que o anterior",
    postsTotais: 120,
    unidadesOperacionais: 96.5,
    carrosseis: 40,
    reels: 30,
    estaticos: 50,
    criativosTrafego: 12,
    avulsos: 3,
    copysDevolvidas: 1, // Nada
    designsRefeitos: 1, // Nada
    postsRevisadosGabi: 4, // Bastante
    postsRevisadosPedro: 3, // Médio
    createdAt: "2026-06-30 10:00:00",
    updatedAt: "2026-06-30 10:00:00",
    ...over,
  };
}

const now = new Date("2026-06-30T14:30:00");

describe("buildOperationalReportMarkdown", () => {
  it("gera todas as 8 seções do template", () => {
    const md = buildOperationalReportMarkdown({ now, check: check() });
    expect(md).toContain("# Relatório Operacional — Clasen Studio");
    expect(md).toContain("## 1. Resumo executivo");
    expect(md).toContain("## 2. Produção");
    expect(md).toContain("## 3. Carga da Gabi");
    expect(md).toContain("## 4. Revisão e retrabalho");
    expect(md).toContain("## 5. Gargalos");
    expect(md).toContain("## 6. Capacidade");
    expect(md).toContain("## 7. Decisões sugeridas");
    expect(md).toContain("## 8. Pergunta central");
  });

  it("mostra período e mês legíveis", () => {
    const md = buildOperationalReportMarkdown({ now, check: check() });
    expect(md).toContain("Fim do mês");
    expect(md).toContain("Jun/2026");
  });

  it("rotula a produção como carga planejada/contratada", () => {
    const md = buildOperationalReportMarkdown({ now, check: check() });
    expect(md.toLowerCase()).toContain("planejada");
  });

  it("inclui score e valores de produção", () => {
    const md = buildOperationalReportMarkdown({ now, check: check() });
    expect(md).toContain("Score operacional"); // (4+4+4+4+4)/5 = 4,0
    expect(md).toContain("4");
    expect(md).toContain("120"); // posts totais
    expect(md).toContain("96,5"); // UO formatada pt-BR
  });

  it("mostra execução e retrabalho como rótulos qualitativos (não números)", () => {
    const md = buildOperationalReportMarkdown({ now, check: check() });
    expect(md).toContain("Entregas executadas pela Gabi: Pouco");
    expect(md).toContain("Copys devolvidas para refação: Nada");
    expect(md).toContain("Posts revisados pela Gabi: Bastante");
    expect(md).toContain("Posts revisados pelo Pedro: Médio");
  });

  it("resolve nomes das clientes pesadas quando fornecidos", () => {
    const md = buildOperationalReportMarkdown({
      now,
      check: check(),
      clientesPesadasNomes: ["Isabella", "Marina"],
    });
    expect(md).toContain("Isabella");
    expect(md).toContain("Marina");
  });

  it("sem check anterior, a pergunta central indica falta de base", () => {
    const md = buildOperationalReportMarkdown({ now, check: check(), previousCheck: null });
    expect(md.toLowerCase()).toContain("sem base");
  });

  it("com melhora em relação ao anterior, indica dependência diminuindo", () => {
    const md = buildOperationalReportMarkdown({
      now,
      check: check({ notaExecucaoDireta: 5, notaRevisao: 5, notaDirecaoCriativa: 5 }),
      previousCheck: check({ notaExecucaoDireta: 2, notaRevisao: 2, notaDirecaoCriativa: 2 }),
    });
    expect(md.toLowerCase()).toContain("diminuindo");
  });

  it("capacidade baixa reflete status crítico na leitura", () => {
    const md = buildOperationalReportMarkdown({
      now,
      check: check({ notaCapacidade: 1, notaExecucaoDireta: 1, notaEnergia: 1, notaRevisao: 1, notaDirecaoCriativa: 1 }),
    });
    expect(md).toContain("Crítico");
  });

  it("marca decisões sugeridas com checkbox", () => {
    const md = buildOperationalReportMarkdown({ now, check: check({ notaCapacidade: 5 }) });
    // checklist com itens marcados [x] e desmarcados [ ]
    expect(md).toMatch(/- \[[ x]\]/);
  });

  it("não quebra com campos numéricos nulos", () => {
    const md = buildOperationalReportMarkdown({
      now,
      check: check({ postsTotais: null, unidadesOperacionais: null, copysDevolvidas: null, entregasExecutadasGabi: null }),
    });
    expect(md).toContain("## 2. Produção");
    expect(md).toContain("—"); // placeholder de valor ausente
  });
});
