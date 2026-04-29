"use client";

import { useState, useMemo, useEffect, useRef, useTransition } from "react";
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
} from "lucide-react";
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
      <div className="flex gap-4 flex-wrap">
        <div className="bg-card border rounded-lg px-4 py-3 min-w-[140px]">
          <p className="text-xs text-muted-foreground">Planos ativos</p>
          <p className="text-lg font-semibold">{activePlans.length}</p>
        </div>
        <div className="bg-card border rounded-lg px-4 py-3 min-w-[140px]">
          <p className="text-xs text-muted-foreground">Posts atuais</p>
          <p className="text-lg font-semibold tabular-nums">
            {postsAtuais.conteudo}
            <span className="text-xs text-muted-foreground font-normal"> conteúdo</span>
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums -mt-0.5">
            · {postsAtuais.trafego} tráfego
          </p>
        </div>
        <div className="bg-card border rounded-lg px-4 py-3 min-w-[160px]">
          <p className="text-xs text-muted-foreground">Receita mensal</p>
          <p className="text-lg font-semibold font-mono">{formatBRL(activeTotal)}</p>
        </div>
        {targetCostPerPost && overdueAdjustments.length > 0 && (
          <div
            className="rounded-lg px-4 py-3 min-w-[180px] border bg-accent/10 border-accent/40"
            title={`Soma considerando apenas os ${overdueAdjustments.length} ${overdueAdjustments.length === 1 ? "reajuste vencido" : "reajustes vencidos"} (planos com ≥6 meses ainda abaixo do $/post alvo). Demais mantêm valor atual.`}
          >
            <p className="text-xs text-accent flex items-center gap-1">
              Reajustes vencidos
              <span className="text-[10px] text-muted-foreground/70">
                {overdueAdjustments.length}
              </span>
            </p>
            <p className="text-lg font-semibold font-mono text-accent">
              {formatBRL(overdueTotal)}
            </p>
            <p className="text-[10px] text-accent/80 mt-0.5 tabular-nums">
              +{formatBRL(overdueDelta)} (+{overdueDeltaPct.toFixed(1)}%)
            </p>
          </div>
        )}
        {targetCostPerPost && potentialDelta > 0 && (
          <div
            className="rounded-lg px-4 py-3 min-w-[180px] border bg-primary/5 border-primary/30"
            title={`Soma do valor sugerido (com teto de +25%) para todos os planos ativos. Planos já no/acima do alvo mantêm o valor atual.`}
          >
            <p className="text-xs text-primary/80 flex items-center gap-1">
              Receita c/ reajustes
              <span className="text-[10px] text-muted-foreground/70">100%</span>
            </p>
            <p className="text-lg font-semibold font-mono text-primary">
              {formatBRL(potentialTotal)}
            </p>
            <p className="text-[10px] text-primary/70 mt-0.5 tabular-nums">
              +{formatBRL(potentialDelta)} (+{potentialDeltaPct.toFixed(1)}%)
            </p>
          </div>
        )}
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
        <button
          onClick={() => setShowEditTemplateDialog(true)}
          className="bg-card border rounded-lg px-4 py-3 min-w-[160px] text-left hover:border-primary/50 transition-colors"
        >
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            Mensagem reajuste <Pencil size={10} />
          </p>
          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
            Editar template
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
  const adjustedX = Math.min(x, window.innerWidth - popoverWidth - 8);
  const adjustedY = Math.min(y, window.innerHeight - 200);

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
      style={{ top: adjustedY, left: adjustedX, width: popoverWidth }}
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
