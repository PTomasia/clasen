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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar, AlertTriangle, CreditCard, SkipForward } from "lucide-react";
import type {
  DashboardData,
  OperationalMonth,
  PostsPorClienteResult,
} from "@/lib/queries/dashboard";
import type { PnLData } from "@/lib/queries/profit-and-loss";
import { PaymentDialog } from "@/app/(app)/planos/payment-dialog";
import { skipBillingCycleAction } from "@/lib/actions/plans";
import { MonthlyEvolutionChart } from "./monthly-evolution-chart";
import { OperationalEvolutionChart } from "./operational-evolution-chart";

function HeroKPI({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-7 md:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-2 text-5xl md:text-6xl font-medium leading-none tracking-tight"
        style={{ fontFamily: "var(--font-heading), serif" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs text-muted-foreground mt-3">{sub}</p>
      )}
    </div>
  );
}

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
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-1 text-2xl leading-tight tracking-tight"
        style={{ fontFamily: "var(--font-heading), serif" }}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function PermanenciaStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="font-mono font-semibold text-lg leading-none">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
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

  const total = data.reduce((s, p) => s + p.value, 0);

  return (
    <div className="bg-card border rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-semibold">MRR — Últimos 12 meses</h2>
        <span
          className="text-lg text-muted-foreground tabular-nums"
          style={{ fontFamily: "var(--font-heading), serif" }}
        >
          {formatBRL(total)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            formatter={(value) => [formatBRL(Number(value)), "MRR"]}
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              fontSize: "13px",
              padding: "10px 14px",
              boxShadow: "0 8px 24px -8px rgba(0,0,0,0.18)",
            }}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: "11px", marginBottom: "4px" }}
          />
          <Bar
            dataKey="value"
            fill="url(#mrrFill)"
            radius={[6, 6, 0, 0]}
            activeBar={{ fill: "var(--accent)" }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DashboardClient({
  data,
  pnl,
  operational,
}: {
  data: DashboardData;
  pnl: PnLData;
  operational: {
    postsPorCliente: PostsPorClienteResult;
    evolution: OperationalMonth[];
  };
}) {
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
      {/* Hero + 3 primários */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <HeroKPI
            label="Receita bruta mensal"
            value={formatBRL(data.receitaBruta)}
            sub={`${data.clientesAtivos} clientes ativos · ${data.postsAtivos} posts/mês`}
          />
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-4">
          <KPICard label="Clientes ativos" value={String(data.clientesAtivos)} />
          <KPICard label="Ticket médio" value={formatBRL(data.ticketMedio)} sub="por cliente" />
          <KPICard
            label="$/post médio"
            value={formatBRL(data.ticketMedioPorPost)}
            sub={
              operational.postsPorCliente.ratio !== null
                ? `${operational.postsPorCliente.ratio.toFixed(1)} posts/cliente`
                : undefined
            }
          />
        </div>
      </div>

      {/* Permanência — strip compacto */}
      <div className="bg-card border rounded-lg px-5 py-4">
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Permanência
          </h2>
          <span className="text-[10px] text-muted-foreground/70">em meses</span>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          <PermanenciaStat label="Geral" value={`${data.permMediaGeral}m`} />
          <PermanenciaStat label="Ativos" value={`${data.permMediaAtivos}m`} />
          <PermanenciaStat label="Inativos" value={`${data.permMediaInativos}m`} />
          <PermanenciaStat label="Mediana" value={`${data.permMediana}m`} />
          <PermanenciaStat label="Média +3M" value={`${data.permMedia3M}m`} sub="ativos >3m" />
          <PermanenciaStat label="Ativos +3M" value={String(data.ativosPlus3M)} sub="clientes" />
        </div>
      </div>

      {/* MRR Chart */}
      <MRRChart data={data.mrr} />

      {/* Evolução mensal: receita, despesa, lucro */}
      <MonthlyEvolutionChart pnl={pnl} />

      {/* Evolução operacional: clientes, posts, ticket/post */}
      <OperationalEvolutionChart data={operational.evolution} />

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
              ✓ Nenhum pagamento atrasado
            </p>
          ) : (
            <ul className="divide-y max-h-[300px] overflow-y-auto -mx-5">
              {data.atrasados.map((row) => (
                <li
                  key={row.planId}
                  className="relative flex items-center gap-3 py-2.5 px-5 pl-[18px]"
                >
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{row.clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.planType} · venceu {formatDate(row.nextPaymentDate)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-accent/10 text-accent tabular-nums",
                      row.diasAtraso >= 30 && "animate-pulse"
                    )}
                    title={`${row.diasAtraso} dias em atraso`}
                  >
                    {row.diasAtraso}d
                  </span>
                  <p className="text-sm font-mono font-semibold shrink-0 tabular-nums">
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
              <span
                className="ml-auto text-2xl text-primary tracking-tight tabular-nums"
                style={{ fontFamily: "var(--font-heading), serif" }}
              >
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
