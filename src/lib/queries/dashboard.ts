import { and, isNotNull, gte, lte, eq, isNull, lt } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { FINANCIAL_DATA_START, TETO_OPERACIONAL_UO } from "../constants";
import {
  format,
  addDays,
  subMonths,
  parseISO,
  differenceInCalendarDays,
  startOfMonth,
} from "date-fns";
import {
  calcularCustoPost,
  calcularMediana,
  calcularPermanenciaCliente,
  calcularTotalPostsEquivalentes,
  calcularUnidadesOperacionais,
  isPlanoAtivo,
} from "../utils/calculations";
import {
  calculateGapsForPlan,
  classifyDueDatesForPlan,
  type PlanForGaps,
} from "../services/plans";
import { getSetting } from "../services/settings";

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
  // Resumo mensal gerencial (tabela sob o gráfico de evolução operacional)
  resumoMensal: ResumoMensalPoint[];
  // Alertas
  atrasados: AtrasadoRow[];
  // Próximos pagamentos
  upcoming: UpcomingRow[];
}

export interface ResumoMensalPoint {
  month: string; // YYYY-MM
  label: string; // "Jan/26"
  contratado: number; // MRR (planos ativos no mês)
  realizado: number; // pagamentos de PLANO pago+pendente com paymentDate no mês
  avulsas: number; // receitas avulsas PAGAS com date no mês (realizado total = realizado + avulsas)
  pagamentos: number; // nº de pagamentos reais (exclui skipped)
  /** Cobrança por COMPETÊNCIA: desfecho dos vencimentos do mês (null = sem vencimentos) */
  cobranca: CobrancaMes | null;
}

export interface CobrancaMes {
  vencimentos: number; // vencimentos do mês já vencidos (mês corrente: só até hoje)
  pagos: number;
  congelados: number;
  abertos: number; // = gaps (mesma engine do painel de atrasados)
}

export interface RevenueForResumo {
  date: string; // YYYY-MM-DD
  amount: number;
  isPaid: boolean;
}

export interface MRRPoint {
  month: string; // YYYY-MM
  label: string; // "Jan/26"
  value: number;
}

export interface PlanForMrr {
  id: number;
  clientId: number;
  planValue: number;
  startDate: string;
  endDate: string | null;
}

export interface PaymentForMrr {
  planId: number;
  paymentDate: string;
  amount: number;
  status: string;
  skipped: boolean;
}

export interface AtrasadoRow {
  planId: number;
  clientName: string;
  planType: string;
  planValue: number;
  nextPaymentDate: string;
  diasAtraso: number;
  billingCycleDays: number | null;
  gapsCount: number; // quantos meses anteriores em aberto
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

// ─── Atraso de pagamento ────────────────────────────────────────────────────
// gaps (datas de vencimento vencidas sem pagamento) é a fonte da verdade: meses
// congelados (skipped) e pagos já são excluídos do cálculo de gaps. Logo, sem
// gaps o cliente está em dia — mesmo que nextPaymentDate tenha ficado no passado
// por não ter sido avançado após congelar (caso Dara/Maju). O fallback por
// nextPaymentDate vencido só vale quando não dá pra computar gaps (plano sem dia
// de vencimento definido).
export function isPlanAtrasado(
  plan: { billingCycleDays: number | null; nextPaymentDate: string | null },
  gaps: ReadonlyArray<string>,
  today: string
): boolean {
  if (gaps.length > 0) return true;
  if (!plan.billingCycleDays) {
    return !!plan.nextPaymentDate && plan.nextPaymentDate < today;
  }
  return false;
}

// ─── Query principal ──────────────────────────────────────────────────────────

export async function getDashboardData(): Promise<DashboardData> {
  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();

  // Buscar tudo de uma vez
  const [allPlans, allClients, allPayments, allRevenues, earliestTrackedRaw] = await Promise.all([
    db.select().from(schema.subscriptionPlans).all(),
    db.select().from(schema.clients).all(),
    db.select().from(schema.planPayments).all(),
    db.select().from(schema.oneTimeRevenues).all(),
    getSetting(db, "earliest_tracked_month"),
  ]);

  const clientMap = new Map(allClients.map((c) => [c.id, c]));
  const minDate = earliestTrackedRaw ? `${earliestTrackedRaw}-01` : undefined;

  // Agrupa pagamentos por planId — usado em cálculo de gaps abaixo.
  const paymentsByPlan = new Map<number, Array<{ paymentDate: string; skipped: boolean }>>();
  for (const p of allPayments) {
    const arr = paymentsByPlan.get(p.planId);
    const entry = { paymentDate: p.paymentDate, skipped: p.skipped };
    if (arr) arr.push(entry);
    else paymentsByPlan.set(p.planId, [entry]);
  }

  // ─── Planos ativos ─────────────────────────────────────────────────
  const activePlans = allPlans.filter(isPlanoAtivo);

  // KPIs
  const clientesAtivosSet = new Set(activePlans.map((p) => p.clientId));
  const clientesAtivos = clientesAtivosSet.size;

  // Posts de CONTEÚDO (sem tráfego) — mesma definição do hero de /planos e da
  // carga operacional. Tráfego não é post produzido; tem breakdown próprio em /planos.
  const postsAtivos = activePlans.reduce(
    (sum, p) => sum + p.postsCarrossel + p.postsReels + p.postsEstatico,
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

    const tenure = calcularPermanenciaCliente(client, plans, now);
    if (tenure === null) continue;

    const isAtivo = plans.some(isPlanoAtivo);
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
  // Contratado em todos os meses (planos ativos no mês) — não depende de
  // pagamentos/conciliação. Vide aggregateMrr.
  const mrr = aggregateMrr({
    plans: allPlans,
    today: now,
    cutoff: FINANCIAL_DATA_START,
  });

  const cobrancaPorMes = aggregateCobrancaMensal({
    plans: allPlans,
    paymentsByPlan,
    today,
    minDate,
    cutoff: FINANCIAL_DATA_START,
  });

  const resumoMensal = aggregateResumoMensal({
    plans: allPlans,
    payments: allPayments,
    revenues: allRevenues as unknown as RevenueForResumo[],
    cobrancaPorMes,
    today: now,
    cutoff: FINANCIAL_DATA_START,
  });

  // ─── Atrasados ─────────────────────────────────────────────────────
  // Atraso = ter gap (mês vencido sem pagamento E sem congelamento). Ver
  // isPlanAtrasado: meses congelados/pagos saem dos gaps, então sem gaps o
  // cliente está em dia. Cobre tanto o bug Gabriele (gap anterior em aberto
  // continua atrasado) quanto Dara/Maju (mês congelado → em dia).
  const atrasados: AtrasadoRow[] = activePlans
    .map((p) => {
      const planPayments = paymentsByPlan.get(p.id) ?? [];
      const gaps = calculateGapsForPlan(p, planPayments, today, minDate);
      return { plan: p, gaps };
    })
    .filter(({ plan, gaps }) => isPlanAtrasado(plan, gaps, today))
    .map(({ plan, gaps }) => {
      const client = clientMap.get(plan.clientId);
      // Se há gaps, o "atraso" começa no primeiro gap; senão no nextPaymentDate.
      const referenceDate = gaps[0] ?? plan.nextPaymentDate!;
      const diasAtraso = differenceInCalendarDays(now, parseISO(referenceDate));
      return {
        planId: plan.id,
        clientName: client?.name ?? "—",
        planType: plan.planType,
        planValue: plan.planValue,
        nextPaymentDate: plan.nextPaymentDate ?? referenceDate,
        diasAtraso,
        billingCycleDays: plan.billingCycleDays ?? null,
        gapsCount: gaps.length,
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
    resumoMensal,
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

// ─── Evolução operacional — clientes / posts / ticket-por-post ────────────────

export interface PlanForOperational {
  id: number;
  clientId: number;
  planValue: number;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
  pesoCarrossel: number;
  pesoReels: number;
  startDate: string;
  endDate: string | null;
}

export interface OperationalMonth {
  month: string; // YYYY-MM
  label: string; // "abr/26"
  clientesAtivos: number;
  /** Carga ponderada em UO (carrossel/reels com peso, estático 0.5, sem tráfego) */
  postsTotal: number;
  /** Quantidade bruta de posts de conteúdo (carrossel + reels + estático, sem tráfego) */
  postsConteudo: number;
  ticketPorPost: number | null;
}

export interface PostsPorClienteResult {
  clientes: number;
  posts: number; // = carga operacional total (soma de UO dos planos ativos)
  ratio: number | null;
  teto: number; // teto de capacidade em UO
  utilizacao: number; // carga ÷ teto em % (pode passar de 100)
}

const MONTH_LABELS_LOWER = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function monthLabelLower(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MONTH_LABELS_LOWER[Number(m) - 1]}/${y.slice(2)}`;
}

// Posts ponderados da EVOLUÇÃO operacional (gráfico "Posts/mês", 12 meses).
// SOCIAL MEDIA apenas: estático conta 0,5; tráfego fica FORA (setor à parte,
// igual à carga UO e ao hero de /planos — decisão do Pedro em jul/2026).
// SEM redutor (os pesos são do estado atual do plano e não se aplicam
// retroativamente a meses passados).
function postsPonderados(p: Pick<PlanForOperational,
  "postsCarrossel" | "postsReels" | "postsEstatico">
): number {
  return calcularTotalPostsEquivalentes({
    carrossel: p.postsCarrossel,
    reels: p.postsReels,
    estatico: p.postsEstatico,
  });
}

// Carga operacional (UO) do plano: social media com redutor, SEM tráfego (setor à
// parte). Usado no medidor de carga vs teto (instante presente).
function unidadesOperacionaisPlano(p: Pick<PlanForOperational,
  "postsCarrossel" | "postsReels" | "postsEstatico" | "pesoCarrossel" | "pesoReels">
): number {
  return calcularUnidadesOperacionais(
    { carrossel: p.postsCarrossel, reels: p.postsReels, estatico: p.postsEstatico },
    { pesoCarrossel: p.pesoCarrossel, pesoReels: p.pesoReels }
  );
}

// ─── Aggregator: MRR contratado 12 meses ──────────────────────────────────────
// TODOS os meses (passados e corrente): soma planValue dos planos ativos em
// algum dia do mês (contratado). Não usa pagamentos — MRR mede contrato
// recorrente, não caixa: conciliação atrasada ou inadimplência não alteram a
// série (o realizado vive no P&L / DRE). Decisão do Pedro em jul/2026, após o
// degrau de jun/26 (mês fechava e a série caía do contratado pro realizado).
// Meses 100% antes do cutoff (FINANCIAL_DATA_START): zerados.

export function aggregateMrr(input: {
  plans: PlanForMrr[];
  today: Date;
  cutoff: string;
  monthsBack?: number;
}): MRRPoint[] {
  const { plans, today, cutoff, monthsBack = 12 } = input;
  const result: MRRPoint[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthStart = startOfMonth(subMonths(today, i));
    const yyyymm = format(monthStart, "yyyy-MM");
    const firstDay = format(monthStart, "yyyy-MM-dd");
    const lastDayDate = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0
    );
    const lastDay = format(lastDayDate, "yyyy-MM-dd");

    let value = 0;

    if (lastDay >= cutoff) {
      const active = plans.filter(
        (p) =>
          p.startDate <= lastDay &&
          (p.endDate === null || p.endDate >= firstDay)
      );
      // Reajuste no mês: changePlan encerra o plano antigo (endDate) e cria um
      // novo com startDate == esse endDate. Ambos ficam "ativos no mês"; conta só
      // o que vigia no início do mês (o valor que ERA), não o sucessor.
      const successorKeys = new Set(
        active.filter((p) => p.endDate).map((p) => `${p.clientId}|${p.endDate}`)
      );
      value = active
        .filter((p) => !successorKeys.has(`${p.clientId}|${p.startDate}`))
        .reduce((sum, p) => sum + p.planValue, 0);
    }

    result.push({ month: yyyymm, label: monthLabel(yyyymm), value });
  }

  return result;
}

// ─── Aggregator: resumo mensal gerencial ──────────────────────────────────────
// Uma linha por mês desde o cutoff: contratado (reusa aggregateMrr), realizado
// (pagamentos pago+pendente com paymentDate no mês — mesma regra do fiscal) e
// nº de pagamentos reais (exclui skipped). Clientes/posts por mês vêm de
// aggregateOperationalEvolution e são combinados na UI pela chave month.

// ─── Aggregator: cobrança por competência ─────────────────────────────────────
// Para cada mês, o desfecho dos VENCIMENTOS daquele mês (não do caixa): pagos,
// congelados e em aberto. Usa classifyDueDatesForPlan — a mesma engine que gera
// os gaps do painel de atrasados, então os números nunca divergem entre telas.

export function aggregateCobrancaMensal(input: {
  plans: Array<PlanForGaps & { id: number }>;
  paymentsByPlan: Map<number, Array<{ paymentDate: string; skipped: boolean }>>;
  today: string; // YYYY-MM-DD
  minDate?: string;
  cutoff: string;
}): Map<string, CobrancaMes> {
  const { plans, paymentsByPlan, today, minDate, cutoff } = input;
  const cutoffMonth = cutoff.slice(0, 7);
  const out = new Map<string, CobrancaMes>();

  for (const plan of plans) {
    const classified = classifyDueDatesForPlan(
      plan,
      paymentsByPlan.get(plan.id) ?? [],
      today,
      minDate
    );
    for (const d of classified) {
      const m = d.dueDate.slice(0, 7);
      if (m < cutoffMonth) continue;
      let c = out.get(m);
      if (!c) {
        c = { vencimentos: 0, pagos: 0, congelados: 0, abertos: 0 };
        out.set(m, c);
      }
      c.vencimentos++;
      if (d.status === "pago") c.pagos++;
      else if (d.status === "congelado") c.congelados++;
      else c.abertos++;
    }
  }
  return out;
}

export function aggregateResumoMensal(input: {
  plans: PlanForMrr[];
  payments: PaymentForMrr[];
  /** Receitas avulsas — só as pagas entram no campo `avulsas` */
  revenues?: RevenueForResumo[];
  /** Cobrança por competência (aggregateCobrancaMensal) — anexada por mês */
  cobrancaPorMes?: Map<string, CobrancaMes>;
  today: Date;
  cutoff: string;
  monthsBack?: number;
}): ResumoMensalPoint[] {
  const { plans, payments, revenues = [], cobrancaPorMes, today, cutoff, monthsBack = 12 } = input;
  const contratado = aggregateMrr({ plans, today, cutoff, monthsBack });
  const cutoffMonth = cutoff.slice(0, 7);

  return contratado
    .filter((p) => p.month >= cutoffMonth)
    .map((p) => {
      const doMes = payments.filter(
        (pay) =>
          pay.paymentDate >= cutoff &&
          pay.paymentDate.startsWith(p.month) &&
          !pay.skipped &&
          (pay.status === "pago" || pay.status === "pendente")
      );
      const avulsas = revenues
        .filter((r) => r.isPaid && r.date >= cutoff && r.date.startsWith(p.month))
        .reduce((sum, r) => sum + r.amount, 0);
      return {
        month: p.month,
        label: p.label,
        contratado: p.value,
        realizado: doMes.reduce((sum, pay) => sum + pay.amount, 0),
        avulsas,
        pagamentos: doMes.length,
        cobranca: cobrancaPorMes?.get(p.month) ?? null,
      };
    });
}

// ─── Aggregator: posts por cliente (instante presente) ────────────────────────
// Considera apenas planos ativos (endDate=null). Cliente com 2 planos = 1.

export function aggregatePostsPorCliente(
  plans: PlanForOperational[]
): PostsPorClienteResult {
  const ativos = plans.filter(isPlanoAtivo);
  const clientesSet = new Set(ativos.map((p) => p.clientId));
  const clientes = clientesSet.size;
  // Carga operacional em UO (social media, sem tráfego). Arredonda em 2 casas
  // para evitar resíduo de ponto flutuante ao somar os pesos.
  const posts =
    Math.round(ativos.reduce((sum, p) => sum + unidadesOperacionaisPlano(p), 0) * 100) / 100;
  const ratio = clientes > 0 ? Math.round((posts / clientes) * 10) / 10 : null;
  const utilizacao = Math.round((posts / TETO_OPERACIONAL_UO) * 100);
  return { clientes, posts, ratio, teto: TETO_OPERACIONAL_UO, utilizacao };
}

// ─── Aggregator: evolução operacional 12 meses ────────────────────────────────
// Plano "ativo no mês" se: startDate ≤ último dia do mês AND
//                          (endDate IS NULL OR endDate ≥ primeiro dia do mês).

export function aggregateOperationalEvolution(input: {
  plans: PlanForOperational[];
  today: Date;
  monthsBack?: number;
}): OperationalMonth[] {
  const { plans, today, monthsBack = 12 } = input;
  const result: OperationalMonth[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthStart = startOfMonth(subMonths(today, i));
    const yyyymm = format(monthStart, "yyyy-MM");
    const firstDay = format(monthStart, "yyyy-MM-dd");
    // Último dia do mês
    const lastDayDate = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0
    );
    const lastDay = format(lastDayDate, "yyyy-MM-dd");

    const activeInMonth = plans.filter(
      (p) =>
        p.startDate <= lastDay &&
        (p.endDate === null || p.endDate >= firstDay)
    );

    const clientesSet = new Set(activeInMonth.map((p) => p.clientId));
    const clientesAtivos = clientesSet.size;

    const postsTotal = activeInMonth.reduce(
      (sum, p) => sum + postsPonderados(p),
      0
    );

    const postsConteudo = activeInMonth.reduce(
      (sum, p) => sum + p.postsCarrossel + p.postsReels + p.postsEstatico,
      0
    );

    // Ticket/post SOCIAL: receita apenas dos planos que produzem conteúdo.
    // Plano puro-tráfego (0 posts sociais) fora do numerador — senão a receita
    // de tráfego dividida por posts de social inflaria o ticket artificialmente.
    const mrrSocial = activeInMonth
      .filter((p) => p.postsCarrossel + p.postsReels + p.postsEstatico > 0)
      .reduce((sum, p) => sum + p.planValue, 0);
    const ticketPorPost =
      postsTotal > 0 ? Math.round((mrrSocial / postsTotal) * 100) / 100 : null;

    result.push({
      month: yyyymm,
      label: monthLabelLower(yyyymm),
      clientesAtivos,
      postsTotal,
      postsConteudo,
      ticketPorPost,
    });
  }

  return result;
}

// ─── Caller que busca dados e chama os agregadores ────────────────────────────

export async function getOperationalDashboard(): Promise<{
  postsPorCliente: PostsPorClienteResult;
  evolution: OperationalMonth[];
}> {
  const allPlans = await db.select().from(schema.subscriptionPlans).all();
  const plansForOp: PlanForOperational[] = allPlans.map((p) => ({
    id: p.id,
    clientId: p.clientId,
    planValue: p.planValue,
    postsCarrossel: p.postsCarrossel,
    postsReels: p.postsReels,
    postsEstatico: p.postsEstatico,
    postsTrafego: p.postsTrafego,
    pesoCarrossel: p.pesoCarrossel,
    pesoReels: p.pesoReels,
    startDate: p.startDate,
    endDate: p.endDate,
  }));

  return {
    postsPorCliente: aggregatePostsPorCliente(plansForOp),
    evolution: aggregateOperationalEvolution({
      plans: plansForOp,
      today: new Date(),
    }),
  };
}
