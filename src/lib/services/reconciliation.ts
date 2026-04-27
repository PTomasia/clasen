// ─── Conciliação bancária — Caminho A (extrato manual) ───────────────────────
//
// Fluxo:
// 1. Pedro cola o texto do extrato em /conciliacao
// 2. parseStatementText() extrai linhas (data, descrição, valor)
// 3. matchTransactions() propõe matches heurísticos contra planos ativos
// 4. Pedro confirma linha a linha
// 5. applyMatches() chama recordPayment() em batch

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface TransactionLine {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // positivo = crédito
}

export interface ExpectedPayment {
  planId: number;
  clientName: string;
  planValue: number;
  expectedMonth: string; // YYYY-MM
}

export type MatchConfidence = "high" | "medium" | "low";

export interface MatchProposal {
  transaction: TransactionLine;
  plan: ExpectedPayment;
  confidence: MatchConfidence;
  reason: string;
}

// ─── parseStatementText ───────────────────────────────────────────────────────
// Aceita texto cru colado do extrato do Banco Inter (ou similar).
// Formato esperado por linha: DD/MM/AAAA  <descrição>  <valor>
// Valor pode ser: "800,00" | "1.200,50" | "600" | "-200,00" (débitos ignorados)

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+(.+?)\s+([\d.,]+)(-?)$/;

function parseAmount(raw: string, suffix: string): number | null {
  if (suffix === "-") return null; // débito explícito
  // Remove pontos de milhar, troca vírgula por ponto
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  if (isNaN(n) || n <= 0) return null;
  return n;
}

export function parseStatementText(text: string): TransactionLine[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const result: TransactionLine[] = [];

  for (const line of lines) {
    // Tenta casar o padrão DD/MM/AAAA ... valor
    const m = line.match(DATE_RE);
    if (!m) continue;

    const [, dd, mm, yyyy, description, rawAmount, suffix] = m;
    const amount = parseAmount(rawAmount, suffix);
    if (amount === null) continue;

    // Ignora se a linha completa indica débito (valor negativo no meio)
    if (rawAmount.startsWith("-")) continue;

    const date = `${yyyy}-${mm}-${dd}`;
    result.push({ date, description: description.trim(), amount });
  }

  return result;
}

// ─── normalizeClientName ──────────────────────────────────────────────────────
// Remove acentos, caixa alta, stopwords (de, da, do, dos, das, e, a, o).

const STOPWORDS = new Set(["de", "da", "do", "dos", "das", "e", "a", "o", "em", "no", "na"]);

export function normalizeClientName(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !STOPWORDS.has(w))
    .join(" ");
}

// ─── matchTransactions ────────────────────────────────────────────────────────
// Para cada transação encontra o melhor plano candidato.
// Regras de confiança:
//   high   — valor exato E pelo menos um token do nome do cliente aparece na descrição
//   medium — apenas valor exato (nome não identificado)
//   low    — apenas nome (valor diferente) → não implementado ainda (muito ruído)
//
// Cada plano só pode ser sugerido uma vez (previne duplicatas).

export function matchTransactions(
  transactions: TransactionLine[],
  plans: ExpectedPayment[],
  targetMonth: string // YYYY-MM — filtra planos do mês certo
): MatchProposal[] {
  const usedPlanIds = new Set<number>();
  const monthPlans = plans.filter((p) => p.expectedMonth === targetMonth);

  const proposals: MatchProposal[] = [];

  for (const tx of transactions) {
    // Planos ainda não matched com o mesmo valor
    const valueMatches = monthPlans.filter(
      (p) => !usedPlanIds.has(p.planId) && Math.abs(p.planValue - tx.amount) < 0.01
    );

    if (valueMatches.length === 0) continue;

    // Tenta match por nome na descrição
    const txDesc = normalizeClientName(tx.description);

    let bestPlan: ExpectedPayment | null = null;
    let bestScore = 0;
    let confidence: MatchConfidence = "medium";
    let reason = "valor exato";

    for (const plan of valueMatches) {
      const tokens = normalizeClientName(plan.clientName).split(" ");
      const matchedTokens = tokens.filter((t) => t.length > 2 && txDesc.includes(t));
      const score = matchedTokens.length;

      if (score > bestScore) {
        bestScore = score;
        bestPlan = plan;
        if (score > 0) {
          confidence = "high";
          reason = `valor exato + nome (${matchedTokens.join(", ")})`;
        }
      }
    }

    // Se nenhum nome bateu, pega o primeiro por valor
    if (!bestPlan) bestPlan = valueMatches[0];

    usedPlanIds.add(bestPlan.planId);
    proposals.push({ transaction: tx, plan: bestPlan, confidence, reason });
  }

  return proposals;
}

// ─── applyMatches ─────────────────────────────────────────────────────────────
// Aplica os matches confirmados chamando recordPayment em batch.
// Recebe apenas os IDs das propostas que Pedro confirmou.

import { recordPayment } from "./plans";

export interface ConfirmedMatch {
  planId: number;
  paymentDate: string; // YYYY-MM-DD (da transação)
  amount: number;
}

export async function applyMatches(
  db: any,
  matches: ConfirmedMatch[]
): Promise<{ applied: number; errors: { planId: number; error: string }[] }> {
  let applied = 0;
  const errors: { planId: number; error: string }[] = [];

  for (const m of matches) {
    try {
      await recordPayment(db, {
        planId: m.planId,
        paymentDate: m.paymentDate,
        amount: m.amount,
        status: "pago",
      });
      applied++;
    } catch (err: any) {
      errors.push({ planId: m.planId, error: err?.message ?? "Erro desconhecido" });
    }
  }

  return { applied, errors };
}
