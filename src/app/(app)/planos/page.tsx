import { getAllPlans, getClientsList } from "@/lib/queries/plans";
import { getTargetCostPerPost } from "@/lib/actions/settings";
import { PlanosClient } from "./planos-client";

export const dynamic = "force-dynamic";

export default async function PlanosPage() {
  const [plans, clients, targetCostPerPost] = await Promise.all([
    getAllPlans(),
    getClientsList(),
    getTargetCostPerPost(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Histórico de Planos</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie planos, registre pagamentos e acompanhe o $/post
          </p>
        </div>
      </div>

      <PlanosClient
        plans={plans}
        clients={clients}
        targetCostPerPost={targetCostPerPost}
      />
    </div>
  );
}
