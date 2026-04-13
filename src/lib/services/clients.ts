import { eq, isNull, and, desc } from "drizzle-orm";
import { differenceInMonths, parseISO } from "date-fns";
import * as schema from "../db/schema";
import { calcularCustoPost } from "../utils/calculations";

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

  const clients = await db.select().from(schema.clients).all();
  const allPlans = await db.select().from(schema.subscriptionPlans).all();

  return clients.map((client: typeof schema.clients.$inferSelect) => {
    const plans = allPlans.filter(
      (p: typeof schema.subscriptionPlans.$inferSelect) => p.clientId === client.id
    );
    const activePlans = plans.filter((p: any) => !p.endDate);
    const status: "ativo" | "inativo" = activePlans.length > 0 ? "ativo" : "inativo";

    // Permanência: desde o primeiro plano
    const firstStart = plans
      .map((p: any) => p.startDate as string)
      .sort()
      [0];

    let permanencia = 0;
    if (firstStart) {
      if (status === "ativo") {
        permanencia = differenceInMonths(referenceDate, parseISO(firstStart));
      } else {
        // Inativo: até o end_date mais recente
        const lastEnd = plans
          .filter((p: any) => p.endDate)
          .map((p: any) => p.endDate as string)
          .sort()
          .reverse()
          [0];
        if (lastEnd) {
          permanencia = differenceInMonths(parseISO(lastEnd), parseISO(firstStart));
        }
      }
    }

    // Valor mensal: soma dos planos ativos
    const valorMensal = activePlans.reduce((sum: number, p: any) => sum + p.planValue, 0);

    // $/post médio dos planos ativos
    const custosPosts = activePlans
      .map((p: any) =>
        calcularCustoPost({
          valor: p.planValue,
          carrossel: p.postsCarrossel,
          reels: p.postsReels,
          estatico: p.postsEstatico,
          trafego: p.postsTrafego,
        })
      )
      .filter((c: number | null): c is number => c !== null);

    const custoPostMedio =
      custosPosts.length > 0
        ? custosPosts.reduce((a: number, b: number) => a + b, 0) / custosPosts.length
        : null;

    return {
      id: client.id,
      name: client.name,
      contactOrigin: client.contactOrigin,
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

  const client = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.id, clientId))
    .get();

  if (!client) return null;

  const plans = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(eq(schema.subscriptionPlans.clientId, clientId))
    .all();

  const activePlans = plans.filter((p: any) => !p.endDate);
  const status: "ativo" | "inativo" = activePlans.length > 0 ? "ativo" : "inativo";

  const firstStart = plans
    .map((p: any) => p.startDate as string)
    .sort()
    [0];

  let permanencia = 0;
  if (firstStart) {
    if (status === "ativo") {
      permanencia = differenceInMonths(referenceDate, parseISO(firstStart));
    } else {
      const lastEnd = plans
        .filter((p: any) => p.endDate)
        .map((p: any) => p.endDate as string)
        .sort()
        .reverse()
        [0];
      if (lastEnd) {
        permanencia = differenceInMonths(parseISO(lastEnd), parseISO(firstStart));
      }
    }
  }

  // Ordenar planos por start_date desc
  const sortedPlans = [...plans].sort((a: any, b: any) =>
    b.startDate.localeCompare(a.startDate)
  );

  return {
    ...client,
    status,
    permanencia,
    plans: sortedPlans,
  };
}
