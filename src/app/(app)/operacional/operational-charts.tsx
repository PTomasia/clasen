"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { OperationalEvolutionPoint } from "@/lib/queries/operational";

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { value: number | null; color: string }[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const v = payload[0]?.value;
  return (
    <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold mb-0.5">{label}</p>
      <p className="font-mono" style={{ color: payload[0]?.color }}>
        {v == null ? "—" : `${v}${unit ?? ""}`}
      </p>
    </div>
  );
}

function MiniLineChart({
  title,
  hint,
  data,
  dataKey,
  color,
  domain,
  unit,
}: {
  title: string;
  hint?: string;
  data: OperationalEvolutionPoint[];
  dataKey: keyof OperationalEvolutionPoint;
  color: string;
  domain?: [number | string, number | string];
  unit?: string;
}) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        {title}
        {hint && (
          <span className="text-muted-foreground text-xs cursor-help" title={hint}>
            ⓘ
          </span>
        )}
      </h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 8, right: 10, left: -18, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          <YAxis
            domain={domain ?? [0, "auto"]}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            allowDecimals
            width={36}
          />
          <Tooltip content={<ChartTooltip unit={unit} />} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OperationalCharts({ data }: { data: OperationalEvolutionPoint[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <MiniLineChart
        title="Score operacional"
        hint="Média das 5 notas (1 a 5) do check de cada mês. Quando há os dois checks, usa o de fim do mês."
        data={data}
        dataKey="score"
        color="var(--primary)"
        domain={[1, 5]}
      />
      <MiniLineChart
        title="Capacidade para novas clientes"
        hint="Nota 1 a 5 de capacidade de absorver novas clientes."
        data={data}
        dataKey="capacidade"
        color="#15803d"
        domain={[1, 5]}
      />
      <MiniLineChart
        title="Entregas executadas pela Gabi"
        hint="Quantidade de entregas que a Gabi produziu diretamente no período."
        data={data}
        dataKey="entregasGabi"
        color="#b45309"
      />
      <MiniLineChart
        title="Unidades operacionais"
        hint="Carga operacional (UO) planejada do mês."
        data={data}
        dataKey="unidadesOperacionais"
        color="#a3b545"
      />
    </div>
  );
}
