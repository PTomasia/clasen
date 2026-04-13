"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import { formatBRL } from "@/lib/utils/formatting";
import type { StatusPagamento } from "@/lib/utils/calculations";
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

interface Plan {
  id: number;
  clientId: number;
  clientName: string;
  clientContactOrigin: string | null;
  clientNotes: string | null;
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
}

interface Client {
  id: number;
  name: string;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StatusPagamento }) {
  const config = {
    em_dia: { label: "Em dia", className: "bg-success text-success-foreground" },
    atrasado: { label: "Atrasado", className: "bg-accent text-accent-foreground" },
    sem_pagamento: { label: "Sem pagamento", className: "bg-muted text-muted-foreground" },
  };
  const { label, className } = config[status];
  return <Badge className={className}>{label}</Badge>;
}

function PlanStatusBadge({ status }: { status: string }) {
  return status === "ativo" ? (
    <Badge className="bg-success text-success-foreground">Ativo</Badge>
  ) : (
    <Badge variant="secondary">Inativo</Badge>
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
}: {
  plans: Plan[];
  clients: Client[];
}) {
  // Status filter (existing)
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativo" | "cancelado">("todos");

  // New: search, type filter, payment filter
  const [search, setSearch] = useState("");
  const [planTypeFilter, setPlanTypeFilter] = useState("todos");
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

  // Derive unique plan types from data
  const planTypes = useMemo(
    () => [...new Set(plans.map((p) => p.planType))].sort(),
    [plans]
  );

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
      planType: planTypeFilter,
      statusPagamento: pgtoFilter,
    });

    // 3. Sort
    if (sortKey) {
      result = sortPlans(result, sortKey, sortDirection);
    }

    return result;
  }, [plans, statusFilter, search, planTypeFilter, pgtoFilter, sortKey, sortDirection]);

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

  const hasActiveFilters = search || planTypeFilter !== "todos" || pgtoFilter !== "todos";

  return (
    <>
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
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus size={16} className="mr-2" />
            Novo plano
          </Button>
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
            value={planTypeFilter}
            onChange={(e) => setPlanTypeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="todos">Tipo: Todos</option>
            {planTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
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
                setPlanTypeFilter("todos");
                setPgtoFilter("todos");
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-lg border shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Cliente" sortKey="clientName" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHead label="Tipo" sortKey="planType" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <SortableHead label="Valor" sortKey="planValue" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
              <SortableHead label="$/post" sortKey="custoPost" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-right" />
              <TableHead className="text-center">Posts</TableHead>
              <SortableHead label="Perm." sortKey="permanencia" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} className="text-center" />
              <SortableHead label="Pgto" sortKey="statusPagamento" currentSort={sortKey} currentDirection={sortDirection} onSort={handleSort} />
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedPlans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Nenhum plano encontrado
                </TableCell>
              </TableRow>
            ) : (
              processedPlans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">
                    <button
                      className="hover:underline hover:text-primary transition-colors text-left"
                      onClick={() => setHistoryPlan({ planId: plan.id, clientName: plan.clientName })}
                    >
                      {plan.clientName}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{plan.planType}</Badge>
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
                    <StatusBadge status={plan.statusPagamento} />
                  </TableCell>
                  <TableCell>
                    <PlanStatusBadge status={plan.status} />
                  </TableCell>
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
                            planId: plan.id,
                            planType: plan.planType,
                            planValue: plan.planValue,
                            billingCycleDays: plan.billingCycleDays,
                            billingCycleDays2: plan.billingCycleDays2,
                            postsCarrossel: plan.postsCarrossel,
                            postsReels: plan.postsReels,
                            postsEstatico: plan.postsEstatico,
                            postsTrafego: plan.postsTrafego,
                            planNotes: plan.notes,
                          })
                        }
                        title="Editar cliente"
                      >
                        <Pencil size={14} />
                      </Button>
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
                            variant="ghost"
                            size="sm"
                            onClick={() => setPaymentPlanId(plan.id)}
                            title="Registrar pagamento"
                          >
                            <CreditCard size={14} />
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
          open={!!editData}
          onClose={() => setEditData(null)}
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
    </>
  );
}
