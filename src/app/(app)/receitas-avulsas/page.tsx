import { db } from "@/lib/db";
import { getRevenues, getRevenuesSummary } from "@/lib/services/revenues";
import { getClientsList } from "@/lib/services/clients";
import { RevenuesClient } from "./revenues-client";

export const dynamic = "force-dynamic";

export default async function ReceitasAvulsasPage() {
  const [revenues, summary, clients] = await Promise.all([
    getRevenues(db as any),
    getRevenuesSummary(db as any),
    getClientsList(db as any),
  ]);

  const clientOptions = clients
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Receitas avulsas</h1>
        <p className="text-muted-foreground mt-1">
          Jobs e produtos pontuais — fora do plano mensal
        </p>
      </div>

      <RevenuesClient
        revenues={revenues}
        summary={summary}
        clients={clientOptions}
      />
    </div>
  );
}
