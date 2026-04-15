import { getUpcomingPayments } from "@/lib/queries/dashboard";
import { formatBRL, formatDate } from "@/lib/utils/formatting";
import { Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const upcoming = await getUpcomingPayments(7);
  const total = upcoming.reduce((sum, r) => sum + r.planValue, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visão geral da agência</p>
      </div>

      <div className="bg-card border rounded-lg p-5 max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-primary" />
            <h2 className="font-semibold">Próximos 7 dias</h2>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-mono font-semibold text-primary">
              {formatBRL(total)}
            </p>
          </div>
        </div>

        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum pagamento agendado para os próximos 7 dias
          </p>
        ) : (
          <ul className="divide-y">
            {upcoming.map((row) => (
              <li
                key={row.planId}
                className="flex items-center justify-between py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{row.clientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.planType} · {formatDate(row.nextPaymentDate!)}
                  </p>
                </div>
                <p className="text-sm font-mono font-semibold">
                  {formatBRL(row.planValue)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
