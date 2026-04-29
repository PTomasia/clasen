import {
  getDashboardData,
  getOperationalDashboard,
} from "@/lib/queries/dashboard";
import { getProfitAndLossData } from "@/lib/queries/profit-and-loss";
import { getUnitEconomicsData } from "@/lib/queries/unit-economics";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [data, pnl, operational, unit] = await Promise.all([
    getDashboardData(),
    getProfitAndLossData(),
    getOperationalDashboard(),
    getUnitEconomicsData(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visão geral da agência</p>
      </div>

      <DashboardClient data={data} pnl={pnl} operational={operational} unit={unit} />
    </div>
  );
}
