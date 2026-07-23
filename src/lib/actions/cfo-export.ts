"use server";

import { db } from "../db";
import * as schema from "../db/schema";
import { getAllPlans } from "../queries/plans";
import { getProfitAndLossData } from "../queries/profit-and-loss";
import { getTaxEstimate } from "../queries/tax-estimate";
import {
  aggregateResumoMensal,
  type PlanForMrr,
  type PaymentForMrr,
  type RevenueForResumo,
} from "../queries/dashboard";
import { getExpenses } from "../services/expenses";
import { getRevenues } from "../services/revenues";
import { FINANCIAL_DATA_START } from "../constants";
import {
  buildCfoReportMarkdown,
  type PlanForCfoReport,
} from "../cfo-export/build-cfo-report";

export async function exportCfoReportAction(): Promise<string> {
  const [plans, pnl, revenues, expenses, tax, rawPlans, rawPayments] = await Promise.all([
    getAllPlans(),
    getProfitAndLossData(),
    getRevenues(db),
    getExpenses(db),
    getTaxEstimate(),
    db.select().from(schema.subscriptionPlans).all(),
    db.select().from(schema.planPayments).all(),
  ]);

  const resumoMensal = aggregateResumoMensal({
    plans: rawPlans as unknown as PlanForMrr[],
    payments: rawPayments as unknown as PaymentForMrr[],
    revenues: revenues as unknown as RevenueForResumo[],
    today: new Date(),
    cutoff: FINANCIAL_DATA_START,
  });

  const planSubset: PlanForCfoReport[] = plans.map((p) => ({
    id: p.id,
    clientName: p.clientName,
    planType: p.planType,
    planValue: p.planValue,
    status: p.status,
    endDate: p.endDate,
    postsCarrossel: p.postsCarrossel,
    postsReels: p.postsReels,
    postsEstatico: p.postsEstatico,
    postsTrafego: p.postsTrafego,
    custoPost: p.custoPost,
    nextPaymentDate: p.nextPaymentDate ?? null,
    lastPaymentDate: p.lastPaymentDate ?? null,
    statusPagamento: p.statusPagamento,
    adjustmentSuggestion: p.adjustmentSuggestion,
    permanencia: p.permanencia,
    nextAdjustmentDate: p.nextAdjustmentDate,
  }));

  return buildCfoReportMarkdown({
    now: new Date(),
    pnl,
    plans: planSubset,
    revenues,
    expenses,
    tax,
    resumoMensal,
  });
}
