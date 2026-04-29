"use client";

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBRL } from "@/lib/utils/formatting";
import { useSeriesToggle } from "@/lib/hooks/use-series-toggle";
import { cn } from "@/lib/utils";
import type { TimeRange } from "@/components/shared/time-range-control";
import type { OperationalMonth } from "@/lib/queries/dashboard";

// ─── Series config ────────────────────────────────────────────────────────────
const SERIES = [
  { name: "Clientes", color: "var(--primary)", axis: "left" as const },
  { name: "Posts/mês", color: "#a3b545", axis: "left" as const },
  { name: "Ticket/post", color: "#15803d", axis: "right" as const },
];
const SERIES_NAMES = SERIES.map((s) => s.name);

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipRowItem {
  name: string;
  value: number | null;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const items: TooltipRowItem[] = payload.map((p) => ({
    name: p.name,
    value: p.value,
    color: p.color,
  }));

  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1.5">{label}</p>
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-2 text-xs">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: it.color }}
          />
          <span className="text-muted-foreground">{it.name}:</span>
          <span className="font-mono font-medium" style={{ color: it.color }}>
            {it.value === null
              ? "—"
              : it.name === "Ticket/post"
              ? formatBRL(it.value)
              : it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

// ─── Custom Legend ────────────────────────────────────────────────────────────

function InteractiveLegend({
  isVisible,
  onToggle,
}: {
  isVisible: (name: string) => boolean;
  onToggle: (name: string, multi: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 mt-2 pt-2 text-xs select-none">
      {SERIES.map((s) => {
        const active = isVisible(s.name);
        return (
          <button
            key={s.name}
            type="button"
            data-series={s.name}
            onClick={(e) => onToggle(s.name, e.ctrlKey || e.metaKey)}
            style={{ opacity: active ? 1 : 0.3 }}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded transition-opacity hover:bg-muted/40 cursor-pointer"
            )}
            title="Clique para isolar · Ctrl+clique para alternar"
          >
            <span
              className="inline-block w-3 h-[2px] rounded"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-foreground">{s.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function OperationalEvolutionChart({
  data,
  range,
}: {
  data: OperationalMonth[];
  range?: TimeRange;
}) {
  const { isVisible, toggle } = useSeriesToggle(SERIES_NAMES);

  const sliced = range ? data.slice(range.fromIdx, range.toIdx + 1) : data;
  const chartData = sliced.map((d) => ({
    label: d.label,
    "Clientes": d.clientesAtivos,
    "Posts/mês": d.postsTotal,
    "Ticket/post": d.ticketPorPost,
  }));

  return (
    <div className="bg-card border rounded-lg p-5">
      <h2 className="font-semibold mb-4 flex items-center gap-1.5">
        Evolução operacional
        <span
          className="text-muted-foreground text-xs cursor-help"
          title="Clientes ativos: planos com end_date NULL ou posterior ao mês. Posts/mês: soma ponderada (estático conta 0,5; tráfego conta 1). Ticket/post: MRR do mês ÷ posts do mês. Mês com 0 posts mostra ticket vazio."
        >
          ⓘ
        </span>
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(0)}`
            }
          />
          <Tooltip content={<CustomTooltip />} />
          {isVisible("Clientes") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="Clientes"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          )}
          {isVisible("Posts/mês") && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="Posts/mês"
              stroke="#a3b545"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          )}
          {isVisible("Ticket/post") && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="Ticket/post"
              stroke="#15803d"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <InteractiveLegend isVisible={isVisible} onToggle={toggle} />
      <p className="text-xs text-muted-foreground mt-2">
        Eixo esquerdo: contagem (clientes/posts). Eixo direito: ticket por post em R$.
      </p>
    </div>
  );
}
