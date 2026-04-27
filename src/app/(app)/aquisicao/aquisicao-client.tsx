"use client";

import { useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X } from "lucide-react";
import { formatBRL } from "@/lib/utils/formatting";
import type { UnitEconomicsData, MonthRow } from "@/lib/queries/unit-economics";
import { setAdSpendAction } from "@/lib/actions/marketing";

export function AquisicaoClient({ data }: { data: UnitEconomicsData }) {
  const { rows, totals } = data;

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI
          label="CAC médio (12m)"
          value={totals.cacMedio !== null ? formatBRL(totals.cacMedio) : "—"}
          sub={`${totals.novosClientesTotal} novo${totals.novosClientesTotal === 1 ? "" : "s"} cliente${totals.novosClientesTotal === 1 ? "" : "s"}`}
        />
        <KPI
          label="LTV médio"
          value={formatBRL(totals.ltvMedio)}
          sub="Soma planos + avulsas"
        />
        <KPI
          label="LTV : CAC"
          value={totals.ltvCacRatio !== null ? `${totals.ltvCacRatio.toFixed(1)}x` : "—"}
          sub={
            totals.ltvCacRatio !== null && totals.ltvCacRatio >= 3
              ? "Saudável (≥3x)"
              : totals.ltvCacRatio !== null
                ? "Abaixo de 3x"
                : undefined
          }
        />
        <KPI
          label="Payback"
          value={
            totals.paybackMeses !== null
              ? `${totals.paybackMeses.toFixed(1)} meses`
              : "—"
          }
          sub={
            totals.ticketMedioMensal > 0
              ? `Ticket médio: ${formatBRL(totals.ticketMedioMensal)}`
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <KPI
          label="Investimento em ads (12m)"
          value={formatBRL(totals.adSpendTotal)}
        />
        <KPI
          label="Receita total (12m)"
          value={formatBRL(totals.receitaTotal)}
        />
        <KPI
          label="ROAS (12m)"
          value={
            totals.roasMedio !== null
              ? `${totals.roasMedio.toFixed(2)}x`
              : "—"
          }
        />
      </div>

      {/* Table */}
      <p className="text-sm text-muted-foreground -mb-1">
        Informe o investimento mensal em ads (Meta, Google, etc) na coluna <strong>Ad Spend</strong> — clique no valor para editar. O valor entra automaticamente no P&L como despesa de marketing.
      </p>
      <div className="bg-card border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead className="text-right">Ad Spend</TableHead>
              <TableHead className="text-right">Novos</TableHead>
              <TableHead className="text-right">CAC</TableHead>
              <TableHead className="text-right">Receita</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
              <TableHead className="text-right">Ativos início</TableHead>
              <TableHead className="text-right">Churned</TableHead>
              <TableHead className="text-right">Churn % (clientes)</TableHead>
              <TableHead className="text-right">Churn % (receita)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <MonthRowView key={row.month} row={row} />
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        <strong>Como é calculado:</strong> Novos clientes = cliente cujo primeiro
        plano começa no mês. CAC = ad spend / novos. ROAS = receita / ad spend.
        Receita = pagamentos recorrentes + avulsas (pagas). Churned = clientes
        cujo último plano encerrou no mês e não houve retomada.{" "}
        <strong>Churn % (receita)</strong> = MRR perdido / MRR ativo no início do mês
        — mais relevante que a contagem de cabeças quando os tickets diferem.
      </p>
    </>
  );
}

function MonthRowView({ row }: { row: MonthRow }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(row.adSpend));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const n = parseFloat(value);
    if (isNaN(n) || n < 0) {
      setError("Valor inválido");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await setAdSpendAction(row.month, n);
        setEditing(false);
      } catch (err: any) {
        setError(err?.message ?? "Erro");
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{row.label}</TableCell>
      <TableCell className="text-right font-mono">
        {editing ? (
          <div className="flex items-center gap-1 justify-end">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-28 h-8 text-right"
              disabled={isPending}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={handleSave}
              disabled={isPending}
            >
              <Check size={14} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => {
                setEditing(false);
                setValue(String(row.adSpend));
                setError(null);
              }}
              disabled={isPending}
            >
              <X size={14} />
            </Button>
          </div>
        ) : (
          <button
            className="inline-flex items-center gap-1.5 hover:text-primary transition-colors group"
            onClick={() => setEditing(true)}
            title="Clique para editar"
          >
            {row.adSpend > 0 ? formatBRL(row.adSpend) : (
              <span className="text-muted-foreground italic text-xs">Clique para informar</span>
            )}
            <Pencil
              size={11}
              className="text-muted-foreground"
            />
          </button>
        )}
        {error && (
          <div className="text-xs text-destructive mt-1">{error}</div>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">{row.novosClientes}</TableCell>
      <TableCell className="text-right font-mono">
        {row.cac !== null ? formatBRL(row.cac) : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-right font-mono">
        {row.receita > 0 ? formatBRL(row.receita) : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-right font-mono">
        {row.roas !== null ? (
          <span className={row.roas >= 1 ? "text-success" : "text-destructive"}>
            {row.roas.toFixed(2)}x
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">{row.ativosInicio}</TableCell>
      <TableCell className="text-right font-mono">
        {row.churned > 0 ? (
          <span className="text-destructive">{row.churned}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">
        {row.churnRate !== null ? (
          <span className={row.churnRate > 0 ? "text-destructive" : undefined}>
            {(row.churnRate * 100).toFixed(1)}%
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">
        {row.revenueChurnRate !== null ? (
          <span className={row.revenueChurnRate > 0 ? "text-destructive" : undefined}>
            {(row.revenueChurnRate * 100).toFixed(1)}%
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function KPI({
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
