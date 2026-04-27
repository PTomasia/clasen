import { db } from "../db";
import * as schema from "../db/schema";
import { format, subMonths, startOfMonth } from "date-fns";
import { FINANCIAL_DATA_START } from "../constants";
import {
  calcularCAC,
  calcularROAS,
  calcularChurnRate,
  calcularLTV,
  calcularPayback,
} from "../utils/unit-economics";
import { getAdSpendMap } from "../services/marketing";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MonthRow {
  month: string; // YYYY-MM
  label: string; // Abr/26
  adSpend: number;
  novosClientes: number;
  cac: number | null;
  receita: number;
  roas: number | null;
  ativosInicio: number;
  churned: number;
  churnRate: number | null; // 0..1 (count-based)
  revenueChurnRate: number | null; // 0..1 (MRR-based)
}

export interface UnitEconomicsData {
  rows: MonthRow[];
  totals: {
    adSpendTotal: number;
    novosClientesTotal: number;
    receitaTotal: number;
    cacMedio: number | null;
    roasMedio: number | null;
    ltvMedio: number;
    ltvCacRatio: number | null;
    paybackMeses: number | null;
    ticketMedioMensal: number;
  };
}

// Tipos mínimos esperados pelo aggregator (subset dos schemas)
interface PlanInput {
  clientId: number;
  planValue: number;
  startDate: string;
  endDate: string | null;
}
interface PaymentInput {
  clientId: number;
  paymentDate: string;
  amount: number;
  status: string;
}
interface RevenueInput {
  clientId: number | null;
  date: string;
  amount: number;
  isPaid: boolean;
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

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

// ─── Agregação pura ───────────────────────────────────────────────────────────
// Separada do IO para ser testável sem mockar DB.

export function aggregateUnitEconomics(input: {
  plans: PlanInput[];
  payments: PaymentInput[];
  revenues: RevenueInput[];
  adSpendMap: Map<string, number>;
  today: Date;
  financialDataStart?: string;
}): UnitEconomicsData {
  const { plans, adSpendMap, today, financialDataStart } = input;

  const payments = financialDataStart
    ? input.payments.filter((p) => p.paymentDate >= financialDataStart)
    : input.payments;
  const revenues = financialDataStart
    ? input.revenues.filter((r) => r.date >= financialDataStart)
    : input.revenues;
  const currentMonthStart = startOfMonth(today);

  // Últimos 12 meses (incluindo o atual)
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    months.push(format(subMonths(currentMonthStart, i), "yyyy-MM"));
  }

  // Pré-calcula "primeiro start_date" por cliente (para definir "novo cliente")
  const firstStartByClient = new Map<number, string>();
  for (const p of plans) {
    const cur = firstStartByClient.get(p.clientId);
    if (!cur || p.startDate < cur) firstStartByClient.set(p.clientId, p.startDate);
  }

  // Data de churn: último end_date se TODOS os planos do cliente têm end_date
  const plansByClient = new Map<number, PlanInput[]>();
  for (const p of plans) {
    if (!plansByClient.has(p.clientId)) plansByClient.set(p.clientId, []);
    plansByClient.get(p.clientId)!.push(p);
  }
  const churnDateByClient = new Map<number, string>();
  for (const [cid, cps] of plansByClient) {
    const allClosed = cps.every((p) => !!p.endDate);
    if (!allClosed) continue;
    const lastEnd = cps.map((p) => p.endDate as string).sort().reverse()[0];
    churnDateByClient.set(cid, lastEnd);
  }

  // Linhas por mês
  const rows: MonthRow[] = months.map((m) => {
    const adSpend = adSpendMap.get(m) ?? 0;

    // Novos clientes: primeiro plano no mês
    let novosClientes = 0;
    for (const firstStart of firstStartByClient.values()) {
      if (monthKey(firstStart) === m) novosClientes++;
    }

    // Receita: pagamentos (pagos) + avulsas (pagas) no mês
    let receita = 0;
    for (const p of payments) {
      if (p.status !== "pago") continue;
      if (monthKey(p.paymentDate) === m) receita += p.amount;
    }
    for (const r of revenues) {
      if (!r.isPaid) continue;
      if (monthKey(r.date) === m) receita += r.amount;
    }

    // Ativos no início do mês: start_date <= 1º do mês E (end_date IS NULL OR end_date >= 1º do mês)
    const monthStart = m + "-01";
    const activeClientIds = new Set<number>();
    let mrrInicio = 0;
    for (const p of plans) {
      if (p.startDate > monthStart) continue;
      if (p.endDate && p.endDate < monthStart) continue;
      activeClientIds.add(p.clientId);
      mrrInicio += p.planValue;
    }
    const ativosInicio = activeClientIds.size;

    // Churned no mês (count-based) + receita perdida (MRR-based)
    let churned = 0;
    let receitaPerdida = 0;
    for (const [cid, churnDate] of churnDateByClient.entries()) {
      if (monthKey(churnDate) !== m) continue;
      churned++;
      // Soma planValues de todos os planos desse cliente
      for (const p of (plansByClient.get(cid) ?? [])) {
        receitaPerdida += p.planValue;
      }
    }

    const cac = calcularCAC(adSpend, novosClientes);
    const roas = calcularROAS(receita, adSpend);
    const churnRate = calcularChurnRate(churned, ativosInicio);
    const revenueChurnRate = mrrInicio > 0 ? receitaPerdida / mrrInicio : null;

    return {
      month: m,
      label: monthLabel(m),
      adSpend,
      novosClientes,
      cac,
      receita,
      roas,
      ativosInicio,
      churned,
      churnRate,
      revenueChurnRate,
    };
  });

  // Totais agregados
  const adSpendTotal = rows.reduce((s, r) => s + r.adSpend, 0);
  const novosClientesTotal = rows.reduce((s, r) => s + r.novosClientes, 0);
  const receitaTotal = rows.reduce((s, r) => s + r.receita, 0);

  const cacMedio =
    novosClientesTotal > 0 ? adSpendTotal / novosClientesTotal : null;
  const roasMedio = adSpendTotal > 0 ? receitaTotal / adSpendTotal : null;

  // LTV médio: média de (total pagamentos + total avulsas) por cliente que já pagou algo
  const paymentsByClient = new Map<number, number[]>();
  for (const p of payments) {
    if (p.status !== "pago") continue;
    if (!paymentsByClient.has(p.clientId)) paymentsByClient.set(p.clientId, []);
    paymentsByClient.get(p.clientId)!.push(p.amount);
  }
  const revenuesByClient = new Map<number, number[]>();
  for (const r of revenues) {
    if (!r.isPaid) continue;
    if (!r.clientId) continue;
    if (!revenuesByClient.has(r.clientId)) revenuesByClient.set(r.clientId, []);
    revenuesByClient.get(r.clientId)!.push(r.amount);
  }

  const clientIds = new Set([
    ...paymentsByClient.keys(),
    ...revenuesByClient.keys(),
  ]);
  const ltvs: number[] = [];
  for (const cid of clientIds) {
    const ltv = calcularLTV({
      planPayments: paymentsByClient.get(cid) ?? [],
      oneTimeRevenues: revenuesByClient.get(cid) ?? [],
    });
    if (ltv > 0) ltvs.push(ltv);
  }
  const ltvMedio =
    ltvs.length > 0 ? ltvs.reduce((a, b) => a + b, 0) / ltvs.length : 0;

  const ltvCacRatio = cacMedio && cacMedio > 0 ? ltvMedio / cacMedio : null;

  // Ticket médio mensal: média de planValue dos planos atualmente ativos
  const activePlans = plans.filter((p) => !p.endDate);
  const ticketMedioMensal =
    activePlans.length > 0
      ? activePlans.reduce((s, p) => s + p.planValue, 0) / activePlans.length
      : 0;

  const paybackMeses = calcularPayback(cacMedio, ticketMedioMensal);

  return {
    rows,
    totals: {
      adSpendTotal,
      novosClientesTotal,
      receitaTotal,
      cacMedio,
      roasMedio,
      ltvMedio,
      ltvCacRatio,
      paybackMeses,
      ticketMedioMensal,
    },
  };
}

// ─── Query principal (IO) ─────────────────────────────────────────────────────

export async function getUnitEconomicsData(): Promise<UnitEconomicsData> {
  const [plans, payments, revenues, adSpendMap] = await Promise.all([
    db.select().from(schema.subscriptionPlans).all(),
    db.select().from(schema.planPayments).all(),
    db.select().from(schema.oneTimeRevenues).all(),
    getAdSpendMap(db),
  ]);

  return aggregateUnitEconomics({
    plans: plans as any,
    payments: payments as any,
    revenues: revenues as any,
    adSpendMap,
    today: new Date(),
    financialDataStart: FINANCIAL_DATA_START,
  });
}
