"use client";

import {
  BarChart,
  Bar,
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
import type { PnLData, PnLRow } from "@/lib/queries/profit-and-loss";

// ─── Series config ────────────────────────────────────────────────────────────
const SERIES = [
  { name: "Rec. recorrente", color: "var(--primary)" },
  { name: "Rec. avulsa", color: "#a3b545" },
  { name: "Despesa", color: "var(--destructive)" },
  { name: "Lucro", color: "#15803d" },
];
const SERIES_NAMES = SERIES.map((s) => s.name);

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
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-foreground">{s.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MonthlyEvolutionChart({ pnl, range }: { pnl: PnLData; range?: TimeRange }) {
  const rows = range
    ? pnl.rows.slice(range.fromIdx, range.toIdx + 1)
    : pnl.rows;
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

  const { isVisible, toggle } = useSeriesToggle(SERIES_NAMES);

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
        <h2 className="font-semibold mb-4 flex items-center gap-1.5">
          Evolução mensal
          <span
            className="text-muted-foreground text-xs cursor-help"
            title="Regime de caixa: receitas e despesas são contabilizadas na data do pagamento real (paymentDate), não na data da cobrança/contrato. Apenas registros com status 'pago' entram no gráfico."
          >
            ⓘ
          </span>
        </h2>
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
            {isVisible("Rec. recorrente") && (
              <Bar
                dataKey="Rec. recorrente"
                stackId="receita"
                fill="var(--primary)"
                radius={[0, 0, 0, 0]}
              />
            )}
            {isVisible("Rec. avulsa") && (
              <Bar
                dataKey="Rec. avulsa"
                stackId="receita"
                fill="#a3b545"
                radius={[4, 4, 0, 0]}
              />
            )}
            {isVisible("Despesa") && (
              <Bar
                dataKey="Despesa"
                fill="var(--destructive)"
                radius={[4, 4, 0, 0]}
                opacity={0.75}
              />
            )}
            {isVisible("Lucro") && (
              <Bar
                dataKey="Lucro"
                fill="#15803d"
                radius={[4, 4, 0, 0]}
                opacity={0.9}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
        <InteractiveLegend isVisible={isVisible} onToggle={toggle} />
        <p className="text-xs text-muted-foreground mt-2">
          Receita recorrente + avulsa empilhadas. Despesa e Lucro líquido (≥ 0)
          em barras separadas. Dados a partir de jan/2026.
        </p>
      </div>
    </div>
  );
}
