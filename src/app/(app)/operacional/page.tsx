import { getOperationalPageData } from "@/lib/queries/operational";
import { OperacionalClient } from "./operacional-client";

export const dynamic = "force-dynamic";

export default async function OperacionalPage() {
  const data = await getOperationalPageData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Operacional</h1>
        <p className="text-muted-foreground mt-1">
          Saúde operacional da Clasen e a transição da Gabi de executora para direção criativa.
        </p>
      </div>
      <OperacionalClient data={data} />
    </div>
  );
}
