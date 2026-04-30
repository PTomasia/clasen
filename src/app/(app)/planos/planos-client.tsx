"use client";

import { useState, useMemo, useEffect, useLayoutEffect, useRef, useTransition } from "react";
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
  MoreHorizontal,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { formatBRL, formatDate } from "@/lib/utils/formatting";
import { cn } from "@/lib/utils";
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
import { EditAdjustmentTemplateDialog } from "./edit-adjustment-template-dialog";
import { renderAdjustmentMessage } from "@/lib/utils/adjustment-message";

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

// ─── Row Actions Menu (kebab "...") ───────────────────────────────────────────

type ActionItem =
  | { type: "item"; label: string; icon: React.ComponentType<{ size?: number }>; onClick: () => void; destructive?: boolean }
  | { type: "separator" };

function RowActionsMenu({ items }: { items: ActionItem[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
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

  return (
    <div className="relative inline-block">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Mais ações"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={14} />
      </Button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-md border bg-popover shadow-lg py-1 text-sm"
        >
          {items.map((item, i) => {
            if (item.type === "separator") {
              return <div key={`sep-${i}`} className="my-1 border-t" aria-hidden />;
            }
            return (
              <button
                key={item.label}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick();
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors",
                  item.destructive
                    ? "text-destructive hover:bg-destructive/10"
                    : "hover:bg-muted/60"
                )}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
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
  onOpenMessage,
}: {
  nextDate: string;
  suggestion: { suggestedValue: number | null; percentChange: number; capped: boolean };
  onOpenMessage?: (anchor: { x: number; y: number }) => void;
}) {
  const isOverdue = isDataPassada(nextDate);

  if (!suggestion.suggestedValue) {
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

  const clickable = !!onOpenMessage;

  return (
    <button
      type="button"
      onClick={
        clickable
          ? (e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onOpenMessage!({ x: r.left, y: r.bottom + 6 });
            }
          : undefined
      }
      disabled={!clickable}
      className={cn(
        "text-xs text-left",
        clickable && "hover:bg-muted/50 -mx-1 px-1 py-0.5 rounded transition-colors cursor-pointer"
      )}
      title={clickable ? "Clique para copiar mensagem do reajuste" : undefined}
    >
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
    </button>
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
  adjustmentTemplate,
}: {
  plans: Plan[];
  clients: Client[];
  targetCostPerPost: number | null;
  adjustmentTemplate: string;
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
  const [showEditTemplateDialog, setShowEditTemplateDialog] = useState(false);
  const [adjustmentMessagePopover, setAdjustmentMessagePopover] = useState<{
    planId: number;
    text: string;
    anchor: { x: number; y: number };
  } | null>(null);

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
  const postsAtuais = useMemo(() => {
    return activePlans.reduce(
      (acc, p) => ({
        conteudo: acc.conteudo + p.postsCarrossel + p.postsReels + p.postsEstatico,
        trafego: acc.trafego + p.postsTrafego,
      }),
      { conteudo: 0, trafego: 0 }
    );
  }, [activePlans]);
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

  // Receita potencial: se todos os reajustes sugeridos forem aceitos.
  // Para planos sem sugestão (já acima do alvo, sem posts), mantém o valor atual.
  const potentialTotal = useMemo(
    () =>
      activePlans.reduce(
        (sum, p) => sum + (p.adjustmentSuggestion?.suggestedValue ?? p.planValue),
        0
      ),
    [activePlans]
  );
  const potentialDelta = potentialTotal - activeTotal;
  const potentialDeltaPct =
    activeTotal > 0 ? (potentialDelta / activeTotal) * 100 : 0;

  // Receita potencial — apenas reajustes vencidos:
  // planos cujo nextAdjustmentDate já passou (≥6 meses sem reajuste) E
  // ainda têm sugestão (abaixo do alvo). Demais mantêm valor atual.
  const overdueAdjustments = useMemo(
    () =>
      activePlans.filter(
        (p) =>
          p.nextAdjustmentDate &&
          isDataPassada(p.nextAdjustmentDate) &&
          p.adjustmentSuggestion?.suggestedValue != null
      ),
    [activePlans]
  );
  const overdueTotal = useMemo(
    () =>
      activePlans.reduce(
        (sum, p) => {
          const isOverdue =
            p.nextAdjustmentDate &&
            isDataPassada(p.nextAdjustmentDate) &&
            p.adjustmentSuggestion?.suggestedValue != null;
          return sum + (isOverdue ? p.adjustmentSuggestion!.suggestedValue! : p.planValue);
        },
        0
      ),
    [activePlans]
  );
  const overdueDelta = overdueTotal - activeTotal;
  const overdueDeltaPct =
    activeTotal > 0 ? (overdueDelta / activeTotal) * 100 : 0;

  return (
    <>
      {/* Resumo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Esquerda: Hero KPI */}
        <div className="lg:col-span-2">
          <PlanosHeroCard
            receitaMensal={activeTotal}
            totalPlanos={activePlans.length}
            postsConteudo={postsAtuais.conteudo}
            postsTrafego={postsAtuais.trafego}
            reajustes={
              targetCostPerPost && overdueAdjustments.length > 0
                ? {
                    count: overdueAdjustments.length,
                    receitaComVencidos: overdueTotal,
                    deltaVencidos: overdueDelta,
                    deltaVencidosPct: overdueDeltaPct,
                    receitaSeTodos: potentialDelta > 0 ? potentialTotal : null,
                  }
                : null
            }
            custoPostMedio={custoPostMedio}
            targetCostPerPost={targetCostPerPost}
            onEditTarget={() => setShowTargetPriceDialog(true)}
          />
        </div>

        {/* Direita: Pagamentos atrasados */}
        <OverduePaymentsPanel
          plans={activePlans}
          onPay={(planId) => setPaymentPlanId(planId)}
          onSkip={handleSkipBilling}
        />
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
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => setShowEditTemplateDialog(true)}
            title="Editar template da mensagem de reajuste"
          >
            <Pencil size={14} />
            Mensagem reajuste
          </Button>
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
                          onOpenMessage={
                            plan.adjustmentSuggestion.suggestedValue != null
                              ? (anchor) =>
                                  setAdjustmentMessagePopover({
                                    planId: plan.id,
                                    text: renderAdjustmentMessage(adjustmentTemplate, {
                                      cliente: plan.clientName,
                                      valorAtual: plan.planValue,
                                      valorNovo: plan.adjustmentSuggestion!.suggestedValue!,
                                      percentual: plan.adjustmentSuggestion!.percentChange,
                                      custoPostAtual: plan.custoPost,
                                      custoPostNovo:
                                        plan.adjustmentSuggestion!.suggestedValue! /
                                        Math.max(
                                          1,
                                          plan.postsCarrossel +
                                            plan.postsReels +
                                            plan.postsEstatico * 0.5
                                        ),
                                    }),
                                    anchor,
                                  })
                              : undefined
                          }
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
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
                            variant="default"
                            size="sm"
                            onClick={() => setPaymentPlanId(plan.id)}
                            title="Registrar pagamento (atalho: P)"
                            className="h-8 gap-1"
                          >
                            <CreditCard size={14} />
                            <span className="text-xs font-medium">Pagar</span>
                          </Button>
                          {plan.billingCycleDays && plan.nextPaymentDate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSkipBilling(plan.id)}
                              title="Pular cobrança — avança o próximo vencimento em 1 ciclo"
                            >
                              <SkipForward size={14} />
                            </Button>
                          )}
                        </>
                      )}
                      <RowActionsMenu
                        items={[
                          {
                            type: "item",
                            label: "Editar plano",
                            icon: Pencil,
                            onClick: () =>
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
                              }),
                          },
                          ...(plan.status === "ativo"
                            ? ([
                                {
                                  type: "item",
                                  label: "Upgrade",
                                  icon: TrendingUp,
                                  onClick: () =>
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
                                    }),
                                },
                                {
                                  type: "item",
                                  label: "Downgrade",
                                  icon: TrendingDown,
                                  onClick: () =>
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
                                    }),
                                },
                                {
                                  type: "item",
                                  label: "Encerrar plano",
                                  icon: XCircle,
                                  onClick: () => setClosePlanId(plan.id),
                                },
                              ] as ActionItem[])
                            : []),
                          { type: "separator" },
                          {
                            type: "item",
                            label: "Excluir registro",
                            icon: Trash2,
                            onClick: () => setDeletePlanId(plan.id),
                            destructive: true,
                          },
                        ]}
                      />
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

      <EditAdjustmentTemplateDialog
        open={showEditTemplateDialog}
        onClose={() => setShowEditTemplateDialog(false)}
        currentTemplate={adjustmentTemplate}
      />

      {adjustmentMessagePopover && (
        <AdjustmentMessagePopover
          x={adjustmentMessagePopover.anchor.x}
          y={adjustmentMessagePopover.anchor.y}
          text={adjustmentMessagePopover.text}
          onClose={() => setAdjustmentMessagePopover(null)}
        />
      )}
    </>
  );
}

// ─── Header: Hero card com KPIs hierárquicos ─────────────────────────────────

function StatColumn({
  label,
  value,
  sub,
  tone = "default",
  icon,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "primary" | "accent";
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const valueColor =
    tone === "primary"
      ? "text-primary"
      : tone === "accent"
        ? "text-accent"
        : "";

  const inner = (
    <div className="flex flex-col gap-1 text-left">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1">
        {label}
        {icon}
      </p>
      <p
        className={cn(
          "text-xl leading-none tracking-tight font-medium tabular-nums",
          valueColor
        )}
        style={{ fontFamily: "var(--font-heading), serif" }}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full -m-1 p-1 rounded hover:bg-muted/40 transition-colors"
      >
        {inner}
      </button>
    );
  }
  return inner;
}

function PlanosHeroCard({
  receitaMensal,
  totalPlanos,
  postsConteudo,
  postsTrafego,
  reajustes,
  custoPostMedio,
  targetCostPerPost,
  onEditTarget,
}: {
  receitaMensal: number;
  totalPlanos: number;
  postsConteudo: number;
  postsTrafego: number;
  reajustes: {
    count: number;
    receitaComVencidos: number;
    deltaVencidos: number;
    deltaVencidosPct: number;
    receitaSeTodos: number | null;
  } | null;
  custoPostMedio: number | null;
  targetCostPerPost: number | null;
  onEditTarget: () => void;
}) {
  const stats: Array<{ key: string; node: React.ReactNode }> = [];

  if (reajustes) {
    stats.push({
      key: "reajustes",
      node: (
        <div className="flex flex-col gap-1 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
            Reajustes vencidos
            <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded bg-accent/15 text-accent text-[9px] font-mono font-bold tabular-nums">
              {reajustes.count}
            </span>
          </p>
          <p
            className="text-xl leading-none tracking-tight font-medium tabular-nums text-accent"
            style={{ fontFamily: "var(--font-heading), serif" }}
            title={`Receita mensal se aplicar os ${reajustes.count} reajustes vencidos hoje`}
          >
            {formatBRL(reajustes.receitaComVencidos)}
          </p>
          <p className="text-[10px] text-accent/80 tabular-nums">
            +{formatBRL(reajustes.deltaVencidos)} (+
            {reajustes.deltaVencidosPct.toFixed(1)}%)
          </p>
          {reajustes.receitaSeTodos !== null &&
            reajustes.receitaSeTodos > reajustes.receitaComVencidos && (
              <p
                className="text-[10px] text-muted-foreground tabular-nums"
                title="Receita se aplicar reajuste em todos os planos com sugestão (≥1 mês)"
              >
                Todos: {formatBRL(reajustes.receitaSeTodos)}
              </p>
            )}
        </div>
      ),
    });
  }
  stats.push({
    key: "custoMedio",
    node: (
      <StatColumn
        label="$/post médio"
        value={custoPostMedio !== null ? formatBRL(custoPostMedio) : "—"}
        sub={
          custoPostMedio !== null && targetCostPerPost
            ? `Alvo ${formatBRL(targetCostPerPost)} (${
                custoPostMedio < targetCostPerPost ? "−" : "+"
              }${Math.abs(
                ((custoPostMedio - targetCostPerPost) / targetCostPerPost) * 100
              ).toFixed(0)}%)`
            : undefined
        }
      />
    ),
  });
  stats.push({
    key: "alvo",
    node: (
      <StatColumn
        label="$/post alvo"
        value={targetCostPerPost ? formatBRL(targetCostPerPost) : "Configurar"}
        sub="Editar"
        icon={<Settings size={11} />}
        onClick={onEditTarget}
      />
    ),
  });

  const colsClass =
    stats.length === 4
      ? "grid-cols-2 md:grid-cols-4"
      : stats.length === 3
        ? "grid-cols-3"
        : "grid-cols-2";

  return (
    <div className="bg-card border rounded-xl p-7 md:p-8 h-full flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Receita mensal
        </p>
        <p
          className="mt-2 text-5xl md:text-6xl font-medium leading-none tracking-tight tabular-nums"
          style={{ fontFamily: "var(--font-heading), serif" }}
        >
          {formatBRL(receitaMensal)}
        </p>
        <p className="text-xs text-muted-foreground mt-3">
          <span className="tabular-nums">{totalPlanos}</span>{" "}
          {totalPlanos === 1 ? "plano" : "planos"}
          {" · "}
          <span className="tabular-nums">{postsConteudo}</span> conteúdo
          {" · "}
          <span className="tabular-nums">{postsTrafego}</span> tráfego
        </p>
      </div>

      {/* Stats row */}
      <div className="mt-6 pt-5 border-t">
        <div className={cn("grid w-full divide-x", colsClass)}>
          {stats.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                i === 0 ? "pr-4" : "px-4",
                i === stats.length - 1 && "pr-0"
              )}
            >
              {s.node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Painel: Pagamentos atrasados ─────────────────────────────────────────────

function OverduePaymentsPanel({
  plans,
  onPay,
  onSkip,
}: {
  plans: Plan[];
  onPay: (planId: number) => void;
  onSkip: (planId: number) => void;
}) {
  const overdueRows = useMemo(() => {
    const today = new Date();
    return plans
      .filter(
        (p) =>
          p.nextPaymentDate &&
          isDataPassada(p.nextPaymentDate) &&
          (!p.lastPaymentDate ||
            new Date(p.lastPaymentDate) < new Date(p.nextPaymentDate))
      )
      .map((p) => ({
        planId: p.id,
        clientName: p.clientName,
        planType: p.planType,
        planValue: p.planValue,
        nextPaymentDate: p.nextPaymentDate!,
        diasAtraso: Math.floor(
          (today.getTime() - new Date(p.nextPaymentDate!).getTime()) / 86_400_000
        ),
        billingCycleDays: p.billingCycleDays,
      }))
      .sort((a, b) => b.diasAtraso - a.diasAtraso);
  }, [plans]);

  return (
    <div className="bg-card border rounded-xl p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={18} className="text-accent" />
        <h2 className="font-semibold">Pagamentos atrasados</h2>
        {overdueRows.length > 0 && (
          <span className="ml-auto text-sm font-mono font-semibold text-accent">
            {overdueRows.length}
          </span>
        )}
      </div>

      {overdueRows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Em dia esta semana"
          tone="success"
          className="py-6"
        />
      ) : (
        <ul className="divide-y max-h-[300px] overflow-y-auto -mx-6">
          {overdueRows.map((row) => (
            <li
              key={row.planId}
              className="relative flex items-center gap-3 py-2.5 px-6 pl-[22px]"
            >
              <span
                aria-hidden
                className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{row.clientName}</p>
                <p className="text-xs text-muted-foreground">
                  {row.planType} · venceu {formatDate(row.nextPaymentDate)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-accent/10 text-accent tabular-nums",
                  row.diasAtraso >= 30 && "animate-pulse"
                )}
                title={`${row.diasAtraso} dias em atraso`}
              >
                {row.diasAtraso}d
              </span>
              <p className="text-sm font-mono font-semibold shrink-0 tabular-nums">
                {formatBRL(row.planValue)}
              </p>
              {row.billingCycleDays && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 gap-1 text-muted-foreground"
                  onClick={() => onSkip(row.planId)}
                  title="Pular cobrança deste mês"
                >
                  <SkipForward size={12} />
                  <span className="text-xs">Pular</span>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 gap-1"
                onClick={() => onPay(row.planId)}
              >
                <CreditCard size={12} />
                <span className="text-xs">Pagar</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Popover de mensagem de reajuste ──────────────────────────────────────────

function AdjustmentMessagePopover({
  x,
  y,
  text,
  onClose,
}: {
  x: number;
  y: number;
  text: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

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

  const popoverWidth = 360;

  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(x, window.innerWidth - popoverWidth - margin);

    // y vem como `trigger.bottom + 6` — tenta abrir abaixo; se não couber, flipa para cima.
    const spaceBelow = window.innerHeight - y - margin;
    const fitsBelow = rect.height <= spaceBelow;

    let top: number;
    if (fitsBelow) {
      top = y;
    } else {
      // Flip: posicionar acima do trigger.
      // Topo do trigger ≈ y - 6 (pois y = trigger.bottom + 6); deixa 6px de gap.
      const flippedTop = y - rect.height - 12;
      top = Math.max(margin, flippedTop);
    }

    setPos({ top, left });
  }, [x, y]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1200);
    } catch {
      // fallback para browsers sem clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 1200);
    }
  }

  return (
    <div
      ref={ref}
      style={
        pos
          ? { top: pos.top, left: pos.left, width: popoverWidth }
          : { top: -9999, left: -9999, width: popoverWidth, visibility: "hidden" }
      }
      className="fixed z-50 rounded-lg border bg-popover shadow-xl p-3"
      role="dialog"
    >
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">
        Mensagem de reajuste
      </p>
      <div className="text-sm whitespace-pre-wrap leading-relaxed bg-muted/40 rounded px-3 py-2 max-h-[260px] overflow-y-auto">
        {text}
      </div>
      <div className="flex gap-2 mt-3 justify-end">
        <Button size="sm" variant="outline" onClick={onClose}>
          Fechar
        </Button>
        <Button size="sm" onClick={handleCopy} disabled={copied}>
          {copied ? "✓ Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}
