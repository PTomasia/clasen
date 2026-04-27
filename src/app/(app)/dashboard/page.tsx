import { getDashboardData } from "@/lib/queries/dashboard";
import { getProfitAndLossData } from "@/lib/queries/profit-and-loss";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [data, pnl] = await Promise.all([
    getDashboardData(),
    getProfitAndLossData(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visão geral da agência</p>
      </div>

      <DashboardClient data={data} pnl={pnl} />
    </div>
  );
}
