import { db } from "../db";
import * as schema from "../db/schema";
import { TETO_OPERACIONAL_UO, type AgendaStatus, type ScoreBandKey } from "../constants";
import { calcularUnidadesOperacionais } from "../utils/calculations";
import {
  calcScoreOperacional,
  interpretarScore,
  derivarStatusAgenda,
} from "../utils/operational-metrics";
import {
  getOperationalChecks,
  type OperationalCheckRow,
} from "../services/operational";

// ─── Helpers de mês ─────────────────────────────────────────────────────────────

const MONTH_LABELS_LOWER = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function monthLabelLower(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MONTH_LABELS_LOWER[Number(m) - 1]}/${y.slice(2)}`;
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 0); // dia 0 do mês seguinte = último dia deste mês
  const dd = String(d.getDate()).padStart(2, "0");
  return `${month}-${dd}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function periodRank(p: OperationalCheckRow["period"]): number {
  return p === "fim_mes" ? 1 : 0;
}

// ─── Carga planejada/contratada ──────────────────────────────────────────────────
// MVP: representa a carga PLANEJADA (composição contratada dos planos ativos no
// mês), não a produção realizada. Usada para pré-preencher o check (editável).

export interface PlanForCarga {
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
  pesoCarrossel: number;
  pesoReels: number;
  startDate: string;
  endDate: string | null;
}

export interface CargaPlanejada {
  postsTotais: number;
  unidadesOperacionais: number;
  carrosseis: number;
  reels: number;
  estaticos: number;
  criativosTrafego: number;
  avulsos: number;
}

// Plano "ativo no mês": startDate ≤ último dia do mês E (endDate null OU ≥ 1º dia).
// Mesma regra de aggregateOperationalEvolution (queries/dashboard.ts).
export function aggregateCargaPlanejada(input: {
  plans: PlanForCarga[];
  avulsosCount: number;
  month: string; // YYYY-MM
}): CargaPlanejada {
  const { plans, avulsosCount, month } = input;
  const firstDay = `${month}-01`;
  const lastDay = lastDayOfMonth(month);

  const active = plans.filter(
    (p) => p.startDate <= lastDay && (p.endDate === null || p.endDate >= firstDay)
  );

  let carrosseis = 0;
  let reels = 0;
  let estaticos = 0;
  let criativosTrafego = 0;
  let uo = 0;

  for (const p of active) {
    carrosseis += p.postsCarrossel;
    reels += p.postsReels;
    estaticos += p.postsEstatico;
    criativosTrafego += p.postsTrafego;
    uo += calcularUnidadesOperacionais(
      { carrossel: p.postsCarrossel, reels: p.postsReels, estatico: p.postsEstatico },
      { pesoCarrossel: p.pesoCarrossel, pesoReels: p.pesoReels }
    );
  }

  return {
    postsTotais: carrosseis + reels + estaticos + criativosTrafego,
    unidadesOperacionais: round2(uo),
    carrosseis,
    reels,
    estaticos,
    criativosTrafego,
    avulsos: avulsosCount,
  };
}

export async function getCargaPlanejada(database: any, month: string): Promise<CargaPlanejada> {
  const [allPlans, revenues] = await Promise.all([
    database.select().from(schema.subscriptionPlans).all(),
    database.select().from(schema.oneTimeRevenues).all(),
  ]);

  const firstDay = `${month}-01`;
  const lastDay = lastDayOfMonth(month);
  const avulsosCount = revenues.filter(
    (r: any) => r.date >= firstDay && r.date <= lastDay
  ).length;

  const plans: PlanForCarga[] = allPlans.map((p: any) => ({
    postsCarrossel: p.postsCarrossel,
    postsReels: p.postsReels,
    postsEstatico: p.postsEstatico,
    postsTrafego: p.postsTrafego,
    pesoCarrossel: p.pesoCarrossel,
    pesoReels: p.pesoReels,
    startDate: p.startDate,
    endDate: p.endDate,
  }));

  return aggregateCargaPlanejada({ plans, avulsosCount, month });
}

// ─── Seleção do check mais recente ───────────────────────────────────────────────
// Mês mais recente; dentro do mesmo mês, fim_mes prevalece sobre meio_mes.

export function pickLatestCheck(checks: OperationalCheckRow[]): OperationalCheckRow | null {
  if (checks.length === 0) return null;
  return [...checks].sort((a, b) => {
    if (a.referenceMonth !== b.referenceMonth) {
      return b.referenceMonth.localeCompare(a.referenceMonth);
    }
    return periodRank(b.period) - periodRank(a.period);
  })[0];
}

// ─── Séries de evolução ───────────────────────────────────────────────────────────
// Um ponto por mês (fim_mes preferido), ordenado do mais antigo ao mais recente.

export interface OperationalEvolutionPoint {
  month: string;
  label: string; // "jun/26"
  score: number;
  entregasGabi: number | null;
  unidadesOperacionais: number | null;
  capacidade: number;
}

function scoreOf(c: OperationalCheckRow): number {
  return calcScoreOperacional({
    execucaoDireta: c.notaExecucaoDireta,
    revisao: c.notaRevisao,
    direcaoCriativa: c.notaDirecaoCriativa,
    energia: c.notaEnergia,
    capacidade: c.notaCapacidade,
  });
}

export function buildEvolutionSeries(checks: OperationalCheckRow[]): OperationalEvolutionPoint[] {
  const byMonth = new Map<string, OperationalCheckRow>();
  for (const c of checks) {
    const existing = byMonth.get(c.referenceMonth);
    if (!existing || periodRank(c.period) > periodRank(existing.period)) {
      byMonth.set(c.referenceMonth, c);
    }
  }

  return [...byMonth.values()]
    .sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth))
    .map((c) => ({
      month: c.referenceMonth,
      label: monthLabelLower(c.referenceMonth),
      score: scoreOf(c),
      entregasGabi: c.entregasExecutadasGabi,
      unidadesOperacionais: c.unidadesOperacionais,
      capacidade: c.notaCapacidade,
    }));
}

// ─── Métricas derivadas do último check ──────────────────────────────────────────

export interface OperationalMetrics {
  score: number;
  scoreKey: ScoreBandKey;
  scoreLabel: string;
  statusAgenda: AgendaStatus;
  gargaloPrincipal: string | null;
  unidadesOperacionais: number | null;
  postsTotais: number | null;
  entregasExecutadasGabi: number | null;
  notaCapacidade: number;
}

export function deriveMetrics(latest: OperationalCheckRow): OperationalMetrics {
  const score = scoreOf(latest);
  const { key, label } = interpretarScore(score);
  const statusAgenda = derivarStatusAgenda({
    notaCapacidade: latest.notaCapacidade,
    score,
    unidadesOperacionais: latest.unidadesOperacionais ?? 0,
    notaExecucaoDireta: latest.notaExecucaoDireta,
    teto: TETO_OPERACIONAL_UO,
  });
  return {
    score,
    scoreKey: key,
    scoreLabel: label,
    statusAgenda,
    gargaloPrincipal: latest.gargalos[0] ?? null,
    unidadesOperacionais: latest.unidadesOperacionais,
    postsTotais: latest.postsTotais,
    entregasExecutadasGabi: latest.entregasExecutadasGabi,
    notaCapacidade: latest.notaCapacidade,
  };
}

// ─── Dados da página ──────────────────────────────────────────────────────────────

export interface ActiveClientOption {
  id: number;
  name: string;
}

export interface OperationalPageData {
  checks: OperationalCheckRow[];
  latest: OperationalCheckRow | null;
  metrics: OperationalMetrics | null;
  evolution: OperationalEvolutionPoint[];
  activeClients: ActiveClientOption[];
}

export async function getOperationalPageData(): Promise<OperationalPageData> {
  const [checks, allPlans, allClients] = await Promise.all([
    getOperationalChecks(db),
    db.select().from(schema.subscriptionPlans).all(),
    db.select().from(schema.clients).all(),
  ]);

  const activeClientIds = new Set(
    allPlans.filter((p) => p.status === "ativo" && !p.endDate).map((p) => p.clientId)
  );
  const activeClients: ActiveClientOption[] = allClients
    .filter((c) => activeClientIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const latest = pickLatestCheck(checks);

  return {
    checks,
    latest,
    metrics: latest ? deriveMetrics(latest) : null,
    evolution: buildEvolutionSeries(checks),
    activeClients,
  };
}
