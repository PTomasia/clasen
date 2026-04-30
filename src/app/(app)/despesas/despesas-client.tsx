"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  Copy,
  ChevronRight,
  ChevronDown,
  Zap,
  LayoutList,
  LayoutGrid,
} from "lucide-react";
import { formatBRL, formatMonth } from "@/lib/utils/formatting";
import { cn } from "@/lib/utils";
import type { ExpenseRow, ExpensesSummary } from "@/lib/services/expenses";
import type { PnLData, PnLRow } from "@/lib/queries/profit-and-loss";
import { ExpenseDialog } from "./expense-dialog";
import { DeleteExpenseDialog } from "./delete-expense-dialog";
import {
  togglePaidExpenseAction,
  duplicateExpenseAction,
  launchRecurringExpensesAction,
} from "@/lib/actions/expenses";

interface Props {
  expenses: ExpenseRow[];
  summary: ExpensesSummary;
  pnl: PnLData;
  recurringPendingCount: number;
  currentMonth: string;
  nextMonth: string;
  previewsByMonth: Record<string, ExpenseRow[]>;
}

type ViewMode = "detalhado" | "agrupado";
type DialogMode = "avulsa" | "recorrente" | "parcelada";

export function DespesasClient({
  expenses,
  summary,
  pnl,
  recurringPendingCount,
  currentMonth,
  nextMonth,
  previewsByMonth,
}: Props) {
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>(currentMonth);
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | "pago" | "pendente">("todos");
  const [includePreview, setIncludePreview] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("detalhado");

  const [newOpen, setNewOpen] = useState(false);
  const [newDialogMode, setNewDialogMode] = useState<DialogMode>("avulsa");
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);
  const [repeatPicker, setRepeatPicker] = useState<ExpenseRow | null>(null);
  const [launching, setLaunching] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);

  // Persist viewMode em localStorage
  useEffect(() => {
    const stored = localStorage.getItem("despesas-view-mode");
    if (stored === "detalhado" || stored === "agrupado") setViewMode(stored);
  }, []);
  useEffect(() => {
    localStorage.setItem("despesas-view-mode", viewMode);
  }, [viewMode]);

  const months = useMemo(() => {
    const set = new Set<string>();
    set.add(currentMonth);
    set.add(nextMonth);
    Object.keys(previewsByMonth).forEach((m) => set.add(m));
    for (const e of expenses) set.add(e.month);
    return Array.from(set).sort().reverse();
  }, [expenses, currentMonth, nextMonth, previewsByMonth]);

  const activePreviews = useMemo(() => {
    if (monthFilter === "todos" || !includePreview) return [];
    return previewsByMonth[monthFilter] ?? [];
  }, [monthFilter, includePreview, previewsByMonth]);

  const hasPreviewsForCurrentFilter =
    monthFilter !== "todos" && (previewsByMonth[monthFilter]?.length ?? 0) > 0;

  async function handleTogglePaid(id: number) {
    setToggling(id);
    try {
      await togglePaidExpenseAction(id);
    } finally {
      setToggling(null);
    }
  }

  async function handleDuplicate(id: number, targetMonth: string) {
    await duplicateExpenseAction(id, targetMonth);
  }

  async function handleLaunchRecurring() {
    setLaunching(true);
    try {
      await launchRecurringExpensesAction(currentMonth);
    } finally {
      setLaunching(false);
    }
  }

  function handleNewDespesa(mode: DialogMode) {
    setNewDialogMode(mode);
    setNewOpen(true);
  }

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (search) {
        const s = search.toLowerCase();
        if (!e.description.toLowerCase().includes(s)) return false;
      }
      if (monthFilter !== "todos" && e.month !== monthFilter) return false;
      if (categoryFilter !== "todos" && e.category !== categoryFilter) return false;
      if (statusFilter === "pago" && !e.isPaid) return false;
      if (statusFilter === "pendente" && e.isPaid) return false;
      return true;
    });
  }, [expenses, search, monthFilter, categoryFilter, statusFilter]);

  const totalFiltrado = filtered.reduce((s, e) => s + (e.isPaid ? e.amount : 0), 0);

  // Total despesa do mês selecionado (todas, não filtradas) — usado para % do mês
  const totalDespesaMes = useMemo(() => {
    const target = monthFilter === "todos" ? currentMonth : monthFilter;
    return expenses
      .filter((e) => e.month === target)
      .reduce((s, e) => s + e.amount, 0);
  }, [expenses, monthFilter, currentMonth]);

  // Hero data — derivado do mês selecionado
  const heroMonth = monthFilter === "todos" ? currentMonth : monthFilter;
  const heroIdx = pnl.rows.findIndex((r) => r.month === heroMonth);
  const heroRow = heroIdx >= 0 ? pnl.rows[heroIdx] : pnl.rows[pnl.rows.length - 1];
  const prevRow = heroRow ? pnl.rows[pnl.rows.findIndex((r) => r.month === heroRow.month) - 1] : null;

  const heroData = useMemo(() => {
    if (!heroRow) return null;
    const deltaPct = (cur: number, prev: number | undefined) =>
      prev != null && prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null;
    const margemAtual =
      heroRow.margemLiquida != null ? heroRow.margemLiquida * 100 : null;
    const margemPrev =
      prevRow?.margemLiquida != null ? prevRow.margemLiquida * 100 : null;
    const deltaMargemPp =
      margemAtual != null && margemPrev != null ? margemAtual - margemPrev : null;

    const pendentesDoMes = expenses.filter(
      (e) => e.month === heroRow.month && !e.isPaid
    );
    const pendentesTotal = pendentesDoMes.reduce((s, e) => s + e.amount, 0);

    return {
      month: heroRow.month,
      label: formatMonth(heroRow.month),
      receita: heroRow.receitaTotal,
      despesa: heroRow.despesaTotal,
      lucro: heroRow.lucroLiquido,
      margem: margemAtual,
      deltaReceita: deltaPct(heroRow.receitaTotal, prevRow?.receitaTotal),
      deltaDespesa: deltaPct(heroRow.despesaTotal, prevRow?.despesaTotal),
      deltaLucro: deltaPct(heroRow.lucroLiquido, prevRow?.lucroLiquido),
      deltaMargemPp,
      pendentesTotal,
      pendentesCount: pendentesDoMes.length,
    };
  }, [heroRow, prevRow, expenses]);

  const recurringForHero =
    heroRow?.month === currentMonth ? recurringPendingCount : 0;

  return (
    <>
      {/* ── Hero + Tendência ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DespesasHeroCard
            data={heroData}
            recurringPendingCount={recurringForHero}
            launching={launching}
            onLaunchRecurring={handleLaunchRecurring}
          />
        </div>
        <TendenciaPanel pnl={pnl} currentMonth={heroRow?.month ?? currentMonth} />
      </div>

      {/* ── Filtros + ações ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar descrição"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {months.length > 0 && (
          <Select value={monthFilter} onValueChange={(v) => v && setMonthFilter(v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonth(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasPreviewsForCurrentFilter && (
          <label
            className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none"
            title="Mostrar despesas recorrentes que ainda não foram lançadas neste mês"
          >
            <input
              type="checkbox"
              checked={includePreview}
              onChange={(e) => setIncludePreview(e.target.checked)}
              className="w-4 h-4"
            />
            <span>
              Incluir previsão
              <span className="ml-1 text-[10px] text-muted-foreground/70">
                ({previewsByMonth[monthFilter]?.length ?? 0})
              </span>
            </span>
          </label>
        )}

        <Select value={categoryFilter} onValueChange={(v) => v && setCategoryFilter(v)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="fixo">Fixo</SelectItem>
            <SelectItem value="variavel">Variável</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "todos" | "pago" | "pendente")}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pago">Pagas</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
          </SelectContent>
        </Select>

        <ViewToggle value={viewMode} onChange={setViewMode} />

        <NewExpenseMenu onPick={handleNewDespesa} />
      </div>

      {/* ── Lista (Detalhada ou Agrupada) ── */}
      {viewMode === "detalhado" ? (
        <ExpensesTableDetalhada
          filtered={filtered}
          activePreviews={activePreviews}
          totalDespesaMes={totalDespesaMes}
          monthFilter={monthFilter}
          toggling={toggling}
          onTogglePaid={handleTogglePaid}
          onEdit={setEditing}
          onDelete={setDeleting}
          onRepeat={setRepeatPicker}
          totalFiltrado={totalFiltrado}
        />
      ) : (
        <GroupedExpensesView
          filtered={filtered}
          totalDespesaMes={totalDespesaMes}
          onEdit={setEditing}
          onDelete={setDeleting}
        />
      )}

      {/* ── P&L 12m colapsada ── */}
      <details className="group bg-card border rounded-lg">
        <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium flex items-center gap-2 list-none">
          <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
          Resultado mensal — 12 meses
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            Lucro 12m:{" "}
            <strong className={cn("font-mono", pnl.totals.lucroTotal < 0 ? "text-destructive" : "text-success")}>
              {formatBRL(pnl.totals.lucroTotal)}
            </strong>
            {" · "}
            {pnl.totals.mesesNoLucro}/{pnl.totals.mesesNoLucro + pnl.totals.mesesNoPrejuizo} no lucro
          </span>
        </summary>
        <div className="border-t overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Desp. fixa</TableHead>
                <TableHead className="text-right">Desp. variável</TableHead>
                <TableHead className="text-right">Total desp.</TableHead>
                <TableHead className="text-right">Lucro líquido</TableHead>
                <TableHead className="text-right">Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pnl.rows.map((row) => {
                const isNegative = row.lucroLiquido < 0;
                const isPositive = row.lucroLiquido > 0;
                return (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right font-mono">
                      {row.receitaTotal > 0 ? (
                        formatBRL(row.receitaTotal)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.despesaFixa > 0 ? (
                        formatBRL(row.despesaFixa)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.despesaVariavel > 0 ? (
                        formatBRL(row.despesaVariavel)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.despesaTotal > 0 ? (
                        formatBRL(row.despesaTotal)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono font-semibold",
                        isNegative ? "text-destructive" : isPositive ? "text-success" : "text-muted-foreground"
                      )}
                    >
                      {row.receitaTotal === 0 && row.despesaTotal === 0 ? (
                        <span className="font-normal text-muted-foreground">—</span>
                      ) : (
                        formatBRL(row.lucroLiquido)
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono",
                        row.margemLiquida !== null && row.margemLiquida >= 0.2
                          ? "text-success"
                          : isNegative
                            ? "text-destructive"
                            : ""
                      )}
                    >
                      {row.margemLiquida !== null ? (
                        `${(row.margemLiquida * 100).toFixed(0)}%`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="px-4 py-3 border-t bg-muted/30 grid grid-cols-7 text-xs font-semibold">
            <span>Total 12m</span>
            <span className="text-right font-mono">{formatBRL(pnl.totals.receitaTotal)}</span>
            <span className="text-right font-mono">{formatBRL(pnl.totals.despesaFixaTotal)}</span>
            <span className="text-right font-mono">{formatBRL(pnl.totals.despesaVariavelTotal)}</span>
            <span className="text-right font-mono">{formatBRL(pnl.totals.despesaTotal)}</span>
            <span className={cn("text-right font-mono", pnl.totals.lucroTotal < 0 ? "text-destructive" : "text-success")}>
              {formatBRL(pnl.totals.lucroTotal)}
            </span>
            <span className="text-right font-mono">
              {pnl.totals.margemMedia !== null ? `${(pnl.totals.margemMedia * 100).toFixed(0)}%` : "—"}
            </span>
          </div>
        </div>
      </details>

      {/* ── Dialogs ── */}
      <ExpenseDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        defaultMode={newDialogMode === "parcelada" ? "parcelado" : "avista"}
        defaultIsRecurring={newDialogMode === "recorrente"}
      />
      <ExpenseDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        editing={editing}
      />
      <DeleteExpenseDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        expense={deleting}
      />
      {repeatPicker && (
        <RepeatMonthPickerPopover
          expense={repeatPicker}
          onClose={() => setRepeatPicker(null)}
          onConfirm={async (targetMonth) => {
            await handleDuplicate(repeatPicker.id, targetMonth);
            setRepeatPicker(null);
          }}
        />
      )}
    </>
  );
}

// ─── Hero Card ────────────────────────────────────────────────────────────────

type HeroData = {
  month: string;
  label: string;
  receita: number;
  despesa: number;
  lucro: number;
  margem: number | null;
  deltaReceita: number | null;
  deltaDespesa: number | null;
  deltaLucro: number | null;
  deltaMargemPp: number | null;
  pendentesTotal: number;
  pendentesCount: number;
};

function DespesasHeroCard({
  data,
  recurringPendingCount,
  launching,
  onLaunchRecurring,
}: {
  data: HeroData | null;
  recurringPendingCount: number;
  launching: boolean;
  onLaunchRecurring: () => void;
}) {
  if (!data) {
    return (
      <div className="bg-card border rounded-xl p-7 md:p-8 h-full flex items-center justify-center text-muted-foreground">
        Sem dados para o mês selecionado.
      </div>
    );
  }

  const isProfit = data.lucro >= 0;
  const valueColor = isProfit ? "text-success" : "text-destructive";

  return (
    <div className="bg-card border rounded-xl p-7 md:p-8 h-full flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col justify-center">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Lucro de {data.label}
          </p>
          {data.deltaLucro !== null && (
            <DeltaChip value={data.deltaLucro} unit="%" inverted={false} />
          )}
        </div>

        <p
          className={cn(
            "mt-2 text-5xl md:text-6xl font-medium leading-none tracking-tight tabular-nums",
            valueColor
          )}
          style={{ fontFamily: "var(--font-heading), serif" }}
        >
          {formatBRL(data.lucro)}
        </p>

        <p className="text-xs text-muted-foreground mt-3">
          Receita <span className="font-mono tabular-nums">{formatBRL(data.receita)}</span>
          {" · "}
          Despesa <span className="font-mono tabular-nums">{formatBRL(data.despesa)}</span>
          {data.margem !== null && (
            <>
              {" · "}
              Margem <span className="font-mono tabular-nums">{data.margem.toFixed(0)}%</span>
            </>
          )}
        </p>

        {/* CTA inline para fixas pendentes */}
        {recurringPendingCount > 0 && (
          <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
            <Zap size={14} className="text-primary" />
            <span className="text-xs flex-1">
              <strong className="font-semibold">{recurringPendingCount}</strong>{" "}
              {recurringPendingCount === 1 ? "fixa pendente" : "fixas pendentes"} para {data.label}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={launching}
              onClick={onLaunchRecurring}
            >
              <RefreshCw size={12} className={launching ? "animate-spin" : ""} />
              Lançar
            </Button>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="mt-6 pt-5 border-t">
        <div className="grid grid-cols-3 divide-x">
          <StatColumn
            label="Pendentes"
            value={formatBRL(data.pendentesTotal)}
            sub={
              data.pendentesCount > 0
                ? `${data.pendentesCount} ${data.pendentesCount === 1 ? "lançamento" : "lançamentos"}`
                : "Sem pendências"
            }
            tone={data.pendentesTotal > 0 ? "accent" : "default"}
            position="first"
          />
          <StatColumn
            label="Despesa"
            value={formatBRL(data.despesa)}
            sub={
              data.deltaDespesa !== null
                ? `${data.deltaDespesa >= 0 ? "+" : ""}${data.deltaDespesa.toFixed(1)}% vs mês anterior`
                : "Sem comparação"
            }
            position="middle"
          />
          <StatColumn
            label="Margem"
            value={data.margem !== null ? `${data.margem.toFixed(0)}%` : "—"}
            sub={
              data.deltaMargemPp !== null
                ? `${data.deltaMargemPp >= 0 ? "+" : ""}${data.deltaMargemPp.toFixed(1)}pp vs mês anterior`
                : undefined
            }
            tone={data.margem != null && data.margem >= 20 ? "primary" : "default"}
            position="last"
          />
        </div>
      </div>
    </div>
  );
}

function StatColumn({
  label,
  value,
  sub,
  tone = "default",
  position = "middle",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "accent";
  position?: "first" | "middle" | "last";
}) {
  const valueColor =
    tone === "primary" ? "text-primary" : tone === "accent" ? "text-accent" : "";
  const padding =
    position === "first" ? "pr-4" : position === "last" ? "pl-4" : "px-4";

  return (
    <div className={cn("flex flex-col gap-1 text-left", padding)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn("text-xl leading-none tracking-tight font-medium tabular-nums", valueColor)}
        style={{ fontFamily: "var(--font-heading), serif" }}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function DeltaChip({
  value,
  unit,
  inverted = false,
}: {
  value: number;
  unit: "%" | "pp";
  inverted?: boolean;
}) {
  const isPositive = value > 0;
  const isGood = inverted ? !isPositive : isPositive;
  const sign = isPositive ? "+" : "";
  const color =
    Math.abs(value) < 0.1
      ? "text-muted-foreground bg-muted/50"
      : isGood
        ? "text-success bg-success/10"
        : "text-destructive bg-destructive/10";
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold tabular-nums",
        color
      )}
    >
      {sign}
      {value.toFixed(1)}
      {unit}
    </span>
  );
}

// ─── Painel: Tendência 12 meses ───────────────────────────────────────────────

function TendenciaPanel({ pnl, currentMonth }: { pnl: PnLData; currentMonth: string }) {
  const rows = pnl.rows;
  const maxDespesa = Math.max(...rows.map((r) => r.despesaTotal), 1);
  const totalMonths = rows.length;
  const receitaMedia = rows.reduce((s, r) => s + r.receitaTotal, 0) / Math.max(totalMonths, 1);
  const despesaMedia = rows.reduce((s, r) => s + r.despesaTotal, 0) / Math.max(totalMonths, 1);
  const margemMedia = pnl.totals.margemMedia != null ? pnl.totals.margemMedia * 100 : null;

  const W = 240;
  const H = 64;
  const gap = 3;
  const barW = (W - gap * (totalMonths - 1)) / totalMonths;

  return (
    <div className="bg-card border rounded-xl p-6 h-full flex flex-col">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Tendência 12 meses
      </p>

      <div className="mt-4 mb-4">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-16">
          {rows.map((r, i) => {
            const h = maxDespesa > 0 ? (r.despesaTotal / maxDespesa) * H : 0;
            const isCurrent = r.month === currentMonth;
            return (
              <rect
                key={r.month}
                x={i * (barW + gap)}
                y={H - h}
                width={barW}
                height={h}
                rx={1}
                className={cn(
                  isCurrent ? "fill-accent" : "fill-muted-foreground/30 hover:fill-muted-foreground/50"
                )}
              >
                <title>
                  {r.label} · Despesa {formatBRL(r.despesaTotal)} · Lucro {formatBRL(r.lucroLiquido)}
                </title>
              </rect>
            );
          })}
        </svg>
      </div>

      <div className="flex-1 flex flex-col justify-end gap-2 text-xs">
        <TendenciaStat label="Receita média" value={formatBRL(receitaMedia)} />
        <TendenciaStat label="Despesa média" value={formatBRL(despesaMedia)} />
        <TendenciaStat
          label="Margem média"
          value={margemMedia !== null ? `${margemMedia.toFixed(0)}%` : "—"}
        />
        <TendenciaStat
          label="Meses no lucro"
          value={`${pnl.totals.mesesNoLucro}/${pnl.totals.mesesNoLucro + pnl.totals.mesesNoPrejuizo}`}
        />
      </div>
    </div>
  );
}

function TendenciaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums">{value}</span>
    </div>
  );
}

// ─── ViewToggle ───────────────────────────────────────────────────────────────

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="inline-flex h-9 rounded-md border bg-background p-0.5">
      <button
        type="button"
        onClick={() => onChange("detalhado")}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 text-xs rounded transition-colors",
          value === "detalhado" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
        )}
        title="Lista detalhada linha-a-linha"
      >
        <LayoutList size={13} />
        Detalhado
      </button>
      <button
        type="button"
        onClick={() => onChange("agrupado")}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 text-xs rounded transition-colors",
          value === "agrupado" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
        )}
        title="Agrupado por categoria"
      >
        <LayoutGrid size={13} />
        Agrupado
      </button>
    </div>
  );
}

// ─── Submenu: + Nova despesa ──────────────────────────────────────────────────

function NewExpenseMenu({ onPick }: { onPick: (mode: DialogMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const items: { mode: DialogMode; label: string; hint: string }[] = [
    { mode: "avulsa", label: "Avulsa", hint: "Despesa única do mês" },
    { mode: "recorrente", label: "Recorrente", hint: "Lança automaticamente todo mês" },
    { mode: "parcelada", label: "Parcelada", hint: "Divide em N parcelas" },
  ];

  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen((v) => !v)}>
        <Plus size={16} /> Nova despesa <ChevronDown size={14} className="opacity-70" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 min-w-[220px] rounded-lg border bg-popover shadow-xl p-1">
          {items.map((it) => (
            <button
              key={it.mode}
              type="button"
              onClick={() => {
                onPick(it.mode);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded hover:bg-muted/60 transition-colors"
            >
              <p className="text-sm font-medium">{it.label}</p>
              <p className="text-[11px] text-muted-foreground">{it.hint}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tabela detalhada ─────────────────────────────────────────────────────────

function ExpensesTableDetalhada({
  filtered,
  activePreviews,
  totalDespesaMes,
  monthFilter,
  toggling,
  onTogglePaid,
  onEdit,
  onDelete,
  onRepeat,
  totalFiltrado,
}: {
  filtered: ExpenseRow[];
  activePreviews: ExpenseRow[];
  totalDespesaMes: number;
  monthFilter: string;
  toggling: number | null;
  onTogglePaid: (id: number) => void;
  onEdit: (e: ExpenseRow) => void;
  onDelete: (e: ExpenseRow) => void;
  onRepeat: (e: ExpenseRow) => void;
  totalFiltrado: number;
}) {
  const showPercentage = monthFilter !== "todos" && totalDespesaMes > 0;

  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mês</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            {showPercentage && <TableHead className="text-right">% mês</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && activePreviews.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showPercentage ? 7 : 6} className="text-center text-muted-foreground py-8">
                Nenhuma despesa encontrada.
              </TableCell>
            </TableRow>
          ) : (
            <>
              {filtered.map((e) => {
                const pct = showPercentage ? (e.amount / totalDespesaMes) * 100 : null;
                const isInstallment = e.installmentsTotal != null && e.installmentNumber != null;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{formatMonth(e.month)}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{e.description}</span>
                        {isInstallment && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-primary/10 text-primary tabular-nums"
                            title={`Parcela ${e.installmentNumber} de ${e.installmentsTotal}`}
                          >
                            {e.installmentNumber}/{e.installmentsTotal}
                          </span>
                        )}
                        {e.isRecurring && !isInstallment && (
                          <span
                            className="text-xs text-muted-foreground"
                            title="Despesa recorrente"
                          >
                            ↻
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          e.category === "fixo"
                            ? "border-primary/30 text-primary bg-primary/5"
                            : "border-muted-foreground/30 text-muted-foreground"
                        }
                      >
                        {e.category === "fixo" ? "Fixo" : "Variável"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatBRL(e.amount)}</TableCell>
                    {showPercentage && (
                      <TableCell
                        className={cn(
                          "text-right font-mono text-xs tabular-nums",
                          pct! >= 20 ? "text-accent font-semibold" : "text-muted-foreground"
                        )}
                      >
                        {pct!.toFixed(1)}%
                      </TableCell>
                    )}
                    <TableCell>
                      <button
                        className="flex items-center gap-2 group"
                        disabled={toggling === e.id}
                        onClick={() => onTogglePaid(e.id)}
                        title="Clique para alternar status"
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={e.isPaid}
                          className="w-4 h-4 pointer-events-none"
                        />
                        <span className={`text-xs ${e.isPaid ? "text-success" : "text-accent-foreground"}`}>
                          {e.isPaid ? "Paga" : "Pendente"}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          title="Repetir em outro mês"
                          onClick={() => onRepeat(e)}
                        >
                          <Copy size={14} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(e)}>
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => onDelete(e)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {activePreviews.map((e) => (
                <TableRow key={`preview-${e.month}-${e.description}`} className="bg-muted/20">
                  <TableCell className="font-mono text-xs italic text-muted-foreground">
                    {formatMonth(e.month)}
                  </TableCell>
                  <TableCell className="italic text-muted-foreground">
                    {e.description}
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-muted text-muted-foreground border">
                      preview
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground italic">
                      {e.category === "fixo" ? "Fixo" : "Variável"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono italic text-muted-foreground tabular-nums">
                    {formatBRL(e.amount)}
                  </TableCell>
                  {showPercentage && <TableCell />}
                  <TableCell>
                    <span className="text-xs italic text-muted-foreground">a lançar</span>
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </>
          )}
        </TableBody>
      </Table>
      {(filtered.length > 0 || activePreviews.length > 0) && (
        <div className="px-4 py-2.5 border-t text-xs text-muted-foreground flex justify-between flex-wrap gap-2">
          <span>
            {filtered.length} {filtered.length === 1 ? "despesa" : "despesas"}
            {activePreviews.length > 0 && (
              <span className="ml-2">
                + {activePreviews.length} preview{activePreviews.length === 1 ? "" : "s"}
              </span>
            )}
          </span>
          <span>
            Total (pagas): <strong>{formatBRL(totalFiltrado)}</strong>
            {activePreviews.length > 0 && (
              <span className="ml-3">
                + previsto:{" "}
                <strong>{formatBRL(activePreviews.reduce((s, e) => s + e.amount, 0))}</strong>
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Modo Agrupado ────────────────────────────────────────────────────────────

type GroupedItem =
  | {
      kind: "single";
      key: string;
      expense: ExpenseRow;
      amount: number;
    }
  | {
      kind: "installment-group";
      key: string;
      groupId: string;
      description: string;
      category: "fixo" | "variavel";
      installments: ExpenseRow[];
      total: number;
      installmentValue: number;
      currentInstallment: ExpenseRow;
    };

function GroupedExpensesView({
  filtered,
  totalDespesaMes,
  onEdit,
  onDelete,
}: {
  filtered: ExpenseRow[];
  totalDespesaMes: number;
  onEdit: (e: ExpenseRow) => void;
  onDelete: (e: ExpenseRow) => void;
}) {
  // Group by category, then within: collapse installments by groupId
  const grouped = useMemo(() => {
    const byCat: Record<"fixo" | "variavel", GroupedItem[]> = {
      fixo: [],
      variavel: [],
    };

    // Index installments by groupId (so we can collapse all installments of same series in current view)
    const installmentMap = new Map<string, ExpenseRow[]>();
    for (const e of filtered) {
      if (e.installmentGroupId) {
        const arr = installmentMap.get(e.installmentGroupId) ?? [];
        arr.push(e);
        installmentMap.set(e.installmentGroupId, arr);
      }
    }

    const seenGroups = new Set<string>();
    for (const e of filtered) {
      if (e.installmentGroupId) {
        if (seenGroups.has(e.installmentGroupId)) continue;
        seenGroups.add(e.installmentGroupId);
        const series = installmentMap.get(e.installmentGroupId)!;
        const sorted = [...series].sort(
          (a, b) => (a.installmentNumber ?? 0) - (b.installmentNumber ?? 0)
        );
        // The "representative" installment is the one in the current view (use first in series shown)
        const rep = sorted[0];
        byCat[e.category].push({
          kind: "installment-group",
          key: `inst-${e.installmentGroupId}`,
          groupId: e.installmentGroupId,
          description: e.description,
          category: e.category,
          installments: sorted,
          total: sorted.reduce((s, x) => s + x.amount, 0),
          installmentValue: rep.amount,
          currentInstallment: rep,
        });
      } else {
        byCat[e.category].push({
          kind: "single",
          key: `single-${e.id}`,
          expense: e,
          amount: e.amount,
        });
      }
    }

    // Sort each category by amount desc
    (["fixo", "variavel"] as const).forEach((cat) => {
      byCat[cat].sort((a, b) => {
        const aAmt = a.kind === "single" ? a.amount : a.installmentValue;
        const bAmt = b.kind === "single" ? b.amount : b.installmentValue;
        return bAmt - aAmt;
      });
    });

    const totalFixo = byCat.fixo.reduce(
      (s, item) =>
        s + (item.kind === "single" ? item.amount : item.installmentValue),
      0
    );
    const totalVariavel = byCat.variavel.reduce(
      (s, item) =>
        s + (item.kind === "single" ? item.amount : item.installmentValue),
      0
    );

    return {
      fixo: { items: byCat.fixo, total: totalFixo },
      variavel: { items: byCat.variavel, total: totalVariavel },
    };
  }, [filtered]);

  if (filtered.length === 0) {
    return (
      <div className="bg-card border rounded-lg py-12 text-center text-muted-foreground">
        Nenhuma despesa encontrada para este filtro.
      </div>
    );
  }

  const hasFixo = grouped.fixo.items.length > 0;
  const hasVariavel = grouped.variavel.items.length > 0;
  const totalGeral = grouped.fixo.total + grouped.variavel.total;

  return (
    <div className="space-y-3">
      {hasFixo && (
        <CategoryGroup
          title="Fixas"
          tone="primary"
          total={grouped.fixo.total}
          totalDespesaMes={totalDespesaMes}
          items={grouped.fixo.items}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
      {hasVariavel && (
        <CategoryGroup
          title="Variáveis"
          tone="muted"
          total={grouped.variavel.total}
          totalDespesaMes={totalDespesaMes}
          items={grouped.variavel.items}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
      <div className="bg-muted/20 border rounded-lg px-5 py-3 flex items-center justify-between text-sm">
        <span className="font-semibold">Total</span>
        <span className="font-mono font-semibold tabular-nums">{formatBRL(totalGeral)}</span>
      </div>
    </div>
  );
}

function CategoryGroup({
  title,
  tone,
  total,
  totalDespesaMes,
  items,
  onEdit,
  onDelete,
}: {
  title: string;
  tone: "primary" | "muted";
  total: number;
  totalDespesaMes: number;
  items: GroupedItem[];
  onEdit: (e: ExpenseRow) => void;
  onDelete: (e: ExpenseRow) => void;
}) {
  const pct = totalDespesaMes > 0 ? (total / totalDespesaMes) * 100 : 0;
  const headerColor = tone === "primary" ? "text-primary" : "text-muted-foreground";

  return (
    <details open className="group bg-card border rounded-lg">
      <summary className="cursor-pointer select-none px-5 py-3 flex items-center gap-3 list-none border-b group-open:border-b border-transparent">
        <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
        <h3 className={cn("font-semibold text-sm", headerColor)}>{title}</h3>
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "itens"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {pct > 0 && `${pct.toFixed(0)}% do mês`}
        </span>
        <span className="font-mono font-semibold text-sm tabular-nums w-28 text-right">
          {formatBRL(total)}
        </span>
      </summary>
      <ul className="divide-y">
        {items.map((item) => (
          <GroupedExpenseRow
            key={item.key}
            item={item}
            totalDespesaMes={totalDespesaMes}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </details>
  );
}

function GroupedExpenseRow({
  item,
  totalDespesaMes,
  onEdit,
  onDelete,
}: {
  item: GroupedItem;
  totalDespesaMes: number;
  onEdit: (e: ExpenseRow) => void;
  onDelete: (e: ExpenseRow) => void;
}) {
  if (item.kind === "single") {
    return (
      <SingleExpenseRow
        expense={item.expense}
        totalDespesaMes={totalDespesaMes}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );
  }
  return (
    <InstallmentGroupRow
      item={item}
      totalDespesaMes={totalDespesaMes}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}

function SingleExpenseRow({
  expense,
  totalDespesaMes,
  onEdit,
  onDelete,
}: {
  expense: ExpenseRow;
  totalDespesaMes: number;
  onEdit: (e: ExpenseRow) => void;
  onDelete: (e: ExpenseRow) => void;
}) {
  const e = expense;
  const pct = totalDespesaMes > 0 ? (e.amount / totalDespesaMes) * 100 : 0;
  return (
    <li className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/30">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate flex items-center gap-2">
          {e.description}
          {e.isRecurring && (
            <span className="text-xs text-muted-foreground" title="Recorrente">
              ↻
            </span>
          )}
          {!e.isPaid && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider bg-accent/15 text-accent">
              pendente
            </span>
          )}
        </p>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
        {pct > 0 ? `${pct.toFixed(0)}%` : ""}
      </span>
      <span className="font-mono text-sm tabular-nums w-28 text-right">
        {formatBRL(e.amount)}
      </span>
      <div className="inline-flex gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(e)}>
          <Pencil size={12} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => onDelete(e)}
        >
          <Trash2 size={12} />
        </Button>
      </div>
    </li>
  );
}

function InstallmentGroupRow({
  item,
  totalDespesaMes,
  onEdit,
  onDelete,
}: {
  item: Extract<GroupedItem, { kind: "installment-group" }>;
  totalDespesaMes: number;
  onEdit: (e: ExpenseRow) => void;
  onDelete: (e: ExpenseRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const pct = totalDespesaMes > 0 ? (item.installmentValue / totalDespesaMes) * 100 : 0;
  return (
    <li>
      <div className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/30">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center justify-center w-5 h-5 -ml-1 text-muted-foreground hover:text-foreground"
          aria-label={open ? "Recolher série" : "Expandir série"}
        >
          <ChevronRight
            size={12}
            className={cn("transition-transform", open && "rotate-90")}
          />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate flex items-center gap-2">
            {item.description}
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-primary/10 text-primary tabular-nums">
              {item.currentInstallment.installmentNumber}/{item.currentInstallment.installmentsTotal}
            </span>
            <span className="text-[10px] text-muted-foreground">
              · Total série {formatBRL(item.total)}
            </span>
          </p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
          {pct > 0 ? `${pct.toFixed(0)}%` : ""}
        </span>
        <span className="font-mono text-sm tabular-nums w-28 text-right">
          {formatBRL(item.installmentValue)}
        </span>
        <div className="inline-flex gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(item.currentInstallment)}
          >
            <Pencil size={12} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(item.currentInstallment)}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
      {open && (
        <ul className="bg-muted/20 px-5 py-1.5 text-xs">
          {item.installments.map((inst) => (
            <li
              key={inst.id}
              className="flex items-center gap-3 py-1 text-muted-foreground"
            >
              <span className="w-5" />
              <span className="font-mono">{formatMonth(inst.month)}</span>
              <span className="font-mono">
                {inst.installmentNumber}/{inst.installmentsTotal}
              </span>
              {!inst.isPaid && (
                <span className="text-[10px] uppercase tracking-wider text-accent">
                  pendente
                </span>
              )}
              <span className="ml-auto font-mono tabular-nums">{formatBRL(inst.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── Repeat month picker ──────────────────────────────────────────────────────

function RepeatMonthPickerPopover({
  expense,
  onClose,
  onConfirm,
}: {
  expense: ExpenseRow;
  onClose: () => void;
  onConfirm: (month: string) => void | Promise<void>;
}) {
  const [target, setTarget] = useState<string>(() => {
    const [y, m] = expense.month.split("-").map(Number);
    const d = new Date(y, m, 1); // next month after expense.month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Generate next 12 months from expense.month
  const options = useMemo(() => {
    const [y, m] = expense.month.split("-").map(Number);
    const out: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const d = new Date(y, m - 1 + i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, [expense.month]);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div ref={ref} className="bg-card border rounded-lg shadow-xl p-5 w-full max-w-sm space-y-4">
        <div>
          <h3 className="text-base font-semibold">Repetir em outro mês</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            "{expense.description}" · {formatBRL(expense.amount)}
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mês destino
          </label>
          <Select value={target} onValueChange={(v) => v && setTarget(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonth(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(target)}>Repetir</Button>
        </div>
      </div>
    </div>
  );
}
