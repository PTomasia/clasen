import { describe, it, expect } from "vitest";
import {
  parseStatementText,
  matchTransactions,
  normalizeClientName,
} from "../reconciliation";
import type { TransactionLine, ExpectedPayment } from "../reconciliation";

// ─── parseStatementText ───────────────────────────────────────────────────────

describe("parseStatementText", () => {
  it("parse linha padrão Inter: dd/mm/aaaa, descrição, valor", () => {
    const text = `
05/04/2026  PIX RECEBIDO  Ana Silva  800,00
10/04/2026  PIX RECEBIDO  Joao Souza  500,00
    `.trim();
    const lines = parseStatementText(text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ date: "2026-04-05", description: "PIX RECEBIDO  Ana Silva", amount: 800 });
    expect(lines[1]).toMatchObject({ date: "2026-04-10", description: "PIX RECEBIDO  Joao Souza", amount: 500 });
  });

  it("aceita valor com ponto como separador de milhar e vírgula como decimal", () => {
    const text = "05/04/2026  PIX RECEBIDO  Cliente X  1.200,50";
    const lines = parseStatementText(text);
    expect(lines[0].amount).toBe(1200.5);
  });

  it("aceita valor sem centavos", () => {
    const text = "05/04/2026  PAGAMENTO  Fulano  600";
    const lines = parseStatementText(text);
    expect(lines[0].amount).toBe(600);
  });

  it("ignora linhas sem data válida", () => {
    const text = `
Extrato de conta
Período: 01/04/2026 a 30/04/2026
05/04/2026  PIX  Ana  800,00
Saldo final: 10.000,00
    `.trim();
    const lines = parseStatementText(text);
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toContain("Ana");
  });

  it("ignora linhas com valor negativo (débitos)", () => {
    const text = `
05/04/2026  PIX RECEBIDO  Ana  800,00
06/04/2026  DEBITO  Fornecedor  -200,00
07/04/2026  TARIFA  Taxa  50,00-
    `.trim();
    const lines = parseStatementText(text);
    // Apenas créditos (positivos) são retornados
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(800);
  });

  it("retorna array vazio para texto sem transações", () => {
    const lines = parseStatementText("Sem dados aqui");
    expect(lines).toHaveLength(0);
  });
});

// ─── normalizeClientName ──────────────────────────────────────────────────────

describe("normalizeClientName", () => {
  it("remove acentos, caixa baixa, trim", () => {
    expect(normalizeClientName("Ana María Gómez")).toBe("ana maria gomez");
    expect(normalizeClientName("  JOAO SILVA  ")).toBe("joao silva");
  });

  it("remove stopwords comuns (de, da, do, e)", () => {
    expect(normalizeClientName("Maria de Souza")).toBe("maria souza");
    expect(normalizeClientName("Pedro e Joao")).toBe("pedro joao");
  });
});

// ─── matchTransactions ────────────────────────────────────────────────────────

const PLANS: ExpectedPayment[] = [
  { planId: 1, clientName: "Ana Silva",   planValue: 800, expectedMonth: "2026-04" },
  { planId: 2, clientName: "João Souza",  planValue: 500, expectedMonth: "2026-04" },
  { planId: 3, clientName: "Maria Luz",   planValue: 1200, expectedMonth: "2026-04" },
];

describe("matchTransactions", () => {
  it("alta confiança quando valor exato + nome do cliente na descrição", () => {
    const txs: TransactionLine[] = [
      { date: "2026-04-05", description: "PIX RECEBIDO ANA SILVA", amount: 800 },
    ];
    const matches = matchTransactions(txs, PLANS, "2026-04");
    expect(matches).toHaveLength(1);
    expect(matches[0].plan.planId).toBe(1);
    expect(matches[0].confidence).toBe("high");
  });

  it("média confiança quando apenas valor bate (nome não identificado)", () => {
    const txs: TransactionLine[] = [
      { date: "2026-04-08", description: "PIX RECEBIDO PAGAMENTO QUALQUER", amount: 500 },
    ];
    const matches = matchTransactions(txs, PLANS, "2026-04");
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe("medium");
  });

  it("sem match quando valor não corresponde a nenhum plano", () => {
    const txs: TransactionLine[] = [
      { date: "2026-04-08", description: "PIX RECEBIDO FULANA X", amount: 999 },
    ];
    const matches = matchTransactions(txs, PLANS, "2026-04");
    expect(matches).toHaveLength(0);
  });

  it("não sugere plano já com pagamento no mês (evita duplicata)", () => {
    const txs: TransactionLine[] = [
      { date: "2026-04-05", description: "PIX ANA SILVA", amount: 800 },
      { date: "2026-04-20", description: "PIX ANA SILVA", amount: 800 },
    ];
    const matches = matchTransactions(txs, PLANS, "2026-04");
    // Só um dos dois deve ser matched para planId 1
    const matchesForPlan1 = matches.filter((m) => m.plan.planId === 1);
    expect(matchesForPlan1).toHaveLength(1);
  });

  it("match parcial no nome (sobrenome suficiente)", () => {
    const txs: TransactionLine[] = [
      { date: "2026-04-03", description: "PIX RECEBIDO SOUZA", amount: 500 },
    ];
    const matches = matchTransactions(txs, PLANS, "2026-04");
    expect(matches[0]?.plan.planId).toBe(2);
  });
});
