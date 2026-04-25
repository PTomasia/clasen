"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBRL, formatDate } from "@/lib/utils/formatting";
import { Button } from "@/components/ui/button";
import { Calendar, AlertTriangle, CreditCard, SkipForward } from "lucide-react";
import type { DashboardData } from "@/lib/queries/dashboard";
import { PaymentDialog } from "@/app/(app)/planos/payment-dialog";
import { skipBillingCycleAction } from "@/lib/actions/plans";

function KPICard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold font-mono">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function MRRChart({ data }: { data: DashboardData["mrr"] }) {
  if (data.every((d) => d.value === 0)) {
    return (
      <div className="bg-card border rounded-lg p-5">
        <h2 className="font-semibold mb-4">MRR — Últimos 12 meses</h2>
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nenhum pagamento registrado ainda. O gráfico aparece conforme os pagamentos são lançados.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-lg p-5">
      <h2 className="font-semibold mb-4">MRR — Últimos 12 meses</h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
          />
          <Tooltip
            formatter={(value) => [formatBRL(Number(value)), "MRR"]}
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          />
          <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardClient({ data }: { data: DashboardData }) {
  const [paymentPlan, setPaymentPlan] = useState<{
    id: number;
    clientName: string;
    planValue: number;
  } | null>(null);
  const [skipping, setSkipping] = useState<number | null>(null);

  async function handleSkip(planId: number) {
    setSkipping(planId);
    try {
      await skipBillingCycleAction(planId);
    } finally {
      setSkipping(null);
    }
  }

  return (
    <>
    <div className="space-y-6">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard label="Clientes ativos" value={String(data.clientesAtivos)} />
        <KPICard label="Posts ativos" value={String(data.postsAtivos)} />
        <KPICard label="Receita bruta" value={formatBRL(data.receitaBruta)} />
        <KPICard label="Ticket médio" value={formatBRL(data.ticketMedio)} sub="por cliente" />
        <KPICard label="Ticket médio/post" value={formatBRL(data.ticketMedioPorPost)} sub="$/post médio" />
      </div>

      {/* Permanência */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Permanência</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <KPICard label="Média geral" value={`${data.permMediaGeral}m`} />
          <KPICard label="Média ativos" value={`${data.permMediaAtivos}m`} />
          <KPICard label="Média inativos" value={`${data.permMediaInativos}m`} />
          <KPICard label="Mediana" value={`${data.permMediana}m`} />
          <KPICard label="Média +3M" value={`${data.permMedia3M}m`} sub="ativos >3 meses" />
          <KPICard label="Ativos +3M" value={String(data.ativosPlus3M)} sub="clientes" />
        </div>
      </div>

      {/* MRR Chart */}
      <MRRChart data={data.mrr} />

      {/* Duas colunas: Atrasados + Próximos */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Atrasados */}
        <div className="bg-card border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-accent" />
            <h2 className="font-semibold">Pagamentos atrasados</h2>
            {data.atrasados.length > 0 && (
              <span className="ml-auto text-sm font-mono font-semibold text-accent">
                {data.atrasados.length}
              </span>
            )}
          </div>

          {data.atrasados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum pagamento atrasado
            </p>
          ) : (
            <ul className="divide-y max-h-[300px] overflow-y-auto">
              {data.atrasados.map((row) => (
                <li
                  key={row.planId}
                  className="flex items-center gap-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.planType} · venceu {formatDate(row.nextPaymentDate)}{" "}
                      <span className="text-accent font-medium">
                        ({row.diasAtraso}d atrás)
                      </span>
                    </p>
                  </div>
                  <p className="text-sm font-mono font-semibold shrink-0">
                    {formatBRL(row.planValue)}
                  </p>
                  {row.billingCycleDays && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 gap-1 text-muted-foreground"
                      disabled={skipping === row.planId}
                      onClick={() => handleSkip(row.planId)}
                      title="Pular cobrança deste mês"
                    >
                      <SkipForward size={12} />
                      <span className="text-xs">Pular</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1"
                    onClick={() =>
                      setPaymentPlan({
                        id: row.planId,
                        clientName: row.clientName,
                        planValue: row.planValue,
                      })
                    }
                  >
                    <CreditCard size={12} />
                    <span className="text-xs">Pagar</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Próximos 7 dias */}
        <div className="bg-card border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-primary" />
            <h2 className="font-semibold">Próximos 7 dias</h2>
            {data.upcoming.length > 0 && (
              <span className="ml-auto text-sm font-mono font-semibold text-primary">
                {formatBRL(
                  data.upcoming.reduce((s, r) => s + r.planValue, 0)
                )}
              </span>
            )}
          </div>

          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum pagamento nos próximos 7 dias
            </p>
          ) : (
            <ul className="divide-y max-h-[300px] overflow-y-auto">
              {data.upcoming.map((row) => (
                <li
                  key={row.planId}
                  className="flex items-center justify-between py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {row.clientName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.planType} · {formatDate(row.nextPaymentDate)}
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
    </div>

      {paymentPlan && (
        <PaymentDialog
          open={!!paymentPlan}
          onClose={() => setPaymentPlan(null)}
          plan={paymentPlan}
        />
      )}
    </>
  );
}
