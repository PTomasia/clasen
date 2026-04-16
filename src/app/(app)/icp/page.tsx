import { getICPData } from "@/lib/queries/icp";
import { ICPClient } from "./icp-client";

export const dynamic = "force-dynamic";

export default async function ICPPage() {
  const data = await getICPData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Perfil de Cliente Ideal</h1>
        <p className="text-muted-foreground mt-1">
          Distribuições e insights sobre o perfil das clientes ativas
        </p>
      </div>

      <ICPClient data={data} />
    </div>
  );
}
