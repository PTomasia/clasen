import { getAllClients } from "@/lib/queries/clients";
import { ClientesClient } from "./clientes-client";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const clients = await getAllClients();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clientes</h1>
        <p className="text-muted-foreground mt-1">
          Permanência real, valor mensal e visão consolidada por cliente
        </p>
      </div>

      <ClientesClient clients={clients} />
    </div>
  );
}
