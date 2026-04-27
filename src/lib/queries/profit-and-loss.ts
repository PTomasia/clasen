import { db } from "../db";
import * as schema from "../db/schema";
import { format, subMonths, startOfMonth } from "date-fns";
import { FINANCIAL_DATA_START } from "../constants";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PnLRow {
  month: string; // YYYY-MM
  label: string; // Abr/26
  receitaRecorrente: number;
  receitaAvulsa: number;
  receitaTotal: number;
  despesaFixa: number;
  despesaVariavel: number;
  despesaTotal: number;
  lucroLiquido: number;
  margemLiquida: number | null; // 0..1 ou null se receitaTotal=0
}

export interface PnLData {
  rows: PnLRow[];
  totals: {
    receitaTotal: number;
    despesaTotal: number;
    despesaFixaTotal: number;
    despesaVariavelTotal: number;
    lucroTotal: number;
    margemMedia: number | null;
    mesesNoLucro: number;
    mesesNoPrejuizo: number;
  };
}

// Tipos mínimos
interface PaymentInput {
  paymentDate: string;
  amount: number;
  status: string;
}
interface RevenueInput {
  date: string;
  amount: number;
  isPaid: boolean;
}
interface ExpenseInput {
  month: string;
  category: string;
  amount: number;
  isPaid: boolean;
}
interface MarketingInput {
  month: string; // YYYY-MM
  adSpend: number;
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

export function aggregateProfitAndLoss(input: {
  payments: PaymentInput[];
  revenues: RevenueInput[];
  expenses: ExpenseInput[];
  marketing?: MarketingInput[]; // adSpend entra como despesa variável de marketing
  today: Date;
  financialDataStart?: string;
}): PnLData {
  const { today, financialDataStart, marketing = [] } = input;
  const cutoffMonth = financialDataStart ? financialDataStart.slice(0, 7) : undefined;

  const payments = financialDataStart
    ? input.payments.filter((p) => p.paymentDate >= financialDataStart)
    : input.payments;
  const revenues = financialDataStart
    ? input.revenues.filter((r) => r.date >= financialDataStart)
    : input.revenues;
  const expenses = cutoffMonth
    ? input.expenses.filter((e) => e.month >= cutoffMonth)
    : input.expenses;
  const currentMonthStart = startOfMonth(today);

  // Últimos 12 meses (inclui o atual)
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    months.push(format(subMonths(currentMonthStart, i), "yyyy-MM"));
  }

  const rows: PnLRow[] = months.map((m) => {
    // Receita recorrente: pagamentos pagos no mês
    let receitaRecorrente = 0;
    for (const p of payments) {
      if (p.status !== "pago") continue;
      if (monthKey(p.paymentDate) === m) receitaRecorrente += p.amount;
    }

    // Receita avulsa: avulsas pagas no mês
    let receitaAvulsa = 0;
    for (const r of revenues) {
      if (!r.isPaid) continue;
      if (monthKey(r.date) === m) receitaAvulsa += r.amount;
    }

    // Despesa: pagas, agrupadas por categoria
    let despesaFixa = 0;
    let despesaVariavel = 0;
    for (const e of expenses) {
      if (!e.isPaid) continue;
      if (e.month !== m) continue;
      if (e.category === "fixo") despesaFixa += e.amount;
      else despesaVariavel += e.amount;
    }
    // adSpend de marketing: entra como despesa variável (regime de caixa)
    const mktRow = marketing.find((mk) => mk.month === m);
    if (mktRow && mktRow.adSpend > 0) despesaVariavel += mktRow.adSpend;

    const receitaTotal = receitaRecorrente + receitaAvulsa;
    const despesaTotal = despesaFixa + despesaVariavel;
    const lucroLiquido = receitaTotal - despesaTotal;
    const margemLiquida = receitaTotal > 0 ? lucroLiquido / receitaTotal : null;

    return {
      month: m,
      label: monthLabel(m),
      receitaRecorrente,
      receitaAvulsa,
      receitaTotal,
      despesaFixa,
      despesaVariavel,
      despesaTotal,
      lucroLiquido,
      margemLiquida,
    };
  });

  // Totais
  const receitaTotal = rows.reduce((s, r) => s + r.receitaTotal, 0);
  const despesaTotal = rows.reduce((s, r) => s + r.despesaTotal, 0);
  const despesaFixaTotal = rows.reduce((s, r) => s + r.despesaFixa, 0);
  const despesaVariavelTotal = rows.reduce((s, r) => s + r.despesaVariavel, 0);
  const lucroTotal = receitaTotal - despesaTotal;
  const margemMedia = receitaTotal > 0 ? lucroTotal / receitaTotal : null;

  let mesesNoLucro = 0;
  let mesesNoPrejuizo = 0;
  for (const r of rows) {
    if (r.receitaTotal === 0 && r.despesaTotal === 0) continue; // mês vazio, ignora
    if (r.lucroLiquido > 0) mesesNoLucro += 1;
    else if (r.lucroLiquido < 0) mesesNoPrejuizo += 1;
  }

  return {
    rows,
    totals: {
      receitaTotal,
      despesaTotal,
      despesaFixaTotal,
      despesaVariavelTotal,
      lucroTotal,
      margemMedia,
      mesesNoLucro,
      mesesNoPrejuizo,
    },
  };
}

// ─── Query (IO) ───────────────────────────────────────────────────────────────

export async function getProfitAndLossData(): Promise<PnLData> {
  const [payments, revenues, expenses, marketing] = await Promise.all([
    db.select().from(schema.planPayments).all(),
    db.select().from(schema.oneTimeRevenues).all(),
    db.select().from(schema.expenses).all(),
    db.select().from(schema.marketingMonthly).all(),
  ]);

  return aggregateProfitAndLoss({
    payments: payments as any,
    revenues: revenues as any,
    expenses: expenses as any,
    marketing: marketing as any,
    today: new Date(),
    financialDataStart: FINANCIAL_DATA_START,
  });
}
