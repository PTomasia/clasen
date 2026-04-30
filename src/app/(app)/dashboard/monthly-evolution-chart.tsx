"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
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

// ─── Compact value formatter ──────────────────────────────────────────────────
// 10300 → "10,3k" · 950 → "950" · 0 → ""

function formatCompactBRL(v: number): string {
  if (!v || v === 0) return "";
  if (Math.abs(v) >= 1000) {
    return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return v.toFixed(0);
}

// Recharts 3 LabelList content props para barras stackeadas
type StackLabelProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  value?: number;
};

type ChartRow = {
  label: string;
  "Rec. recorrente": number;
  "Rec. avulsa": number;
  Despesa: number;
  Lucro: number;
  lucroRaw: number;
  receitaTotal: number;
};

// Renderer custom para o total de receita acima de uma barra do stack.
// Decide por linha (via `shouldRender`) se a label aparece nesta barra ou
// na sibling. Posiciona o texto acima do segmento usando os props de
// geometria que o Recharts injeta.
function renderStackTotalLabel(
  props: StackLabelProps,
  chartData: ChartRow[],
  shouldRender: (row: ChartRow) => boolean,
  fill: string
) {
  const idx = props.index ?? -1;
  const row = chartData[idx];
  if (!row) return null;
  if (!shouldRender(row)) return null;
  const total = row.receitaTotal ?? 0;
  const text = formatCompactBRL(total);
  if (!text) return null;
  const x = (props.x ?? 0) + (props.width ?? 0) / 2;
  const y = (props.y ?? 0) - 4;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={10}
      fontWeight={600}
      fill={fill}
    >
      {text}
    </text>
  );
}

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
    receitaTotal: r.receitaTotal,
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
            margin={{ top: 18, right: 10, left: 10, bottom: 5 }}
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
              >
                {/* Receita total (recorrente + avulsa) renderiza nesta barra
                    quando avulsa = 0 ou está oculta — caso contrário o label
                    fica na barra avulsa (topo do stack). Recharts 3 removeu
                    label.valueAccessor; LabelList com content é a API canônica. */}
                <LabelList
                  dataKey="receitaTotal"
                  content={(props: object) =>
                    renderStackTotalLabel(
                      props as StackLabelProps,
                      chartData,
                      (row) =>
                        !isVisible("Rec. avulsa") ||
                        (row["Rec. avulsa"] ?? 0) === 0,
                      "var(--primary)"
                    )
                  }
                />
              </Bar>
            )}
            {isVisible("Rec. avulsa") && (
              <Bar
                dataKey="Rec. avulsa"
                stackId="receita"
                fill="#a3b545"
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="receitaTotal"
                  content={(props: object) =>
                    renderStackTotalLabel(
                      props as StackLabelProps,
                      chartData,
                      (row) => (row["Rec. avulsa"] ?? 0) > 0,
                      "var(--primary)"
                    )
                  }
                />
              </Bar>
            )}
            {isVisible("Despesa") && (
              <Bar
                dataKey="Despesa"
                fill="var(--destructive)"
                radius={[4, 4, 0, 0]}
                opacity={0.75}
              >
                <LabelList
                  dataKey="Despesa"
                  position="top"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--destructive)"
                  formatter={(v: unknown) =>
                    formatCompactBRL(typeof v === "number" ? v : 0)
                  }
                />
              </Bar>
            )}
            {isVisible("Lucro") && (
              <Bar
                dataKey="Lucro"
                fill="#15803d"
                radius={[4, 4, 0, 0]}
                opacity={0.9}
              >
                <LabelList
                  dataKey="Lucro"
                  position="top"
                  fontSize={10}
                  fontWeight={600}
                  fill="#15803d"
                  formatter={(v: unknown) =>
                    formatCompactBRL(typeof v === "number" ? v : 0)
                  }
                />
              </Bar>
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
