"use client";

import { useState } from "react";
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
import { Plus, CreditCard, XCircle } from "lucide-react";
import { formatBRL, formatDate } from "@/lib/utils/formatting";
import type { StatusPagamento } from "@/lib/utils/calculations";
import { PlanFormDialog } from "./plan-form-dialog";
import { PaymentDialog } from "./payment-dialog";
import { ClosePlanDialog } from "./close-plan-dialog";

interface Plan {
  id: number;
  clientId: number;
  clientName: string;
  planType: string;
  planValue: number;
  billingCycleDays: number | null;
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

export function PlanosClient({
  plans,
  clients,
}: {
  plans: Plan[];
  clients: Client[];
}) {
  const [filter, setFilter] = useState<"todos" | "ativo" | "cancelado">("todos");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [paymentPlanId, setPaymentPlanId] = useState<number | null>(null);
  const [closePlanId, setClosePlanId] = useState<number | null>(null);

  const filteredPlans = plans.filter((p) => {
    if (filter === "todos") return true;
    return p.status === filter;
  });

  const paymentPlan = plans.find((p) => p.id === paymentPlanId);
  const closePlan = plans.find((p) => p.id === closePlanId);

  return (
    <>
      {/* Filtros e ação */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          {(["todos", "ativo", "cancelado"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
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

      {/* Tabela */}
      <div className="bg-card rounded-lg border shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">$/post</TableHead>
              <TableHead className="text-center">Posts</TableHead>
              <TableHead className="text-center">Perm.</TableHead>
              <TableHead>Pgto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPlans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Nenhum plano encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredPlans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.clientName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{plan.planType}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatBRL(plan.planValue)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {plan.custoPost ? formatBRL(plan.custoPost) : "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
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
                    {plan.status === "ativo" && (
                      <div className="flex gap-1 justify-end">
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
                      </div>
                    )}
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
    </>
  );
}
