"use server";

import { db } from "../db";
import { getAllPlans } from "../queries/plans";
import { getProfitAndLossData } from "../queries/profit-and-loss";
import { getTaxEstimate } from "../queries/tax-estimate";
import { getExpenses } from "../services/expenses";
import { getRevenues } from "../services/revenues";
import {
  buildCfoReportMarkdown,
  type PlanForCfoReport,
} from "../cfo-export/build-cfo-report";

export async function exportCfoReportAction(): Promise<string> {
  const [plans, pnl, revenues, expenses, tax] = await Promise.all([
    getAllPlans(),
    getProfitAndLossData(),
    getRevenues(db),
    getExpenses(db),
    getTaxEstimate(),
  ]);

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
  }));

  return buildCfoReportMarkdown({
    now: new Date(),
    pnl,
    plans: planSubset,
    revenues,
    expenses,
    tax,
  });
}
