"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  CreditCard,
  XCircle,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  TrendingUp,
  TrendingDown,
  Settings,
  SkipForward,
} from "lucide-react";
import { formatBRL, formatDate } from "@/lib/utils/formatting";
import { isDataPassada, type StatusPagamento } from "@/lib/utils/calculations";
import {
  sortPlans,
  filterPlans,
  type SortKey,
  type SortDirection,
} from "@/lib/utils/table-helpers";
import { PlanFormDialog } from "./plan-form-dialog";
import { PaymentDialog } from "./payment-dialog";
import { ClosePlanDialog } from "./close-plan-dialog";
import { DeletePlanDialog } from "./delete-plan-dialog";
import { EditClientDialog, type EditDialogData } from "./edit-client-dialog";
import { ChangePlanDialog, type ChangePlanData } from "./change-plan-dialog";
import { PaymentHistoryDialog } from "./payment-history-dialog";
import { TargetPriceDialog } from "./target-price-dialog";
import { skipBillingCycleAction } from "@/lib/actions/plans";
import { BillingDayCell } from "./billing-day-cell";
import { StatusBadge } from "@/components/shared/status-badge";

interface Plan {
  id: number;
  clientId: number;
  clientName: string;
  clientContactOrigin: string | null;
  clientNotes: string | null;
  clientSince: string | null;
  planType: string;
  planValue: number;
  billingCycleDays: number | null;
  billingCycleDays2: number | null;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
  startDate: string;
  endDate: string | null;
  movementType: string | null;
  lastPaymentDate: string | null;
  nextPaymentDate: string | null;
  status: string;
  notes: string | null;
  custoPost: number | null;
  permanencia: number;
  statusPagamento: StatusPagamento;
  gapsCount: number;
  gapMonths: string[];
  nextAdjustmentDate: string | null;
  adjustmentSuggestion: {
    suggestedValue: number | null;
    percentChange: number;
    capped: boolean;
  } | null;
}

interface Client {
  id: number;
  name: string;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function PaymentStatusBadge({ status }: { status: StatusPagamento }) {
  const config = {
    em_dia: { label: "Em dia", className: "bg-success text-success-foreground" },
    atrasado: { label: "Atrasado", className: "bg-accent text-accent-foreground" },
    sem_pagamento: { label: "Sem pagamento", className: "bg-muted text-muted-foreground" },
  };
  const { label, className } = config[status];
  return <Badge className={className}>{label}</Badge>;
}

function PlanStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status === "ativo" ? "ativo" : "inativo"} />;
}

// ─── Adjustment Cell ─────────────────────────────────────────────────────────

function AdjustmentCell({
  nextDate,
  suggestion,
}: {
  nextDate: string;
  suggestion: { suggestedValue: number | null; percentChange: number; capped: boolean };
}) {
  const isOverdue = isDataPassada(nextDate);

  if (!suggestion.suggestedValue) {
    // Já acima do alvo ou sem posts
    return (
      <div className="text-xs">
        <span className={isOverdue ? "text-muted-foreground" : "text-success"}>
          {formatDate(nextDate)}
        </span>
        <br />
        <span className="text-success">Acima do alvo</span>
      </div>
    );
  }

  return (
    <div className="text-xs">
      <span className={isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}>
        {formatDate(nextDate)} {isOverdue && "⚠"}
      </span>
      <br />
      <span className={`font-mono font-medium ${isOverdue ? "text-destructive" : ""}`}>
        {formatBRL(suggestion.suggestedValue)}
      </span>
      <span className={`ml-1 ${isOverdue ? "text-destructive/80" : "text-muted-foreground"}`}>
        (+{suggestion.percentChange.toFixed(0)}%{suggestion.capped ? " max" : ""})
      </span>
    </div>
  );
}

// ─── Sortable Header ──────────────────────────────────────────────────────────

function SortableHead({
  label,
  sortKey,
  currentSort,
  currentDirection,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey | null;
  currentDirection: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  const Icon = isActive
    ? currentDirection === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <TableHead className={className}>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors -ml-2 px-2 py-1 rounded"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon size={14} className={isActive ? "text-foreground" : "text-muted-foreground/50"} />
      </button>
    </TableHead>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlanosClient({
  plans,
  clients,
  targetCostPerPost,
}: {
  plans: Plan[];
  clients: Client[];
  targetCostPerPost: number | null;
}) {
  // Status filter (existing)
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativo" | "cancelado">("ativo");

  // New: search, payment filter
  const [search, setSearch] = useState("");
  const [pgtoFilter, setPgtoFilter] = useState("todos");

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [paymentPlanId, setPaymentPlanId] = useState<number | null>(null);
  const [closePlanId, setClosePlanId] = useState<number | null>(null);
  const [deletePlanId, setDeletePlanId] = useState<number | null>(null);
  const [editData, setEditData] = useState<EditDialogData | null>(null);
  const [changeData, setChangeData] = useState<{ data: ChangePlanData; type: "Upgrade" | "Downgrade" } | null>(null);
  const [historyPlan, setHistoryPlan] = useState<{ planId: number; clientName: string } | null>(null);
  const [focusedPlanId, setFocusedPlanId] = useState<number | null>(null);
  const [showTargetPriceDialog, setShowTargetPriceDialog] = useState(false);

  // UX-1.4 — Pular cobrança
  const [, startSkipTransition] = useTransition();
  function handleSkipBilling(planId: number) {
    if (!confirm("Pular cobrança deste mês? O próximo vencimento será avançado em 1 ciclo.")) return;
    startSkipTransition(async () => {
      await skipBillingCycleAction(planId);
    });
  }

  // Navegar entre planos com o modal de edição aberto
  function handleNavigateEdit(direction: "prev" | "next") {
    if (!editData) return;
    const idx = processedPlans.findIndex((p) => p.id === editData.planId);
    if (idx === -1) return;
    const nextIdx = direction === "next" ? idx + 1 : idx - 1;
    const next = processedPlans[nextIdx];
    if (!next) return;
    setEditData({
      clientId: next.clientId,
      clientName: next.clientName,
      contactOrigin: next.clientContactOrigin,
      clientNotes: next.clientNotes,
      clientSince: next.clientSince,
      planId: next.id,
      planType: next.planType,
      planValue: next.planValue,
      billingCycleDays: next.billingCycleDays,
      billingCycleDays2: next.billingCycleDays2,
      postsCarrossel: next.postsCarrossel,
      postsReels: next.postsReels,
      postsEstatico: next.postsEstatico,
      postsTrafego: next.postsTrafego,
      startDate: next.startDate,
      planNotes: next.notes,
    });
  }

  // Atalho "P": registrar pagamento do plano focado (se ativo)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignorar se digitando em input/textarea/contenteditable
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      if ((e.key === "p" || e.key === "P") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (focusedPlanId == null) return;
        const plan = plans.find((p) => p.id === focusedPlanId);
        if (plan && plan.status === "ativo") {
          e.preventDefault();
          setPaymentPlanId(focusedPlanId);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedPlanId, plans]);

  // Pipeline: status filter → custom filters → sort
  const processedPlans = useMemo(() => {
    // 1. Status filter (existing behavior)
    let result = plans.filter((p) => {
      if (statusFilter === "todos") return true;
      return p.status === statusFilter;
    });

    // 2. Additional filters
    result = filterPlans(result, {
      search,
      statusPagamento: pgtoFilter,
    });

    // 3. Sort — default: ativo primeiro, depois nome alfabético (UX-1.2)
    if (sortKey) {
      result = sortPlans(result, sortKey, sortDirection);
    } else {
      result = [...result].sort((a, b) => {
        if (a.status === b.status) return a.clientName.localeCompare(b.clientName, "pt-BR");
        return a.status === "ativo" ? -1 : 1;
      });
    }

    return result;
  }, [plans, statusFilter, search, pgtoFilter, sortKey, sortDirection]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      // Toggle direction, or reset on third click
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortKey(null);
        setSortDirection("asc");
      }
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const paymentPlan = plans.find((p) => p.id === paymentPlanId);
  const closePlan = plans.find((p) => p.id === closePlanId);
  const deletePlan = plans.find((p) => p.id === deletePlanId);

  const hasActiveFilters = search || pgtoFilter !== "todos";

  // Cards de resumo — planos ativos
  const activePlans = useMemo(() => plans.filter((p) => p.status === "ativo"), [plans]);
  const activeClientsCount = useMemo(
    () => new Set(activePlans.map((p) => p.clientId)).size,
    [activePlans]
  );
  const activeTotal = useMemo(
    () => activePlans.reduce((sum, p) => sum + p.planValue, 0),
    [activePlans]
  );
  const custoPostMedio = useMemo(() => {
    const values = activePlans
      .map((p) => p.custoPost)
      .filter((v): v is number => v !== null && isFinite(v));
    if (values.length === 0) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }, [activePlans]);

  return (
    <>
      {/* Resumo */}
      <div className="flex gap-4 flex-wrap">
        <div className="bg-card border rounded-lg px-4 py-3 min-w-[140px]">
          <p className="text-xs text-muted-foreground">Planos ativos</p>
          <p className="text-lg font-semibold">{activePlans.length}</p>
        </div>
        <div className="bg-card border rounded-lg px-4 py-3 min-w-[140px]">
          <p className="text-xs text-muted-foreground">Clientes ativos</p>
          <p className="text-lg font-semibold">{activeClientsCount}</p>
        </div>
        <div className="bg-card border rounded-lg px-4 py-3 min-w-[160px]">
          <p className="text-xs text-muted-foreground">Receita mensal</p>
          <p className="text-lg font-semibold font-mono">{formatBRL(activeTotal)}</p>
        </div>
        <div className="bg-card border rounded-lg px-4 py-3 min-w-[160px]">
          <p className="text-xs text-muted-foreground">$/post médio</p>
          <p className="text-lg font-semibold font-mono">
            {custoPostMedio !== null ? formatBRL(custoPostMedio) : "—"}
          </p>
          {custoPostMedio !== null && targetCostPerPost && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Alvo: {formatBRL(targetCostPerPost)}
              {" "}
              <span className={custoPostMedio < targetCostPerPost ? "text-accent-foreground" : "text-success"}>
                ({custoPostMedio < targetCostPerPost ? "−" : "+"}
                {Math.abs(((custoPostMedio - targetCostPerPost) / targetCostPerPost) * 100).toFixed(0)}%)
              </span>
            </p>
          )}
        </div>
        <button
          onClick={() => setShowTargetPriceDialog(true)}
          className="bg-card border rounded-lg px-4 py-3 min-w-[160px] text-left hover:border-primary/50 transition-colors"
        >
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            $/post alvo <Settings size={10} />
          </p>
          <p className="text-lg font-semibold font-mono">
            {targetCostPerPost ? formatBRL(targetCostPerPost) : "Configurar"}
          </p>
        </button>
      </div>

      {/* Filtros e ação */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2">
            {(["todos", "ativo", "cancelado"] as const).map((f) => (
              <Button
                key={f}
                variant={statusFilter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f)}
              >
                {f === "todos" ? "Todos" : f === "ativo" ? "Ativos" : "Inativos"}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden lg:inline">
              Dica: selecione uma linha e pressione <kbd className="px-1.5 py-0.5 border rounded text-[10px] font-mono">P</kbd> para registrar pagamento
            </span>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus size={16} className="mr-2" />
              Novo plano
            </Button>
          </div>
        </div>

        {/* Search + filters row */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={pgtoFilter}
            onChange={(e) => setPgtoFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="todos">Pgto: Todos</option>
            <option value="em_dia">Em dia</option>
            <option value="atrasado">Atrasado</option>
            <option value="sem_pagamento">Sem pagamento</option>
          </select>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setPgtoFilter("todos");
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-lg border shadow-sm">
        <Table containerClassName="max-h-[calc(100vh-260px)] overflow-auto rounded-lg">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]">
            <TableRow>
              <SortableHead label="Cliente" sortKey="clientName" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHead label="Vencimento" sortKey="billingCycleDays" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-center" />
              <SortableHead label="Valor" sortKey="planValue" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
              <SortableHead label="$/post" sortKey="custoPost" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
              <TableHead className="text-center">Posts</TableHead>
              <SortableHead label="Perm." sortKey="permanencia" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-center" />
              <SortableHead label="Pgto" sortKey="statusPagamento" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <TableHead>Último pgto</TableHead>
              <TableHead>Status</TableHead>
              {targetCostPerPost && (
                <SortableHead
                  label="Reajuste"
                  sortKey="nextAdjustmentDate"
                  currentSort={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                />
              )}
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedPlans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={targetCostPerPost ? 11 : 10} className="text-center text-muted-foreground py-8">
                  Nenhum plano encontrado
                </TableCell>
              </TableRow>
            ) : (
              processedPlans.map((plan) => (
                <TableRow
                  key={plan.id}
                  tabIndex={0}
                  onFocus={() => setFocusedPlanId(plan.id)}
                  onClick={() => setFocusedPlanId(plan.id)}
                  data-focused={focusedPlanId === plan.id || undefined}
                  className="outline-none data-[focused]:bg-primary/5 data-[focused]:ring-1 data-[focused]:ring-primary/30"
                >
                  <TableCell className="font-semibold">
                    <button
                      className="hover:underline hover:text-primary transition-colors text-left"
                      onClick={() => setHistoryPlan({ planId: plan.id, clientName: plan.clientName })}
                    >
                      {plan.clientName}
                    </button>
                  </TableCell>
                  <TableCell className="text-center">
                    <BillingDayCell
                      planId={plan.id}
                      billingCycleDays={plan.billingCycleDays}
                      billingCycleDays2={plan.billingCycleDays2}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatBRL(plan.planValue)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {plan.custoPost ? formatBRL(plan.custoPost) : "—"}
                  </TableCell>
                  <TableCell
                    className="text-center text-sm text-muted-foreground cursor-help"
                    title={[
                      plan.postsCarrossel > 0 && `${plan.postsCarrossel} Carrossel`,
                      plan.postsReels > 0 && `${plan.postsReels} Reels`,
                      plan.postsEstatico > 0 && `${plan.postsEstatico} Estático`,
                      plan.postsTrafego > 0 && `${plan.postsTrafego} Tráfego`,
                    ].filter(Boolean).join(", ") || "Sem posts"}
                  >
                    {plan.postsCarrossel > 0 && `${plan.postsCarrossel}C `}
                    {plan.postsReels > 0 && `${plan.postsReels}R `}
                    {plan.postsEstatico > 0 && `${plan.postsEstatico}E `}
                    {plan.postsTrafego > 0 && `${plan.postsTrafego}T`}
                    {plan.postsCarrossel === 0 &&
                      plan.postsReels === 0 &&
                      plan.postsEstatico === 0 &&
                      plan.postsTrafego === 0 &&
                      "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {plan.permanencia}m
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <PaymentStatusBadge status={plan.statusPagamento} />
                      {plan.gapsCount > 0 && (
                        <Badge
                          variant="outline"
                          className="border-destructive/40 bg-destructive/10 text-destructive text-xs cursor-help"
                          title={
                            `${plan.gapsCount} ${plan.gapsCount === 1 ? "mês" : "meses"} em aberto:\n` +
                            plan.gapMonths
                              .map((d: string) => {
                                const [year, month] = d.split("-");
                                return new Date(Number(year), Number(month) - 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
                              })
                              .join("\n")
                          }
                        >
                          +{plan.gapsCount}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {plan.lastPaymentDate ? formatDate(plan.lastPaymentDate) : "—"}
                  </TableCell>
                  <TableCell>
                    <PlanStatusBadge status={plan.status} />
                  </TableCell>
                  {targetCostPerPost && (
                    <TableCell>
                      {plan.nextAdjustmentDate && plan.adjustmentSuggestion ? (
                        <AdjustmentCell
                          nextDate={plan.nextAdjustmentDate}
                          suggestion={plan.adjustmentSuggestion}
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditData({
                            clientId: plan.clientId,
                            clientName: plan.clientName,
                            contactOrigin: plan.clientContactOrigin,
                            clientNotes: plan.clientNotes,
                            clientSince: plan.clientSince,
                            planId: plan.id,
                            planType: plan.planType,
                            planValue: plan.planValue,
                            billingCycleDays: plan.billingCycleDays,
                            billingCycleDays2: plan.billingCycleDays2,
                            postsCarrossel: plan.postsCarrossel,
                            postsReels: plan.postsReels,
                            postsEstatico: plan.postsEstatico,
                            postsTrafego: plan.postsTrafego,
                            startDate: plan.startDate,
                            planNotes: plan.notes,
                          })
                        }
                        title="Editar cliente"
                      >
                        <Pencil size={14} />
                      </Button>
                      {plan.status !== "ativo" &&
                        plan.statusPagamento !== "em_dia" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPaymentPlanId(plan.id)}
                            title="Registrar pagamento pendente"
                            className="h-8 gap-1"
                          >
                            <CreditCard size={14} />
                            <span className="text-xs font-medium">Pagar</span>
                          </Button>
                        )}
                      {plan.status === "ativo" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setChangeData({
                                data: {
                                  planId: plan.id,
                                  clientName: plan.clientName,
                                  planType: plan.planType,
                                  planValue: plan.planValue,
                                  billingCycleDays: plan.billingCycleDays,
                            billingCycleDays2: plan.billingCycleDays2,
                                  postsCarrossel: plan.postsCarrossel,
                                  postsReels: plan.postsReels,
                                  postsEstatico: plan.postsEstatico,
                                  postsTrafego: plan.postsTrafego,
                                },
                                type: "Upgrade",
                              })
                            }
                            title="Upgrade"
                          >
                            <TrendingUp size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setChangeData({
                                data: {
                                  planId: plan.id,
                                  clientName: plan.clientName,
                                  planType: plan.planType,
                                  planValue: plan.planValue,
                                  billingCycleDays: plan.billingCycleDays,
                            billingCycleDays2: plan.billingCycleDays2,
                                  postsCarrossel: plan.postsCarrossel,
                                  postsReels: plan.postsReels,
                                  postsEstatico: plan.postsEstatico,
                                  postsTrafego: plan.postsTrafego,
                                },
                                type: "Downgrade",
                              })
                            }
                            title="Downgrade"
                          >
                            <TrendingDown size={14} />
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => setPaymentPlanId(plan.id)}
                            title="Registrar pagamento (atalho: P)"
                            className="h-8 gap-1"
                          >
                            <CreditCard size={14} />
                            <span className="text-xs font-medium">Pagar</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSkipBilling(plan.id)}
                            title="Pular cobrança — avança o próximo vencimento em 1 ciclo"
                            disabled={!plan.billingCycleDays || !plan.nextPaymentDate}
                            className={
                              !plan.billingCycleDays || !plan.nextPaymentDate
                                ? "invisible"
                                : ""
                            }
                          >
                            <SkipForward size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setClosePlanId(plan.id)}
                            title="Encerrar plano"
                          >
                            <XCircle size={14} />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletePlanId(plan.id)}
                        title="Excluir registro"
                        className="text-destructive hover:text-destructive"
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
      </div>

      {/* Dialogs */}
      <PlanFormDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        clients={clients}
      />

      {paymentPlan && (
        <PaymentDialog
          open={!!paymentPlanId}
          onClose={() => setPaymentPlanId(null)}
          plan={paymentPlan}
        />
      )}

      {closePlan && (
        <ClosePlanDialog
          open={!!closePlanId}
          onClose={() => setClosePlanId(null)}
          plan={closePlan}
        />
      )}

      {deletePlan && (
        <DeletePlanDialog
          open={!!deletePlanId}
          onClose={() => setDeletePlanId(null)}
          plan={deletePlan}
        />
      )}

      {editData && (
        <EditClientDialog
          key={editData.planId}
          open={!!editData}
          onClose={() => setEditData(null)}
          onNavigate={handleNavigateEdit}
          data={editData}
        />
      )}

      {changeData && (
        <ChangePlanDialog
          open={!!changeData}
          onClose={() => setChangeData(null)}
          data={changeData.data}
          movementType={changeData.type}
        />
      )}

      {historyPlan && (
        <PaymentHistoryDialog
          open={!!historyPlan}
          onClose={() => setHistoryPlan(null)}
          planId={historyPlan.planId}
          clientName={historyPlan.clientName}
        />
      )}

      <TargetPriceDialog
        open={showTargetPriceDialog}
        onClose={() => setShowTargetPriceDialog(false)}
        currentValue={targetCostPerPost}
      />
    </>
  );
}
