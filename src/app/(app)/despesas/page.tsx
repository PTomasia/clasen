import { db } from "@/lib/db";
import { getExpenses, getExpensesSummary } from "@/lib/services/expenses";
import { getProfitAndLossData } from "@/lib/queries/profit-and-loss";
import { DespesasClient } from "./despesas-client";

export const dynamic = "force-dynamic";

export default async function DespesasPage() {
  const [expenses, summary, pnl] = await Promise.all([
    getExpenses(db as any),
    getExpensesSummary(db as any),
    getProfitAndLossData(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Despesas</h1>
        <p className="text-muted-foreground mt-1">
          Controle de gastos e resultado líquido da agência
        </p>
      </div>

      <DespesasClient expenses={expenses} summary={summary} pnl={pnl} />
    </div>
  );
}
