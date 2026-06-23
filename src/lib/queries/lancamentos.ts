// ─── Lançamentos recentes ──────────────────────────────────────────────────────
// Lista cronológica combinada dos últimos pagamentos de plano + receitas avulsas
// registrados (todos os clientes). Serve pra conferir, durante a conciliação, se
// algum cliente "atrasado" na verdade já teve um lançamento registrado.

import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

export interface LancamentoRow {
  kind: "plano" | "avulso";
  id: number;
  date: string; // YYYY-MM-DD
  clientName: string | null;
  amount: number;
  /** planType (plano) ou product (avulso) */
  label: string;
  pago: boolean;
}

export async function getRecentLancamentos(
  db: any,
  limit = 50
): Promise<LancamentoRow[]> {
  // Pagamentos de plano (exclui meses congelados — skipped). Join pra nome + tipo.
  const pagamentos = (await db
    .select({
      id: schema.planPayments.id,
      date: schema.planPayments.paymentDate,
      amount: schema.planPayments.amount,
      status: schema.planPayments.status,
      clientName: schema.clients.name,
      planType: schema.subscriptionPlans.planType,
    })
    .from(schema.planPayments)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.planPayments.planId, schema.subscriptionPlans.id)
    )
    .innerJoin(schema.clients, eq(schema.planPayments.clientId, schema.clients.id))
    .where(eq(schema.planPayments.skipped, false))
    .all()) as Array<{
    id: number;
    date: string;
    amount: number;
    status: string;
    clientName: string;
    planType: string;
  }>;

  // Receitas avulsas (clientId pode ser null → leftJoin).
  const receitas = (await db
    .select({
      id: schema.oneTimeRevenues.id,
      date: schema.oneTimeRevenues.date,
      amount: schema.oneTimeRevenues.amount,
      isPaid: schema.oneTimeRevenues.isPaid,
      product: schema.oneTimeRevenues.product,
      clientName: schema.clients.name,
    })
    .from(schema.oneTimeRevenues)
    .leftJoin(schema.clients, eq(schema.oneTimeRevenues.clientId, schema.clients.id))
    .all()) as Array<{
    id: number;
    date: string;
    amount: number;
    isPaid: boolean | number;
    product: string;
    clientName: string | null;
  }>;

  const combined: LancamentoRow[] = [
    ...pagamentos.map((p) => ({
      kind: "plano" as const,
      id: p.id,
      date: p.date,
      clientName: p.clientName,
      amount: p.amount,
      label: p.planType,
      pago: p.status === "pago",
    })),
    ...receitas.map((r) => ({
      kind: "avulso" as const,
      id: r.id,
      date: r.date,
      clientName: r.clientName,
      amount: r.amount,
      label: r.product,
      pago: !!r.isPaid,
    })),
  ];

  // Mais recentes primeiro. Datas ISO comparam lexicograficamente.
  combined.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return combined.slice(0, limit);
}
