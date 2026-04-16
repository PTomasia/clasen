import { and, isNotNull, gte, lte, eq, isNull, lt } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import {
  format,
  addDays,
  subMonths,
  parseISO,
  differenceInMonths,
  startOfMonth,
} from "date-fns";
import { calcularCustoPost, calcularMediana } from "../utils/calculations";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DashboardData {
  // KPIs
  clientesAtivos: number;
  postsAtivos: number;
  receitaBruta: number;
  ticketMedio: number;
  ticketMedioPorPost: number;
  // Permanência
  permMediaGeral: number;
  permMediaAtivos: number;
  permMediaInativos: number;
  permMediana: number;
  permMedia3M: number; // média de quem tem >3 meses
  ativosPlus3M: number; // qtd ativos com >3 meses
  // MRR
  mrr: MRRPoint[];
  // Alertas
  atrasados: AtrasadoRow[];
  // Próximos pagamentos
  upcoming: UpcomingRow[];
}

export interface MRRPoint {
  month: string; // YYYY-MM
  label: string; // "Jan/26"
  value: number;
}

export interface AtrasadoRow {
  planId: number;
  clientName: string;
  planType: string;
  planValue: number;
  nextPaymentDate: string;
  diasAtraso: number;
}

export interface UpcomingRow {
  planId: number;
  clientName: string;
  planType: string;
  planValue: number;
  nextPaymentDate: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MONTH_LABELS[Number(m) - 1]}/${y.slice(2)}`;
}

// ─── Query principal ──────────────────────────────────────────────────────────

export async function getDashboardData(): Promise<DashboardData> {
  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();

  // Buscar tudo de uma vez
  const [allPlans, allClients, allPayments] = await Promise.all([
    db.select().from(schema.subscriptionPlans).all(),
    db.select().from(schema.clients).all(),
    db.select().from(schema.planPayments).all(),
  ]);

  const clientMap = new Map(allClients.map((c) => [c.id, c]));

  // ─── Planos ativos ─────────────────────────────────────────────────
  const activePlans = allPlans.filter((p) => p.status === "ativo" && !p.endDate);

  // KPIs
  const clientesAtivosSet = new Set(activePlans.map((p) => p.clientId));
  const clientesAtivos = clientesAtivosSet.size;

  const postsAtivos = activePlans.reduce(
    (sum, p) => sum + p.postsCarrossel + p.postsReels + p.postsEstatico + p.postsTrafego,
    0
  );

  const receitaBruta = activePlans.reduce((sum, p) => sum + p.planValue, 0);
  const ticketMedio = clientesAtivos > 0 ? receitaBruta / clientesAtivos : 0;

  // Ticket médio por post: receita / total posts equivalentes
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

  const ticketMedioPorPost =
    custosPosts.length > 0
      ? custosPosts.reduce((a, b) => a + b, 0) / custosPosts.length
      : 0;

  // ─── Permanência ───────────────────────────────────────────────────
  // Para cada cliente, calcular tenure
  type ClientTenure = { clientId: number; tenure: number; isAtivo: boolean };
  const tenures: ClientTenure[] = [];

  for (const client of allClients) {
    const plans = allPlans.filter((p) => p.clientId === client.id);
    if (plans.length === 0) continue;

    const isAtivo = plans.some((p) => !p.endDate);
    const firstStart = client.clientSince ?? plans.map((p) => p.startDate).sort()[0];
    if (!firstStart) continue;

    let tenure: number;
    if (isAtivo) {
      tenure = differenceInMonths(now, parseISO(firstStart));
    } else {
      const lastEnd = plans
        .filter((p) => p.endDate)
        .map((p) => p.endDate as string)
        .sort()
        .reverse()[0];
      if (!lastEnd) continue;
      tenure = differenceInMonths(parseISO(lastEnd), parseISO(firstStart));
    }

    tenures.push({ clientId: client.id, tenure, isAtivo });
  }

  const allTenures = tenures.map((t) => t.tenure);
  const ativoTenures = tenures.filter((t) => t.isAtivo).map((t) => t.tenure);
  const inativoTenures = tenures.filter((t) => !t.isAtivo).map((t) => t.tenure);

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const permMediaGeral = Math.round(avg(allTenures));
  const permMediaAtivos = Math.round(avg(ativoTenures));
  const permMediaInativos = Math.round(avg(inativoTenures));
  const permMediana = calcularMediana(allTenures) ?? 0;

  // +3M: ativos com >3 meses
  const ativosPlus3M = ativoTenures.filter((t) => t > 3);
  const permMedia3M = Math.round(avg(ativosPlus3M));

  // ─── MRR últimos 12 meses ─────────────────────────────────────────
  const mrr: MRRPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthDate = startOfMonth(subMonths(now, i));
    const yyyymm = format(monthDate, "yyyy-MM");

    // Somar pagamentos do mês com status "pago"
    const monthPayments = allPayments.filter((p) => {
      if (p.status !== "pago") return false;
      return p.paymentDate.startsWith(yyyymm);
    });

    const value = monthPayments.reduce((sum, p) => sum + p.amount, 0);
    mrr.push({ month: yyyymm, label: monthLabel(yyyymm), value });
  }

  // ─── Atrasados ─────────────────────────────────────────────────────
  const atrasados: AtrasadoRow[] = activePlans
    .filter((p) => p.nextPaymentDate && p.nextPaymentDate < today)
    .map((p) => {
      const client = clientMap.get(p.clientId);
      const diasAtraso = Math.floor(
        (Date.now() - parseISO(p.nextPaymentDate!).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        planId: p.id,
        clientName: client?.name ?? "—",
        planType: p.planType,
        planValue: p.planValue,
        nextPaymentDate: p.nextPaymentDate!,
        diasAtraso,
      };
    })
    .sort((a, b) => b.diasAtraso - a.diasAtraso);

  // ─── Próximos 7 dias ──────────────────────────────────────────────
  const limit = format(addDays(now, 7), "yyyy-MM-dd");
  const upcoming: UpcomingRow[] = activePlans
    .filter(
      (p) =>
        p.nextPaymentDate &&
        p.nextPaymentDate >= today &&
        p.nextPaymentDate <= limit
    )
    .map((p) => ({
      planId: p.id,
      clientName: clientMap.get(p.clientId)?.name ?? "—",
      planType: p.planType,
      planValue: p.planValue,
      nextPaymentDate: p.nextPaymentDate!,
    }))
    .sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate));

  return {
    clientesAtivos,
    postsAtivos,
    receitaBruta,
    ticketMedio,
    ticketMedioPorPost,
    permMediaGeral,
    permMediaAtivos,
    permMediaInativos,
    permMediana,
    permMedia3M,
    ativosPlus3M: ativosPlus3M.length,
    mrr,
    atrasados,
    upcoming,
  };
}

// Manter export legado para compatibilidade
export async function getUpcomingPayments(days: number = 7) {
  const today = format(new Date(), "yyyy-MM-dd");
  const limit = format(addDays(new Date(), days), "yyyy-MM-dd");

  const rows = await db
    .select({
      planId: schema.subscriptionPlans.id,
      clientName: schema.clients.name,
      planType: schema.subscriptionPlans.planType,
      planValue: schema.subscriptionPlans.planValue,
      nextPaymentDate: schema.subscriptionPlans.nextPaymentDate,
    })
    .from(schema.subscriptionPlans)
    .innerJoin(
      schema.clients,
      eq(schema.subscriptionPlans.clientId, schema.clients.id)
    )
    .where(
      and(
        eq(schema.subscriptionPlans.status, "ativo"),
        isNotNull(schema.subscriptionPlans.nextPaymentDate),
        gte(schema.subscriptionPlans.nextPaymentDate, today),
        lte(schema.subscriptionPlans.nextPaymentDate, limit)
      )
    );

  rows.sort((a, b) =>
    (a.nextPaymentDate ?? "").localeCompare(b.nextPaymentDate ?? "")
  );

  return rows;
}
