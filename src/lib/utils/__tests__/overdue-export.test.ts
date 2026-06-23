import { describe, it, expect } from "vitest";
import { buildOverdueMarkdown, buildOverdueWhatsApp } from "../overdue-export";
import type { OverdueRow } from "../overdue";

function row(over: Partial<OverdueRow> = {}): OverdueRow {
  return {
    planId: 1,
    clientName: "Ana Silva",
    planType: "Essential",
    rowValue: 400,
    dueDate: "2026-04-10",
    diasAtraso: 30,
    hasBillingCycle: true,
    ...over,
  };
}

describe("buildOverdueMarkdown", () => {
  it("lista vazia → mensagem amigável (sem quebrar)", () => {
    expect(buildOverdueMarkdown([])).toMatch(/nenhum/i);
  });

  it("inclui cliente, plano, valor BRL e vencimento formatado", () => {
    const md = buildOverdueMarkdown([row()]);
    expect(md).toContain("Ana Silva");
    expect(md).toContain("Essential");
    expect(md).toContain("R$ 400,00");
    expect(md).toContain("10/04/2026");
  });

  it("instrui o ChatGPT a cruzar com o extrato", () => {
    const md = buildOverdueMarkdown([row()]);
    expect(md.toLowerCase()).toContain("extrato");
  });

  it("agrupa vários vencimentos do mesmo plano numa só linha", () => {
    const md = buildOverdueMarkdown([
      row({ planId: 1, dueDate: "2026-04-10", diasAtraso: 60 }),
      row({ planId: 1, dueDate: "2026-05-10", diasAtraso: 30 }),
    ]);
    const bullets = md.split("\n").filter((l) => l.startsWith("- "));
    expect(bullets).toHaveLength(1);
    expect(bullets[0]).toContain("10/04/2026");
    expect(bullets[0]).toContain("10/05/2026");
  });

  it("planos distintos viram linhas distintas", () => {
    const md = buildOverdueMarkdown([
      row({ planId: 1, clientName: "Ana Silva" }),
      row({ planId: 2, clientName: "Bia Gracher", rowValue: 270 }),
    ]);
    const bullets = md.split("\n").filter((l) => l.startsWith("- "));
    expect(bullets).toHaveLength(2);
    expect(md).toContain("Ana Silva");
    expect(md).toContain("Bia Gracher");
    expect(md).toContain("R$ 270,00");
  });

  it("conta o número de planos no título", () => {
    const md = buildOverdueMarkdown([
      row({ planId: 1 }),
      row({ planId: 2 }),
      row({ planId: 1, dueDate: "2026-05-10" }), // mesmo plano 1 → não conta 2x
    ]);
    expect(md).toContain("(2)");
  });
});

describe("buildOverdueWhatsApp", () => {
  it("lista vazia → mensagem amigável", () => {
    expect(buildOverdueWhatsApp([])).toMatch(/nenhum/i);
  });

  it("inclui nome em negrito, valor em aberto e desde quando", () => {
    const txt = buildOverdueWhatsApp([row()]);
    expect(txt).toContain("*Ana Silva*");
    expect(txt).toContain("R$ 400,00");
    expect(txt).toContain("desde 10/04");
  });

  it("soma as mensalidades em aberto do mesmo plano no valor e usa a data mais antiga", () => {
    const txt = buildOverdueWhatsApp([
      row({ planId: 1, rowValue: 400, dueDate: "2026-05-10", diasAtraso: 30 }),
      row({ planId: 1, rowValue: 400, dueDate: "2026-04-10", diasAtraso: 60 }),
    ]);
    expect(txt).toContain("R$ 800,00"); // 400 × 2
    expect(txt).toContain("2 mensalidades");
    expect(txt).toContain("desde 10/04"); // a mais antiga, independente da ordem
  });

  it("total em aberto soma todos os clientes", () => {
    const txt = buildOverdueWhatsApp([
      row({ planId: 1, rowValue: 400 }),
      row({ planId: 2, rowValue: 270, clientName: "Bia" }),
    ]);
    expect(txt).toMatch(/Total em aberto:\s*R\$ 670,00/);
  });
});
