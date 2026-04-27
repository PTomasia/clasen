"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatBRL } from "@/lib/utils/formatting";
import type { PnLData, PnLRow } from "@/lib/queries/profit-and-loss";

// ─── Cards comparativos ───────────────────────────────────────────────────────

function ComparativeCard({
  label,
  current,
  previous,
  invert,
}: {
  label: string;
  current: number;
  previous: number;
  invert?: boolean; // para despesas: subir é ruim
}) {
  const diff = previous === 0 ? null : (current - previous) / Math.abs(previous);
  const isPositive = diff !== null && diff > 0;
  // Para despesas (invert=true), crescer é ruim → sinal vermelho; cair é verde.
  const colorClass =
    diff === null || diff === 0
      ? "text-muted-foreground"
      : invert
      ? isPositive
        ? "text-destructive"
        : "text-success"
      : isPositive
      ? "text-success"
      : "text-destructive";

  return (
    <div className="bg-card border rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold font-mono">{formatBRL(current)}</p>
      {diff !== null ? (
        <p className={`text-xs mt-0.5 ${colorClass}`}>
          {diff > 0 ? "+" : ""}
          {(diff * 100).toFixed(1)}% vs mês anterior
        </p>
      ) : (
        <p className="text-xs mt-0.5 text-muted-foreground">sem mês anterior</p>
      )}
    </div>
  );
}

// ─── Tooltip customizado ──────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "10px 14px",
        fontSize: "13px",
      }}
    >
      <p className="font-semibold mb-2">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill }}>
          {p.name}: {formatBRL(p.value)}
        </p>
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function MonthlyEvolutionChart({ pnl }: { pnl: PnLData }) {
  const rows = pnl.rows;
  const isEmpty = rows.every(
    (r) => r.receitaTotal === 0 && r.despesaTotal === 0
  );

  if (isEmpty) {
    return (
      <div className="bg-card border rounded-lg p-5">
        <h2 className="font-semibold mb-2">Evolução mensal</h2>
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nenhum dado financeiro ainda. O gráfico aparece conforme receitas e
          despesas são registradas.
        </p>
      </div>
    );
  }

  // Dois últimos meses com dados para os cards comparativos
  const withData = rows.filter(
    (r) => r.receitaTotal > 0 || r.despesaTotal > 0
  );
  const current: PnLRow | undefined = withData[withData.length - 1];
  const previous: PnLRow | undefined = withData[withData.length - 2];

  // Dados formatados para Recharts
  const chartData = rows.map((r) => ({
    label: r.label,
    "Rec. recorrente": r.receitaRecorrente,
    "Rec. avulsa": r.receitaAvulsa,
    "Despesa": r.despesaTotal,
    "Lucro": Math.max(r.lucroLiquido, 0), // barra positiva apenas; prejuízo fica em zero
    lucroRaw: r.lucroLiquido,
  }));

  return (
    <div className="space-y-4">
      {/* Cards comparativos */}
      {current && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ComparativeCard
            label={`Receita — ${current.label}`}
            current={current.receitaTotal}
            previous={previous?.receitaTotal ?? 0}
          />
          <ComparativeCard
            label={`Despesa — ${current.label}`}
            current={current.despesaTotal}
            previous={previous?.despesaTotal ?? 0}
            invert
          />
          <ComparativeCard
            label={`Lucro líquido — ${current.label}`}
            current={current.lucroLiquido}
            previous={previous?.lucroLiquido ?? 0}
          />
        </div>
      )}

      {/* Gráfico de barras agrupadas */}
      <div className="bg-card border rounded-lg p-5">
        <h2 className="font-semibold mb-4">Evolução mensal — Últimos 12 meses</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={chartData}
            margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
            barCategoryGap="20%"
            barGap={2}
          >
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
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
            />
            <Bar
              dataKey="Rec. recorrente"
              stackId="receita"
              fill="var(--primary)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="Rec. avulsa"
              stackId="receita"
              fill="var(--success, #22c55e)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="Despesa"
              fill="var(--destructive)"
              radius={[4, 4, 0, 0]}
              opacity={0.75}
            />
            <Bar
              dataKey="Lucro"
              fill="var(--accent, #f59e0b)"
              radius={[4, 4, 0, 0]}
              opacity={0.9}
            />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          Receita recorrente + avulsa empilhadas. Despesa e Lucro líquido (≥ 0)
          em barras separadas. Dados a partir de jan/2026.
        </p>
      </div>
    </div>
  );
}
