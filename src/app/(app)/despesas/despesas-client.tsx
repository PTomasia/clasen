"use client";

import { useState, useMemo } from "react";
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
import { Plus, Pencil, Trash2, Search, TrendingUp, TrendingDown, RefreshCw, Copy } from "lucide-react";
import { formatBRL } from "@/lib/utils/formatting";
import type { ExpenseRow, ExpensesSummary } from "@/lib/services/expenses";
import type { PnLData } from "@/lib/queries/profit-and-loss";
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
}

export function DespesasClient({ expenses, summary, pnl, recurringPendingCount, currentMonth, nextMonth }: Props) {
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | "pago" | "pendente">("todos");

  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [deleting, setDeleting] = useState<ExpenseRow | null>(null);
  const [launching, setLaunching] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);

  // Meses únicos para o filtro — inclui sempre o mês seguinte (5.2)
  const months = useMemo(() => {
    const set = new Set<string>();
    set.add(nextMonth);
    for (const e of expenses) set.add(e.month);
    return Array.from(set).sort().reverse();
  }, [expenses, nextMonth]);

  async function handleTogglePaid(id: number) {
    setToggling(id);
    try { await togglePaidExpenseAction(id); } finally { setToggling(null); }
  }

  async function handleDuplicate(e: ExpenseRow) {
    await duplicateExpenseAction(e.id, nextMonth);
  }

  async function handleLaunchRecurring() {
    setLaunching(true);
    try { await launchRecurringExpensesAction(currentMonth); } finally { setLaunching(false); }
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

  // Lucro do mês atual (último row)
  const mesAtualRow = pnl.rows[pnl.rows.length - 1];
  const lucroMesAtual = mesAtualRow?.lucroLiquido ?? 0;
  const margemMesAtual = mesAtualRow?.margemLiquida ?? null;

  return (
    <>
      {/* ── Cards linha 1: despesas ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Despesas este mês"
          value={formatBRL(summary.totalMesAtual)}
          sub={`${summary.qtdMesAtual} lançamento${summary.qtdMesAtual === 1 ? "" : "s"}`}
        />
        <SummaryCard label="Despesas este ano" value={formatBRL(summary.totalAno)} />
        <SummaryCard
          label="Pendentes"
          value={formatBRL(summary.totalPendente)}
          tone={summary.totalPendente > 0 ? "warning" : "muted"}
        />
        <SummaryCard
          label="Lucro do mês"
          value={formatBRL(lucroMesAtual)}
          sub={
            margemMesAtual !== null
              ? `Margem ${(margemMesAtual * 100).toFixed(0)}%`
              : undefined
          }
          tone={lucroMesAtual < 0 ? "danger" : lucroMesAtual > 0 ? "success" : "muted"}
          icon={lucroMesAtual >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        />
      </div>

      {/* ── Cards linha 2: P&L 12m ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <SummaryCard label="Receita 12m" value={formatBRL(pnl.totals.receitaTotal)} />
        <SummaryCard label="Despesa 12m" value={formatBRL(pnl.totals.despesaTotal)} />
        <SummaryCard
          label="Lucro 12m"
          value={formatBRL(pnl.totals.lucroTotal)}
          sub={
            pnl.totals.margemMedia !== null
              ? `Margem média ${(pnl.totals.margemMedia * 100).toFixed(0)}%`
              : undefined
          }
          tone={pnl.totals.lucroTotal < 0 ? "danger" : pnl.totals.lucroTotal > 0 ? "success" : "muted"}
        />
      </div>

      {/* 5.1 — Banner despesas recorrentes pendentes */}
      {recurringPendingCount > 0 && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
          <p className="text-sm">
            <span className="font-semibold">{recurringPendingCount}</span> despesa{recurringPendingCount > 1 ? "s" : ""} recorrente{recurringPendingCount > 1 ? "s" : ""} ainda não lançada{recurringPendingCount > 1 ? "s" : ""} em {currentMonth}.
          </p>
          <Button size="sm" disabled={launching} onClick={handleLaunchRecurring}>
            <RefreshCw size={14} className={launching ? "animate-spin" : ""} />
            Lançar fixas do mês
          </Button>
        </div>
      )}

      {/* ── Filtros + lista ── */}
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
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pago">Pagas</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={() => setNewOpen(true)} className="ml-auto">
          <Plus size={16} /> Nova despesa
        </Button>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhuma despesa encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.month}</TableCell>
                  <TableCell className="font-medium">{e.description}</TableCell>
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
                  <TableCell className="text-right font-mono">
                    {formatBRL(e.amount)}
                  </TableCell>
                  {/* 5.3 — Checkbox pago inline */}
                  <TableCell>
                    <button
                      className="flex items-center gap-2 group"
                      disabled={toggling === e.id}
                      onClick={() => handleTogglePaid(e.id)}
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
                      {/* 5.4 — Duplicar para próximo mês */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        title={`Duplicar para ${nextMonth}`}
                        onClick={() => handleDuplicate(e)}
                      >
                        <Copy size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(e)}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleting(e)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t text-xs text-muted-foreground flex justify-between">
            <span>
              {filtered.length} despesa{filtered.length === 1 ? "" : "s"}
            </span>
            <span>
              Total (pagas): <strong>{formatBRL(totalFiltrado)}</strong>
            </span>
          </div>
        )}
      </div>

      {/* ── Tabela P&L 12 meses ── */}
      <div>
        <h2 className="text-base font-semibold mb-3">Resultado mensal — 12 meses</h2>
        <div className="bg-card border rounded-lg overflow-x-auto">
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
                      {row.receitaTotal > 0 ? formatBRL(row.receitaTotal) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.despesaFixa > 0 ? formatBRL(row.despesaFixa) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.despesaVariavel > 0 ? formatBRL(row.despesaVariavel) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.despesaTotal > 0 ? formatBRL(row.despesaTotal) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${isNegative ? "text-destructive" : isPositive ? "text-success" : "text-muted-foreground"}`}>
                      {row.receitaTotal === 0 && row.despesaTotal === 0
                        ? <span className="font-normal text-muted-foreground">—</span>
                        : formatBRL(row.lucroLiquido)
                      }
                    </TableCell>
                    <TableCell className={`text-right font-mono ${row.margemLiquida !== null && row.margemLiquida >= 0.2 ? "text-success" : isNegative ? "text-destructive" : ""}`}>
                      {row.margemLiquida !== null
                        ? `${(row.margemLiquida * 100).toFixed(0)}%`
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {/* Linha de totais */}
          <div className="px-4 py-3 border-t bg-muted/30 grid grid-cols-7 text-xs font-semibold">
            <span>Total 12m</span>
            <span className="text-right font-mono">{formatBRL(pnl.totals.receitaTotal)}</span>
            <span className="text-right font-mono">{formatBRL(pnl.totals.despesaFixaTotal)}</span>
            <span className="text-right font-mono">{formatBRL(pnl.totals.despesaVariavelTotal)}</span>
            <span className="text-right font-mono">{formatBRL(pnl.totals.despesaTotal)}</span>
            <span className={`text-right font-mono ${pnl.totals.lucroTotal < 0 ? "text-destructive" : "text-success"}`}>
              {formatBRL(pnl.totals.lucroTotal)}
            </span>
            <span className="text-right font-mono">
              {pnl.totals.margemMedia !== null
                ? `${(pnl.totals.margemMedia * 100).toFixed(0)}%`
                : "—"
              }
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Meses no lucro: <strong>{pnl.totals.mesesNoLucro}</strong> ·{" "}
          Meses no prejuízo: <strong className={pnl.totals.mesesNoPrejuizo > 0 ? "text-destructive" : ""}>{pnl.totals.mesesNoPrejuizo}</strong>
        </p>
      </div>

      <ExpenseDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <ExpenseDialog open={!!editing} onClose={() => setEditing(null)} editing={editing} />
      <DeleteExpenseDialog open={!!deleting} onClose={() => setDeleting(null)} expense={deleting} />
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warning" | "muted" | "danger" | "success";
  icon?: React.ReactNode;
}) {
  const valueTone =
    tone === "warning" ? "text-accent-foreground"
    : tone === "danger" ? "text-destructive"
    : tone === "success" ? "text-success"
    : tone === "muted" ? "text-muted-foreground"
    : "";
  return (
    <div className="bg-card border rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold font-mono flex items-center gap-1.5 ${valueTone}`}>
        {value}
        {icon && <span className="opacity-70">{icon}</span>}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
