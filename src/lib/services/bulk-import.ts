// ─── Bulk Import — Conciliação via JSON do ChatGPT ────────────────────────────
//
// Fluxo:
//   1. Pedro cola JSON gerado pelo ChatGPT (ou usa o canônico).
//   2. parseBulkImport() valida e devolve entries normalizadas.
//   3. resolveBulkImport() resolve cliente/plano e detecta duplicatas (read-only).
//   4. Pedro revisa preview e toma decisões inline.
//   5. applyBulkImport() grava linha-a-linha (sem db.transaction()), reportando
//      applied + errors. Idempotência baseada em chaves naturais. Ordenação
//      ASC por (planId, date) garante que `nextPaymentDate` reflita o pagamento
//      mais recente do plano.

import { and, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { normalizeClientName } from "./reconciliation";
import { recordPayment } from "./plans";
import { createRevenue } from "./revenues";
import { createExpense, type ExpenseCategory } from "./expenses";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type EntryType = "plan_payment" | "one_time_revenue" | "expense";

export type EntryStatus =
  | "ready"
  | "low_confidence"
  | "duplicate_warning"
  | "amount_mismatch"
  | "ambiguous"
  | "unknown_client"
  | "no_active_plan"
  | "skipped_by_directive"
  | "error";

export interface NormalizedEntry {
  type: EntryType;
  /** ISO YYYY-MM-DD — obrigatório para plan_payment e one_time_revenue; opcional para expense */
  date?: string | null;
  /** YYYY-MM — obrigatório para expense; derivado de date para os outros */
  month?: string | null;
  amount: number;
  clientName?: string | null;
  description?: string | null;
  product?: string | null;
  channel?: string | null;
  campaign?: string | null;
  category?: ExpenseCategory;
  isPaid?: boolean;
  /** 0-100; <90 vira `low_confidence` */
  confidence?: number | null;
  bank?: string | null;
  /** string original do `tipo`/`type` do JSON (para auditoria) */
  rawType?: string | null;
  notes?: string | null;
}

export interface CandidateClient {
  id: number;
  name: string;
}

export interface CandidatePlan {
  id: number;
  planType: string;
  planValue: number;
}

export interface PreviewItem {
  index: number;
  entry: NormalizedEntry;
  status: EntryStatus;
  reason: string;
  /** Resolvido para ready/duplicate_warning/low_confidence/amount_mismatch */
  clientId?: number | null;
  /** Candidatos de cliente para `ambiguous` (nome casa com vários clientes) */
  candidates?: CandidateClient[];
  /** Candidatos de plano para `ambiguous` (cliente tem 2+ planos ativos) */
  planCandidates?: CandidatePlan[];
  /** Resolvido para plan_payment */
  planId?: number | null;
  /** ID do registro existente em caso de duplicate_warning */
  duplicateOfId?: number;
}

export interface BulkImportPreview {
  source: string;
  items: PreviewItem[];
  /** Entradas que vieram em `desconsiderados[]` do JSON (não entram em items) */
  skippedFromInput: number;
  counts: Record<EntryStatus, number>;
}

export interface Decision {
  index: number;
  /** Inclui na aplicação. Default: status === "ready". */
  include: boolean;
  /** Para `ambiguous` e `unknown_client`: usar este cliente */
  clientIdOverride?: number | null;
  /** Para `ambiguous` por plano (cliente com 2+ planos ativos): usar este plano */
  planIdOverride?: number | null;
  /** Para `unknown_client` e `ambiguous` (avulsa): criar um novo cliente com `entry.clientName` */
  createClient?: boolean;
  /** Para `no_active_plan`: aplicar como receita avulsa em vez de plano */
  applyAsRevenue?: boolean;
}

export interface ApplyResult {
  applied: number;
  appliedIds: Array<{ index: number; type: EntryType; id: number }>;
  errors: Array<{
    index: number;
    type: EntryType;
    rawEntry: NormalizedEntry;
    reason: string;
  }>;
}

// ─── Mapeamento de "tipo" PT → action ─────────────────────────────────────────

function mapTipoToAction(
  rawType: string | undefined | null
): { type: EntryType } | { skipped: true; reason: string } | { invalid: string } {
  if (!rawType) return { invalid: "campo type/tipo obrigatório" };
  const norm = String(rawType).trim().toLowerCase();
  if (!norm) return { invalid: "campo type/tipo obrigatório" };

  // Canônico (preferido)
  if (norm === "plan_payment") return { type: "plan_payment" };
  if (norm === "one_time_revenue") return { type: "one_time_revenue" };
  if (norm === "expense") return { type: "expense" };

  // Legado em português
  if (norm === "plano recorrente") return { type: "plan_payment" };
  if (norm === "avulso") return { type: "one_time_revenue" };
  if (norm === "despesa") return { type: "expense" };

  // Skipped por diretiva do GPT
  if (norm.startsWith("plano recorrente — outra conta") || norm.startsWith("plano recorrente - outra conta")) {
    return { skipped: true, reason: "Cliente paga em outra conta" };
  }
  if (norm.startsWith("dívida de ex-cliente") || norm.startsWith("divida de ex-cliente")) {
    return { skipped: true, reason: "Saldo de ex-cliente (Pedro: skip no MVP)" };
  }
  if (norm.startsWith("desconsiderar")) {
    return { skipped: true, reason: "GPT marcou como desconsiderar" };
  }

  return { invalid: `tipo desconhecido: "${rawType}"` };
}

// ─── parseBulkImport ──────────────────────────────────────────────────────────

export interface ParsedInput {
  source: string;
  entries: NormalizedEntry[];
  /** Erros de normalização (campos faltando, valores inválidos) */
  entryErrors: Array<{ index: number; reason: string; raw: unknown }>;
  /** clientName → planId/clientId/etc — preenchido em resolveBulkImport */
  aliasMap?: Record<string, string[]>;
  /** Quantos itens vieram em `desconsiderados[]` */
  skippedFromInput: number;
  /** Total de entradas "skipped_by_directive" detectadas no array principal (tipos de skip) */
  skippedFromTypes: NormalizedEntry[];
}

export function parseBulkImport(rawJson: string): ParsedInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`JSON inválido: ${msg}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("JSON inválido: esperado objeto raiz");
  }

  const obj = parsed as Record<string, unknown>;

  // Aceita `entries` (canônico) OU `pagamentos` (legado)
  const rawArray =
    (Array.isArray(obj.entries) && obj.entries) ||
    (Array.isArray(obj.pagamentos) && obj.pagamentos) ||
    null;

  if (!rawArray) {
    throw new Error('JSON inválido: faltando array "entries" ou "pagamentos"');
  }

  const source =
    typeof obj.source === "string"
      ? obj.source
      : typeof obj.gerado_em === "string"
      ? `gerado_em ${obj.gerado_em}`
      : "import";

  // Alias map (opcional): diretrizes.aliases_confirmados → { canonical: [alias1, alias2] }
  let aliasMap: Record<string, string[]> | undefined;
  const diretrizes = obj.diretrizes as Record<string, unknown> | undefined;
  if (diretrizes && typeof diretrizes === "object") {
    const ac = diretrizes.aliases_confirmados;
    if (ac && typeof ac === "object" && !Array.isArray(ac)) {
      aliasMap = {};
      for (const [canonical, aliases] of Object.entries(ac as Record<string, unknown>)) {
        if (Array.isArray(aliases)) {
          aliasMap[canonical] = aliases.filter((a): a is string => typeof a === "string");
        }
      }
    }
  }

  // Conta desconsiderados[] (só métrica para preview)
  const skippedFromInput = Array.isArray(obj.desconsiderados) ? obj.desconsiderados.length : 0;

  const entries: NormalizedEntry[] = [];
  const skippedFromTypes: NormalizedEntry[] = [];
  const entryErrors: ParsedInput["entryErrors"] = [];

  rawArray.forEach((raw: unknown, index: number) => {
    const result = normalizeEntry(raw);
    if ("error" in result) {
      entryErrors.push({ index, reason: result.error, raw });
      return;
    }
    if ("skipped" in result) {
      skippedFromTypes.push(result.entry);
      return;
    }
    entries.push(result.entry);
  });

  return { source, entries, entryErrors, aliasMap, skippedFromInput, skippedFromTypes };
}

// ─── normalizeEntry ───────────────────────────────────────────────────────────

type NormalizeResult =
  | { entry: NormalizedEntry }
  | { skipped: true; entry: NormalizedEntry }
  | { error: string };

export function normalizeEntry(raw: unknown): NormalizeResult {
  if (!raw || typeof raw !== "object") return { error: "entry não é objeto" };
  const r = raw as Record<string, unknown>;

  const rawType = (r.type ?? r.tipo) as string | undefined;
  const mapping = mapTipoToAction(rawType);

  if ("invalid" in mapping) return { error: mapping.invalid };

  // Campos com aliases — legacy do JSON do Pedro
  const date = pickString(r.date, r.data);
  const month = pickString(r.month);
  const amountRaw = r.amount ?? r.valor_brl ?? r.valor;
  const clientName = pickString(r.clientName, r.cliente_pagador, r.cliente);
  const description = pickString(r.description, r.nome_no_extrato, r.descricao);
  const confidence = pickNumber(r.confidence, r.confianca_pct, r.confianca);
  const bank = pickString(r.bank, r.banco);
  const product = pickString(r.product, r.produto);
  const channel = pickString(r.channel, r.canal);
  const campaign = pickString(r.campaign, r.campanha);
  const category = pickString(r.category, r.categoria) as ExpenseCategory | undefined;
  const isPaidRaw = r.isPaid ?? r.is_paid ?? r.pago;
  const isPaid = typeof isPaidRaw === "boolean" ? isPaidRaw : undefined;
  const notes = pickString(r.notes, r.observacao, r.obs);

  // Valor: aceita number, string com vírgula ("1.200,00") ou ponto ("1200.00")
  const amount = coerceAmount(amountRaw);
  if (amount === null) {
    return { error: `valor inválido para entry: ${String(amountRaw)}` };
  }

  if ("skipped" in mapping) {
    return {
      skipped: true,
      entry: {
        type: "one_time_revenue", // placeholder (não vai ser aplicado)
        date,
        month,
        amount,
        clientName,
        description,
        rawType: rawType ?? null,
        confidence,
        bank,
        notes: mapping.reason,
      },
    };
  }

  const type = mapping.type;

  // Validações por tipo
  if (type === "plan_payment" || type === "one_time_revenue") {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: `${type}: campo date/data obrigatório (formato YYYY-MM-DD)` };
    }
  }

  if (type === "expense") {
    // expense pode usar `month` direto ou derivar de date
    const derivedMonth = month || (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : null);
    if (!derivedMonth || !/^\d{4}-\d{2}$/.test(derivedMonth)) {
      return { error: "expense: campo month obrigatório (formato YYYY-MM)" };
    }
    if (!description) {
      return { error: "expense: campo description/descricao obrigatório" };
    }
    const cat: ExpenseCategory = category === "fixo" ? "fixo" : "variavel";
    return {
      entry: {
        type,
        date: date || null,
        month: derivedMonth,
        amount,
        description,
        category: cat,
        isPaid: isPaid ?? true,
        confidence,
        bank,
        rawType: rawType ?? null,
        notes,
      },
    };
  }

  if (type === "plan_payment") {
    if (!clientName) {
      return { error: "plan_payment: campo clientName/cliente_pagador obrigatório" };
    }
  }

  if (type === "one_time_revenue") {
    // clientName é opcional (avulso pode ser sem cliente cadastrado)
    // mas product é recomendado — default "Avulso"
  }

  return {
    entry: {
      type,
      date,
      month: date ? date.slice(0, 7) : null,
      amount,
      clientName,
      description,
      product: product || (type === "one_time_revenue" ? "Avulso" : null),
      channel,
      campaign,
      confidence,
      bank,
      rawType: rawType ?? null,
      notes,
    },
  };
}

function pickString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string" && v.trim() && !isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

function coerceAmount(raw: unknown): number | null {
  if (typeof raw === "number" && !isNaN(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[^\d.,-]/g, "");
    // "1.200,50" → "1200.50" / "1200.50" → "1200.50"
    const hasComma = cleaned.includes(",");
    const normalized = hasComma
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned;
    const n = parseFloat(normalized);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

// ─── Resolução de cliente ─────────────────────────────────────────────────────

export interface ClientResolution {
  status: "matched" | "ambiguous" | "unknown";
  clientId?: number;
  candidates?: CandidateClient[];
}

export async function resolveClientByName(
  db: any,
  name: string,
  aliasMap?: Record<string, string[]>,
  cache?: Map<string, ClientResolution>,
  clientsCache?: Array<{ id: number; name: string }>
): Promise<ClientResolution> {
  const key = normalizeClientName(name);
  if (cache?.has(key)) return cache.get(key)!;

  const allClients =
    clientsCache ??
    ((await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).all()) as Array<{
      id: number;
      name: string;
    }>);

  // 1. Alias direto: se name == um alias conhecido, mapeia pro canônico
  if (aliasMap) {
    for (const [canonical, aliases] of Object.entries(aliasMap)) {
      const aliasesNorm = aliases.map(normalizeClientName);
      if (aliasesNorm.includes(key) || normalizeClientName(canonical) === key) {
        const found = allClients.find((c) => normalizeClientName(c.name) === normalizeClientName(canonical));
        if (found) {
          const res: ClientResolution = { status: "matched", clientId: found.id };
          cache?.set(key, res);
          return res;
        }
      }
    }
  }

  // 2. Match exato normalizado
  const exact = allClients.filter((c) => normalizeClientName(c.name) === key);
  if (exact.length === 1) {
    const res: ClientResolution = { status: "matched", clientId: exact[0].id };
    cache?.set(key, res);
    return res;
  }
  if (exact.length > 1) {
    const res: ClientResolution = {
      status: "ambiguous",
      candidates: exact.map((c) => ({ id: c.id, name: c.name })),
    };
    cache?.set(key, res);
    return res;
  }

  // 3. Match por tokens (cada token >2 chars do query deve estar no nome cadastrado)
  const queryTokens = key.split(" ").filter((t) => t.length > 2);
  if (queryTokens.length === 0) {
    const res: ClientResolution = { status: "unknown" };
    cache?.set(key, res);
    return res;
  }

  const scored = allClients
    .map((c) => {
      const clientTokens = normalizeClientName(c.name).split(" ").filter((t) => t.length > 2);
      const hits = queryTokens.filter((t) => clientTokens.includes(t)).length;
      return { client: c, score: hits, totalQueryTokens: queryTokens.length };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    const res: ClientResolution = { status: "unknown" };
    cache?.set(key, res);
    return res;
  }

  // Considera "matched" quando o melhor score é estritamente maior que o segundo melhor
  // (cliente único com a maior pontuação)
  const top = scored[0];
  const tied = scored.filter((s) => s.score === top.score);
  if (tied.length === 1) {
    const res: ClientResolution = { status: "matched", clientId: top.client.id };
    cache?.set(key, res);
    return res;
  }
  const res: ClientResolution = {
    status: "ambiguous",
    candidates: tied.map((s) => ({ id: s.client.id, name: s.client.name })),
  };
  cache?.set(key, res);
  return res;
}

// ─── Resolução de plano ativo para um cliente ────────────────────────────────

async function findActivePlanForClient(
  db: any,
  clientId: number
): Promise<
  | { status: "found"; planId: number; planValue: number }
  | { status: "none" }
  | { status: "multiple"; plans: CandidatePlan[] }
> {
  const plans = (await db
    .select({
      id: schema.subscriptionPlans.id,
      planType: schema.subscriptionPlans.planType,
      planValue: schema.subscriptionPlans.planValue,
    })
    .from(schema.subscriptionPlans)
    .where(
      and(
        eq(schema.subscriptionPlans.clientId, clientId),
        sql`${schema.subscriptionPlans.endDate} IS NULL`
      )
    )
    .all()) as CandidatePlan[];

  if (plans.length === 0) return { status: "none" };
  if (plans.length > 1) return { status: "multiple", plans };
  return { status: "found", planId: plans[0].id, planValue: plans[0].planValue };
}

// ─── Detecção de duplicatas ───────────────────────────────────────────────────

async function findDuplicatePlanPayment(
  db: any,
  planId: number,
  paymentDate: string,
  amount: number
): Promise<number | null> {
  const existing = (await db
    .select({ id: schema.planPayments.id, skipped: schema.planPayments.skipped })
    .from(schema.planPayments)
    .where(
      and(
        eq(schema.planPayments.planId, planId),
        eq(schema.planPayments.paymentDate, paymentDate),
        eq(schema.planPayments.amount, amount)
      )
    )
    .all()) as Array<{ id: number; skipped: boolean | number }>;

  const realPayment = existing.find((p) => !p.skipped);
  return realPayment?.id ?? null;
}

async function findDuplicateRevenue(
  db: any,
  date: string,
  amount: number,
  clientId: number | null,
  product: string
): Promise<number | null> {
  const all = (await db.select().from(schema.oneTimeRevenues).all()) as Array<{
    id: number;
    date: string;
    amount: number;
    clientId: number | null;
    product: string;
  }>;
  const match = all.find(
    (r) =>
      r.date === date &&
      Math.abs(r.amount - amount) < 0.005 &&
      r.clientId === clientId &&
      (clientId !== null ||
        r.product.trim().toLowerCase() === product.trim().toLowerCase())
  );
  return match?.id ?? null;
}

async function findDuplicateExpense(
  db: any,
  month: string,
  description: string,
  amount: number
): Promise<number | null> {
  const all = (await db.select().from(schema.expenses).where(eq(schema.expenses.month, month)).all()) as Array<{
    id: number;
    description: string;
    amount: number;
  }>;
  const desc = description.trim().toLowerCase();
  const match = all.find(
    (e) => e.description.trim().toLowerCase() === desc && Math.abs(e.amount - amount) < 0.005
  );
  return match?.id ?? null;
}

// ─── resolveBulkImport ────────────────────────────────────────────────────────

export const LOW_CONFIDENCE_THRESHOLD = 90;

/** Formata valor em BRL para mensagens de aviso (ex: "R$ 280,00"). */
function fmtBRL(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

export async function resolveBulkImport(
  db: any,
  rawJson: string
): Promise<BulkImportPreview> {
  const parsed = parseBulkImport(rawJson);
  const items: PreviewItem[] = [];
  const cache = new Map<string, ClientResolution>();
  // Pré-carrega clients uma vez (cache em memória — performance)
  const clientsCache = (await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).all()) as Array<{
    id: number;
    name: string;
  }>;

  // Erros de normalização entram primeiro
  for (const err of parsed.entryErrors) {
    items.push({
      index: err.index,
      entry: {
        type: "one_time_revenue", // placeholder
        amount: 0,
        rawType: null,
      } as NormalizedEntry,
      status: "error",
      reason: err.reason,
    });
  }

  // Entries skipped pelo tipo (do GPT)
  // Estes contam mas não vão para items principais — adiciono com status próprio
  // para que UI mostre.
  parsed.skippedFromTypes.forEach((entry, i) => {
    items.push({
      index: parsed.entries.length + i,
      entry,
      status: "skipped_by_directive",
      reason: entry.notes ?? "Marcado para ignorar",
    });
  });

  for (let i = 0; i < parsed.entries.length; i++) {
    const entry = parsed.entries[i];
    const item = await resolveOne(db, entry, i, parsed.aliasMap, cache, clientsCache);
    items.push(item);
  }

  // Counts
  const counts: Record<EntryStatus, number> = {
    ready: 0,
    low_confidence: 0,
    duplicate_warning: 0,
    amount_mismatch: 0,
    ambiguous: 0,
    unknown_client: 0,
    no_active_plan: 0,
    skipped_by_directive: 0,
    error: 0,
  };
  items.forEach((it) => {
    counts[it.status]++;
  });

  return {
    source: parsed.source,
    items,
    skippedFromInput: parsed.skippedFromInput,
    counts,
  };
}

async function resolveOne(
  db: any,
  entry: NormalizedEntry,
  index: number,
  aliasMap: Record<string, string[]> | undefined,
  cache: Map<string, ClientResolution>,
  clientsCache: Array<{ id: number; name: string }>
): Promise<PreviewItem> {
  const lowConfidence =
    typeof entry.confidence === "number" && entry.confidence < LOW_CONFIDENCE_THRESHOLD;

  // Despesa: não precisa de cliente
  if (entry.type === "expense") {
    if (!entry.month) {
      return { index, entry, status: "error", reason: "expense sem month" };
    }
    const dupId = await findDuplicateExpense(
      db,
      entry.month,
      entry.description ?? "",
      entry.amount
    );
    if (dupId !== null) {
      return {
        index,
        entry,
        status: "duplicate_warning",
        reason: `Já existe despesa com mesma descrição/valor em ${entry.month}`,
        duplicateOfId: dupId,
      };
    }
    if (lowConfidence) {
      return {
        index,
        entry,
        status: "low_confidence",
        reason: `Confiança ${entry.confidence}% — revisar`,
      };
    }
    return { index, entry, status: "ready", reason: "OK" };
  }

  // plan_payment ou one_time_revenue: precisa de cliente
  let clientId: number | null = null;

  if (entry.clientName) {
    const res = await resolveClientByName(db, entry.clientName, aliasMap, cache, clientsCache);
    if (res.status === "matched") {
      clientId = res.clientId!;
    } else if (res.status === "ambiguous") {
      return {
        index,
        entry,
        status: "ambiguous",
        reason: `${res.candidates!.length} clientes batem`,
        candidates: res.candidates,
      };
    } else {
      // unknown — vale para plan_payment e one_time_revenue:
      // o GPT identificou um pagador mas o nome não casou com nenhum cadastro.
      // Pedro decide: criar cliente novo, vincular a um existente, ou (avulsa) seguir sem cliente.
      return {
        index,
        entry,
        status: "unknown_client",
        reason: `Cliente "${entry.clientName}" não encontrado`,
      };
    }
  } else if (entry.type === "plan_payment") {
    return { index, entry, status: "error", reason: "plan_payment sem clientName" };
  }

  // plan_payment: resolver plano ativo
  if (entry.type === "plan_payment" && clientId !== null) {
    const planRes = await findActivePlanForClient(db, clientId);
    if (planRes.status === "none") {
      return {
        index,
        entry,
        status: "no_active_plan",
        reason: `Cliente sem plano ativo`,
        clientId,
      };
    }
    if (planRes.status === "multiple") {
      return {
        index,
        entry,
        status: "ambiguous",
        reason: `Cliente tem ${planRes.plans.length} planos ativos — escolher um`,
        clientId,
        planCandidates: planRes.plans,
      };
    }
    const planId = planRes.planId;
    const dupId = await findDuplicatePlanPayment(db, planId, entry.date!, entry.amount);
    if (dupId !== null) {
      return {
        index,
        entry,
        status: "duplicate_warning",
        reason: `Pagamento já existe para este plano/data/valor`,
        clientId,
        planId,
        duplicateOfId: dupId,
      };
    }
    if (lowConfidence) {
      return {
        index,
        entry,
        status: "low_confidence",
        reason: `Confiança ${entry.confidence}% — revisar`,
        clientId,
        planId,
      };
    }
    if (Math.abs(entry.amount - planRes.planValue) >= 0.01) {
      return {
        index,
        entry,
        status: "amount_mismatch",
        reason: `Valor ${fmtBRL(entry.amount)} diverge do plano (${fmtBRL(planRes.planValue)})`,
        clientId,
        planId,
      };
    }
    return { index, entry, status: "ready", reason: "OK", clientId, planId };
  }

  // one_time_revenue
  if (entry.type === "one_time_revenue") {
    const product = entry.product ?? "Avulso";
    const dupId = await findDuplicateRevenue(db, entry.date!, entry.amount, clientId, product);
    if (dupId !== null) {
      return {
        index,
        entry,
        status: "duplicate_warning",
        reason: `Receita avulsa já existe (mesma data/valor/cliente)`,
        clientId,
        duplicateOfId: dupId,
      };
    }
    if (lowConfidence) {
      return {
        index,
        entry,
        status: "low_confidence",
        reason: `Confiança ${entry.confidence}% — revisar`,
        clientId,
      };
    }
    return { index, entry, status: "ready", reason: "OK", clientId };
  }

  return { index, entry, status: "error", reason: "tipo não reconhecido" };
}

// ─── buildAuditNote ───────────────────────────────────────────────────────────

export function buildAuditNote(source: string, entry: NormalizedEntry, today: string): string {
  const lines = [`[bulk-import ${today} source="${source}"]`];
  if (entry.description) lines.push(`nome_no_extrato: "${entry.description}"`);
  const parts: string[] = [];
  if (entry.bank) parts.push(`banco: ${entry.bank}`);
  if (typeof entry.confidence === "number") parts.push(`confianca_pct: ${entry.confidence}`);
  if (parts.length > 0) lines.push(parts.join(" | "));
  if (entry.notes) lines.push(entry.notes);
  return lines.join("\n");
}

// ─── applyBulkImport ──────────────────────────────────────────────────────────

export async function applyBulkImport(
  db: any,
  preview: BulkImportPreview,
  decisions: Decision[],
  today: string = new Date().toISOString().slice(0, 10)
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, appliedIds: [], errors: [] };
  const decisionByIndex = new Map<number, Decision>();
  for (const d of decisions) decisionByIndex.set(d.index, d);

  // Filtrar items que vão ser aplicados (include=true)
  const toApply: PreviewItem[] = [];
  for (const item of preview.items) {
    const d = decisionByIndex.get(item.index);
    const shouldInclude = d ? d.include : item.status === "ready";
    if (!shouldInclude) continue;
    if (item.status === "skipped_by_directive" || item.status === "error") continue;
    toApply.push(item);
  }

  // Ordenar por (planId, date ASC) para plan_payments → garante que
  // lastPaymentDate/nextPaymentDate reflitam o pagamento mais recente
  toApply.sort((a, b) => {
    const aDate = a.entry.date || a.entry.month || "";
    const bDate = b.entry.date || b.entry.month || "";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return (a.planId ?? 0) - (b.planId ?? 0);
  });

  for (const item of toApply) {
    const d = decisionByIndex.get(item.index);
    try {
      const id = await applyOne(db, item, d, preview.source, today);
      result.applied++;
      result.appliedIds.push({ index: item.index, type: item.entry.type, id });
    } catch (err) {
      result.errors.push({
        index: item.index,
        type: item.entry.type,
        rawEntry: item.entry,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

async function applyOne(
  db: any,
  item: PreviewItem,
  decision: Decision | undefined,
  source: string,
  today: string
): Promise<number> {
  const { entry } = item;
  const notes = buildAuditNote(source, entry, today);

  // Resolver clientId final
  let clientId = decision?.clientIdOverride ?? item.clientId ?? null;

  if (decision?.createClient && entry.clientName) {
    // Cria cliente novo (sem reutilizar findOrCreateClient — Pedro confirmou explicitamente)
    const created = (await db
      .insert(schema.clients)
      .values({ name: entry.clientName.trim() })
      .returning()
      .get()) as { id: number };
    clientId = created.id;
  }

  // Expense — não precisa de cliente
  if (entry.type === "expense") {
    if (!entry.month) throw new Error("expense sem month");
    if (!entry.description) throw new Error("expense sem description");
    const created = await createExpense(db, {
      month: entry.month,
      description: entry.description,
      category: entry.category ?? "variavel",
      amount: entry.amount,
      isPaid: entry.isPaid ?? true,
      notes,
    });
    return created.id;
  }

  // plan_payment
  if (entry.type === "plan_payment") {
    // Se Pedro pediu aplicar como avulso (no_active_plan) → cai pra receita avulsa
    if (decision?.applyAsRevenue) {
      const created = await createRevenue(db, {
        clientId,
        date: entry.date!,
        amount: entry.amount,
        product: entry.product ?? entry.description ?? "Avulso",
        description: entry.description,
        channel: entry.channel ?? entry.bank,
        notes,
        isPaid: true,
      });
      // createRevenue retorna 1 linha (não parcelado) ou array; aqui é não-parcelado
      if (Array.isArray(created)) {
        return created[0]?.id ?? 0;
      }
      return (created as { id: number }).id;
    }

    if (!clientId) throw new Error("plan_payment sem clientId");
    if (!entry.date) throw new Error("plan_payment sem date");

    // Resolver planId (preview pode não ter resolvido se item era no_active_plan/ambiguous antes da decisão).
    // planIdOverride vem da escolha do Pedro quando o cliente tem 2+ planos ativos.
    let planId = decision?.planIdOverride ?? item.planId ?? null;
    if (!planId) {
      const res = await findActivePlanForClient(db, clientId);
      if (res.status === "found") planId = res.planId;
      else throw new Error(`não há plano ativo único para cliente ${clientId}`);
    }

    const payment = await recordPayment(db, {
      planId,
      paymentDate: entry.date,
      amount: entry.amount,
      status: "pago",
      notes,
    });
    return (payment as { id: number }).id;
  }

  // one_time_revenue
  if (entry.type === "one_time_revenue") {
    if (!entry.date) throw new Error("one_time_revenue sem date");
    const created = await createRevenue(db, {
      clientId,
      date: entry.date,
      amount: entry.amount,
      product: entry.product ?? "Avulso",
      description: entry.description,
      channel: entry.channel ?? entry.bank,
      campaign: entry.campaign,
      notes,
      isPaid: entry.isPaid ?? true,
    });
    if (Array.isArray(created)) {
      return created[0]?.id ?? 0;
    }
    return (created as { id: number }).id;
  }

  throw new Error(`tipo não suportado: ${entry.type}`);
}
