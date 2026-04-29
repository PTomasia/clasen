import type { StatusPagamento } from "./calculations";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SortKey =
  | "clientName"
  | "planType"
  | "planValue"
  | "custoPost"
  | "permanencia"
  | "statusPagamento"
  | "billingCycleDays"
  | "nextAdjustmentDate";

export type SortDirection = "asc" | "desc";

export interface PlanRow {
  clientName: string;
  planType: string;
  planValue: number;
  custoPost: number | null;
  permanencia: number;
  statusPagamento: StatusPagamento;
  billingCycleDays: number | null;
  nextAdjustmentDate?: string | null;
}

interface FilterOptions {
  search?: string;
  planType?: string;
  statusPagamento?: string;
}

// ─── Ordenação ────────────────────────────────────────────────────────────────

const STATUS_PAGAMENTO_ORDER: Record<StatusPagamento, number> = {
  atrasado: 0,
  em_dia: 1,
  sem_pagamento: 2,
};

export function sortPlans<T extends PlanRow>(
  plans: T[],
  key: SortKey,
  direction: SortDirection
): T[] {
  return [...plans].sort((a, b) => {
    const valA = a[key];
    const valB = b[key];

    // Nulls sempre no final, independente da direção
    if (valA === null && valB === null) return 0;
    if (valA === null) return 1;
    if (valB === null) return -1;

    let comparison: number;

    if (key === "statusPagamento") {
      comparison =
        STATUS_PAGAMENTO_ORDER[valA as StatusPagamento] -
        STATUS_PAGAMENTO_ORDER[valB as StatusPagamento];
    } else if (typeof valA === "string" && typeof valB === "string") {
      comparison = valA.localeCompare(valB, "pt-BR");
    } else {
      comparison = (valA as number) - (valB as number);
    }

    return direction === "asc" ? comparison : -comparison;
  });
}

// ─── Filtro ───────────────────────────────────────────────────────────────────

export function filterPlans<T extends PlanRow>(
  plans: T[],
  options: FilterOptions = {}
): T[] {
  const { search, planType, statusPagamento } = options;

  return plans.filter((plan) => {
    // Busca por texto no nome
    if (search && search.trim()) {
      const needle = search.toLowerCase();
      if (!plan.clientName.toLowerCase().includes(needle)) {
        return false;
      }
    }

    // Filtro por tipo de plano
    if (planType && planType !== "todos") {
      if (plan.planType !== planType) return false;
    }

    // Filtro por status de pagamento
    if (statusPagamento && statusPagamento !== "todos") {
      if (plan.statusPagamento !== statusPagamento) return false;
    }

    return true;
  });
}
