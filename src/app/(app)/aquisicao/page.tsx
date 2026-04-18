import { getUnitEconomicsData } from "@/lib/queries/unit-economics";
import { AquisicaoClient } from "./aquisicao-client";

export const dynamic = "force-dynamic";

export default async function AquisicaoPage() {
  const data = await getUnitEconomicsData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Aquisição &amp; Unit Economics</h1>
        <p className="text-muted-foreground mt-1">
          Quanto custa trazer um cliente, quanto ele retorna e quanto tempo paga o
          próprio custo
        </p>
      </div>

      <AquisicaoClient data={data} />
    </div>
  );
}
