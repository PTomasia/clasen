import { eq, isNull, and } from "drizzle-orm";
import { differenceInMonths, parseISO } from "date-fns";
import * as schema from "../db/schema";
import { calcularCustoPost } from "../utils/calculations";

// ─── Helpers internos ──────────────────────────────────────────────────────────

type ClientRecord = typeof schema.clients.$inferSelect;
type PlanRecord = typeof schema.subscriptionPlans.$inferSelect;

/**
 * Calcula permanência (em meses) do cliente considerando todos seus planos.
 *
 * - `firstStart` = `client.clientSince` (override) ou startDate do primeiro plano.
 * - Se cliente está ativo (tem plano sem endDate): conta até `referenceDate`.
 * - Se inativo: conta até o endDate mais recente entre seus planos.
 * - Retorna 0 se não houver data inicial detectável.
 */
function calculatePermanencia(
  client: ClientRecord,
  plans: PlanRecord[],
  referenceDate: Date
): number {
  const isAtivo = plans.some((p) => !p.endDate);

  const firstStart =
    client.clientSince ?? plans.map((p) => p.startDate).sort()[0];

  if (!firstStart) return 0;

  if (isAtivo) {
    return differenceInMonths(referenceDate, parseISO(firstStart));
  }

  const lastEnd = plans
    .filter((p) => p.endDate)
    .map((p) => p.endDate as string)
    .sort()
    .reverse()[0];

  if (!lastEnd) return 0;
  return differenceInMonths(parseISO(lastEnd), parseISO(firstStart));
}

// ─── getClientStatus ───────────────────────────────────────────────────────────

export async function getClientStatus(
  db: any,
  clientId: number
): Promise<"ativo" | "inativo"> {
  const activePlan = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(
      and(
        eq(schema.subscriptionPlans.clientId, clientId),
        isNull(schema.subscriptionPlans.endDate)
      )
    )
    .get();

  return activePlan ? "ativo" : "inativo";
}

// ─── getClientsList ────────────────────────────────────────────────────────────

export interface ClientRow {
  id: number;
  name: string;
  contactOrigin: string | null;
  clientSince: string | null;
  birthday: string | null;
  whatsapp: string | null;
  // ICP / Demográficos
  city: string | null;
  state: string | null;
  niche: string | null;
  yearsInPractice: number | null;
  consultaTicket: number | null;
  hasPhysicalOffice: boolean | null;
  birthYear: number | null;
  targetAudience: string | null;
  notes: string | null;
  status: "ativo" | "inativo";
  permanencia: number;
  planosAtivos: number;
  valorMensal: number;
  custoPostMedio: number | null;
}

export async function getClientsList(
  db: any,
  today?: string
): Promise<ClientRow[]> {
  const referenceDate = today ? parseISO(today) : new Date();

  const clients: ClientRecord[] = await db.select().from(schema.clients).all();
  const allPlans: PlanRecord[] = await db.select().from(schema.subscriptionPlans).all();

  return clients.map((client) => {
    const plans = allPlans.filter((p) => p.clientId === client.id);
    const activePlans = plans.filter((p) => !p.endDate);
    const status: "ativo" | "inativo" = activePlans.length > 0 ? "ativo" : "inativo";

    const permanencia = calculatePermanencia(client, plans, referenceDate);

    // Valor mensal: soma dos planos ativos
    const valorMensal = activePlans.reduce((sum, p) => sum + p.planValue, 0);

    // $/post médio dos planos ativos
    const custosPosts = activePlans
      .map((p) =>
        calcularCustoPost({
          valor: p.planValue,
          carrossel: p.postsCarrossel,
          reels: p.postsReels,
          estatico: p.postsEstatico,
          trafego: p.postsTrafego,
        })
      )
      .filter((c): c is number => c !== null);

    const custoPostMedio =
      custosPosts.length > 0
        ? custosPosts.reduce((a, b) => a + b, 0) / custosPosts.length
        : null;

    return {
      id: client.id,
      name: client.name,
      contactOrigin: client.contactOrigin,
      clientSince: client.clientSince,
      birthday: client.birthday,
      whatsapp: client.whatsapp,
      city: client.city,
      state: client.state,
      niche: client.niche,
      yearsInPractice: client.yearsInPractice,
      consultaTicket: client.consultaTicket,
      hasPhysicalOffice: client.hasPhysicalOffice,
      birthYear: client.birthYear,
      targetAudience: client.targetAudience,
      notes: client.notes,
      status,
      permanencia,
      planosAtivos: activePlans.length,
      valorMensal,
      custoPostMedio,
    };
  });
}

// ─── getClientDetail ──────────────────────────────────────────────────────────

export async function getClientDetail(
  db: any,
  clientId: number,
  today?: string
) {
  const referenceDate = today ? parseISO(today) : new Date();

  const client: ClientRecord | undefined = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .get();

  if (!client) return null;

  const plans: PlanRecord[] = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.clientId, clientId))
    .all();

  const activePlans = plans.filter((p) => !p.endDate);
  const status: "ativo" | "inativo" = activePlans.length > 0 ? "ativo" : "inativo";

  const permanencia = calculatePermanencia(client, plans, referenceDate);

  // Ordenar planos por start_date desc
  const sortedPlans = [...plans].sort((a, b) =>
    b.startDate.localeCompare(a.startDate)
  );

  // LTV — soma de plan_payments (pagos) + one_time_revenues (pagos)
  const payments = await db
    .select()
    .from(schema.planPayments)
    .where(eq(schema.planPayments.clientId, clientId))
    .all();
  const revenues = await db
    .select()
    .from(schema.oneTimeRevenues)
    .where(eq(schema.oneTimeRevenues.clientId, clientId))
    .all();

  const ltvRecorrente = payments
    .filter((p: any) => p.status === "pago")
    .reduce((s: number, p: any) => s + p.amount, 0);
  const ltvAvulsas = revenues
    .filter((r: any) => !!r.isPaid)
    .reduce((s: number, r: any) => s + r.amount, 0);

  return {
    ...client,
    status,
    permanencia,
    plans: sortedPlans,
    ltvRecorrente,
    ltvAvulsas,
    ltv: ltvRecorrente + ltvAvulsas,
    avulsas: revenues.map((r: any) => ({
      id: r.id,
      date: r.date,
      amount: r.amount,
      product: r.product,
      isPaid: !!r.isPaid,
    })),
  };
}
