import { eq, desc } from "drizzle-orm";
import * as schema from "../db/schema";
import { findOrCreateClient } from "./clients";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateRevenueInput {
  clientId?: number | null;
  clientName?: string | null; // alternativa a clientId: cria ou reutiliza cliente
  date: string; // YYYY-MM-DD
  amount: number;
  product: string;
  channel?: string | null;
  campaign?: string | null;
  isPaid?: boolean;
  notes?: string | null;
}

export interface UpdateRevenueInput {
  clientId: number | null;
  date: string;
  amount: number;
  product: string;
  channel?: string | null;
  campaign?: string | null;
  isPaid: boolean;
  notes?: string | null;
}

// ─── createRevenue ────────────────────────────────────────────────────────────

export async function createRevenue(db: any, input: CreateRevenueInput) {
  if (!input.amount || input.amount <= 0) {
    throw new Error("valor deve ser maior que zero");
  }
  if (!input.product?.trim()) {
    throw new Error("produto é obrigatório");
  }

  // Resolver clientId: pode vir direto ou via nome (cria/reutiliza)
  let resolvedClientId = input.clientId ?? null;
  if (!resolvedClientId && input.clientName?.trim()) {
    const client = await findOrCreateClient(db, input.clientName);
    resolvedClientId = client.id;
  }

  const inserted = await db
    .insert(schema.oneTimeRevenues)
    .values({
      clientId: resolvedClientId,
      date: input.date,
      amount: input.amount,
      product: input.product.trim(),
      channel: input.channel?.trim() || null,
      campaign: input.campaign?.trim() || null,
      isPaid: input.isPaid ?? true,
      notes: input.notes?.trim() || null,
    })
    .returning()
    .get();

  return inserted;
}

// ─── updateRevenue ────────────────────────────────────────────────────────────

export async function updateRevenue(
  db: any,
  revenueId: number,
  input: UpdateRevenueInput
) {
  if (!input.amount || input.amount <= 0) {
    throw new Error("valor deve ser maior que zero");
  }
  if (!input.product?.trim()) {
    throw new Error("produto é obrigatório");
  }

  const existing = await db
    .select()
    .from(schema.oneTimeRevenues)
    .where(eq(schema.oneTimeRevenues.id, revenueId))
    .get();

  if (!existing) throw new Error("receita não encontrada");

  await db
    .update(schema.oneTimeRevenues)
    .set({
      clientId: input.clientId ?? null,
      date: input.date,
      amount: input.amount,
      product: input.product.trim(),
      channel: input.channel?.trim() || null,
      campaign: input.campaign?.trim() || null,
      isPaid: input.isPaid,
      notes: input.notes?.trim() || null,
    })
    .where(eq(schema.oneTimeRevenues.id, revenueId))
    .run();

  return await db
    .select()
    .from(schema.oneTimeRevenues)
    .where(eq(schema.oneTimeRevenues.id, revenueId))
    .get();
}

// ─── deleteRevenue ────────────────────────────────────────────────────────────

export async function deleteRevenue(db: any, revenueId: number) {
  await db
    .delete(schema.oneTimeRevenues)
    .where(eq(schema.oneTimeRevenues.id, revenueId))
    .run();
}

// ─── getRevenues ──────────────────────────────────────────────────────────────

export interface RevenueRow {
  id: number;
  clientId: number | null;
  clientName: string | null;
  date: string;
  amount: number;
  product: string;
  channel: string | null;
  campaign: string | null;
  isPaid: boolean;
  notes: string | null;
}

export async function getRevenues(db: any): Promise<RevenueRow[]> {
  const revenues = await db
    .select()
    .from(schema.oneTimeRevenues)
    .orderBy(desc(schema.oneTimeRevenues.date))
    .all();

  const clients = await db.select().from(schema.clients).all();
  const clientMap = new Map(clients.map((c: any) => [c.id, c.name]));

  return revenues.map((r: any) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: r.clientId ? (clientMap.get(r.clientId) as string) ?? null : null,
    date: r.date,
    amount: r.amount,
    product: r.product,
    channel: r.channel,
    campaign: r.campaign,
    isPaid: !!r.isPaid,
    notes: r.notes,
  }));
}

// ─── getRevenuesSummary ───────────────────────────────────────────────────────

export interface RevenuesSummary {
  totalMesAtual: number;
  totalAno: number;
  totalGeral: number;
  totalPendente: number;
  qtdMesAtual: number;
  qtdTotal: number;
}

export async function getRevenuesSummary(
  db: any,
  today?: string
): Promise<RevenuesSummary> {
  const refStr = today ?? new Date().toISOString().slice(0, 10);
  const currentYearMonth = refStr.slice(0, 7); // YYYY-MM
  const currentYear = refStr.slice(0, 4); // YYYY

  const all = await db.select().from(schema.oneTimeRevenues).all();

  let totalMesAtual = 0;
  let totalAno = 0;
  let totalGeral = 0;
  let totalPendente = 0;
  let qtdMesAtual = 0;

  for (const r of all) {
    const isPaid = !!r.isPaid;
    if (!isPaid) {
      totalPendente += r.amount;
      continue;
    }
    totalGeral += r.amount;
    if (r.date.slice(0, 4) === currentYear) totalAno += r.amount;
    if (r.date.slice(0, 7) === currentYearMonth) {
      totalMesAtual += r.amount;
      qtdMesAtual += 1;
    }
  }

  return {
    totalMesAtual,
    totalAno,
    totalGeral,
    totalPendente,
    qtdMesAtual,
    qtdTotal: all.length,
  };
}

