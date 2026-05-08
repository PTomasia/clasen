// ─── Overdue rows builder ──────────────────────────────────────────────────────
// Deriva 1 linha por gap (vencimento atrasado) a partir dos planos enriquecidos
// por getAllPlans (que já calcula gapMonths via calculateGapsForPlan).

export interface PlanForOverdue {
  id: number;
  clientName: string;
  planType: string;
  planValue: number;
  billingCycleDays: number | null;
  billingCycleDays2: number | null;
  gapMonths: string[];
}

export interface OverdueRow {
  planId: number;
  clientName: string;
  planType: string;
  rowValue: number;
  dueDate: string;
  diasAtraso: number;
  hasBillingCycle: boolean;
}

const MS_PER_DAY = 86_400_000;

export function buildOverdueRows(
  plans: ReadonlyArray<PlanForOverdue>,
  today: Date = new Date()
): OverdueRow[] {
  const rows: OverdueRow[] = [];

  for (const plan of plans) {
    if (!plan.gapMonths || plan.gapMonths.length === 0) continue;

    const rowValue = plan.billingCycleDays2
      ? plan.planValue / 2
      : plan.planValue;
    const hasBillingCycle = plan.billingCycleDays != null;

    for (const dueDate of plan.gapMonths) {
      const diasAtraso = Math.floor(
        (today.getTime() - new Date(dueDate).getTime()) / MS_PER_DAY
      );
      rows.push({
        planId: plan.id,
        clientName: plan.clientName,
        planType: plan.planType,
        rowValue,
        dueDate,
        diasAtraso,
        hasBillingCycle,
      });
    }
  }

  return rows.sort((a, b) => b.diasAtraso - a.diasAtraso);
}
