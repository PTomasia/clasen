"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUO, formatMonth } from "@/lib/utils/formatting";
import {
  calcScoreOperacional,
  interpretarScore,
} from "@/lib/utils/operational-metrics";
import {
  AGENDA_STATUS_LABELS,
  CHECK_PERIOD_LABELS,
  RATING_DESCRIPTIONS,
  NIVEL_QUALITATIVO_LABELS,
  type AgendaStatus,
} from "@/lib/constants";
import { deleteOperationalCheckAction } from "@/lib/actions/operational";
import type { OperationalCheckRow } from "@/lib/services/operational";
import type { OperationalPageData } from "@/lib/queries/operational";
import { OperationalCheckDialog } from "./operational-check-dialog";
import { OperationalCharts } from "./operational-charts";
import { CopyOperationalReportButton } from "./copy-operational-report-button";

// ─── Helpers visuais ────────────────────────────────────────────────────────────

const AGENDA_COLORS: Record<AgendaStatus, string> = {
  saudavel: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  atencao: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  contencao: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  critico: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

function AgendaBadge({ status, className }: { status: AgendaStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        AGENDA_COLORS[status],
        className
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {AGENDA_STATUS_LABELS[status]}
    </span>
  );
}

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-2xl font-bold mt-1.5">{value}</div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function scoreFmt(score: number): string {
  return score.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function rowScore(c: OperationalCheckRow): number {
  return calcScoreOperacional({
    execucaoDireta: c.notaExecucaoDireta,
    revisao: c.notaRevisao,
    direcaoCriativa: c.notaDirecaoCriativa,
    energia: c.notaEnergia,
    capacidade: c.notaCapacidade,
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────────

export function OperacionalClient({ data }: { data: OperationalPageData }) {
  const { checks, latest, metrics, evolution, activeClients } = data;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OperationalCheckRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletePending, startDelete] = useTransition();

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(check: OperationalCheckRow) {
    setEditing(check);
    setDialogOpen(true);
  }
  function handleDelete(id: number) {
    startDelete(async () => {
      await deleteOperationalCheckAction(id);
      setConfirmDeleteId(null);
    });
  }

  return (
    <div className="space-y-6">
      {/* Ações */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <CopyOperationalReportButton disabled={!latest} />
        <Button size="sm" onClick={openNew}>
          <Plus />
          Novo check
        </Button>
      </div>

      {!latest || !metrics ? (
        <EmptyState onCreate={openNew} />
      ) : (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card
              label="Score operacional"
              value={
                <span className="flex items-baseline gap-1">
                  {scoreFmt(metrics.score)}
                  <span className="text-sm font-normal text-muted-foreground">/ 5</span>
                </span>
              }
              sub={metrics.scoreLabel}
            />
            <Card
              label="Status da agenda"
              value={<AgendaBadge status={metrics.statusAgenda} />}
              sub="Capacidade de absorver novas clientes"
            />
            <Card
              label="Capacidade p/ novas"
              value={`${metrics.notaCapacidade} / 5`}
              sub={RATING_DESCRIPTIONS.capacidade[metrics.notaCapacidade as 1 | 2 | 3 | 4 | 5]}
            />
            <Card
              label="Unid. operacionais"
              value={metrics.unidadesOperacionais == null ? "—" : formatUO(metrics.unidadesOperacionais)}
              sub="Carga planejada do mês"
            />
            <Card
              label="Posts totais"
              value={metrics.postsTotais ?? "—"}
              sub="Carga planejada do mês"
            />
            <Card
              label="Entregas da Gabi"
              value={
                <span className="text-base">
                  {metrics.entregasExecutadasGabi == null
                    ? "—"
                    : NIVEL_QUALITATIVO_LABELS[metrics.entregasExecutadasGabi as 1 | 2 | 3 | 4 | 5]}
                </span>
              }
              sub="Executou diretamente"
            />
            <Card
              label="Gargalo principal"
              value={<span className="text-base">{metrics.gargaloPrincipal ?? "—"}</span>}
            />
            <Card
              label="Último check"
              value={<span className="text-base">{formatMonth(latest.referenceMonth)}</span>}
              sub={CHECK_PERIOD_LABELS[latest.period]}
            />
          </div>

          {/* Gráficos */}
          <OperationalCharts data={evolution} />

          {/* Histórico */}
          <div className="bg-card border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Histórico de checks</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Gargalo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((c) => {
                  const s = rowScore(c);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{formatMonth(c.referenceMonth)}</TableCell>
                      <TableCell>{CHECK_PERIOD_LABELS[c.period]}</TableCell>
                      <TableCell>
                        {scoreFmt(s)}{" "}
                        <span className="text-xs text-muted-foreground">
                          {interpretarScore(s).label}
                        </span>
                      </TableCell>
                      <TableCell>{c.gargalos[0] ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <CopyOperationalReportButton checkId={c.id} />
                          <Button size="icon-sm" variant="ghost" onClick={() => openEdit(c)} aria-label="Editar">
                            <Pencil />
                          </Button>
                          {confirmDeleteId === c.id ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deletePending}
                              onClick={() => handleDelete(c.id)}
                            >
                              {deletePending ? "Excluindo…" : "Confirmar"}
                            </Button>
                          ) : (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setConfirmDeleteId(c.id)}
                              aria-label="Excluir"
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <OperationalCheckDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
        activeClients={activeClients}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="bg-card border rounded-lg p-10 flex flex-col items-center text-center gap-3">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <Activity />
      </div>
      <div>
        <p className="font-semibold">Nenhum check operacional ainda</p>
        <p className="text-sm text-muted-foreground mt-1">
          Crie o primeiro check (meio ou fim do mês) para começar a medir a saúde operacional.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus />
        Criar primeiro check
      </Button>
    </div>
  );
}
