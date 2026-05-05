import { describe, it, expect } from "vitest";
import {
  mdHeader,
  mdTable,
  mdBullet,
  mdBold,
  formatDateTimeBR,
} from "../format-utils";

describe("mdHeader", () => {
  it("gera cabeçalho H1/H2/H3", () => {
    expect(mdHeader(1, "Título")).toBe("# Título");
    expect(mdHeader(2, "Seção")).toBe("## Seção");
    expect(mdHeader(3, "Sub")).toBe("### Sub");
  });
});

describe("mdTable", () => {
  it("retorna string vazia se não houver linhas", () => {
    expect(mdTable([])).toBe("");
  });

  it("gera tabela com header + separador + body", () => {
    const out = mdTable([
      ["Cliente", "Valor"],
      ["Ana", "R$ 1.000"],
      ["Bia", "R$ 2.000"],
    ]);
    expect(out).toBe(
      [
        "| Cliente | Valor |",
        "| --- | --- |",
        "| Ana | R$ 1.000 |",
        "| Bia | R$ 2.000 |",
      ].join("\n")
    );
  });

  it("escapa pipes e quebras de linha nas células", () => {
    const out = mdTable([
      ["Col"],
      ["a|b"],
      ["c\nd"],
    ]);
    expect(out).toContain("| a\\|b |");
    expect(out).toContain("| c d |");
  });
});

describe("mdBullet / mdBold", () => {
  it("formata bullet e bold", () => {
    expect(mdBullet("texto")).toBe("- texto");
    expect(mdBold("destaque")).toBe("**destaque**");
  });
});

describe("formatDateTimeBR", () => {
  it("formata Date como dd/MM/yyyy HH:mm", () => {
    // Mai 4 2026 14:32 (local time)
    const date = new Date(2026, 4, 4, 14, 32, 0);
    expect(formatDateTimeBR(date)).toBe("04/05/2026 14:32");
  });

  it("zero-pad dia, mês, hora, minuto", () => {
    const date = new Date(2026, 0, 5, 9, 7, 0);
    expect(formatDateTimeBR(date)).toBe("05/01/2026 09:07");
  });
});
