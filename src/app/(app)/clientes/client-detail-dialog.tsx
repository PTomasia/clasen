"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getClientDetailAction } from "@/lib/actions/clients";
import { formatBRL, formatDate } from "@/lib/utils/formatting";

interface PlanRow {
  id: number;
  planType: string;
  planValue: number;
  startDate: string;
  endDate: string | null;
  status: string;
  movementType: string | null;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
}

interface ClientDetail {
  id: number;
  name: string;
  contactOrigin: string | null;
  notes: string | null;
  status: "ativo" | "inativo";
  permanencia: number;
  plans: PlanRow[];
}

export function ClientDetailDialog({
  open,
  onClose,
  clientId,
  clientName,
}: {
  open: boolean;
  onClose: () => void;
  clientId: number;
  clientName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && clientId) {
      setData(null);
      setError(null);
      startTransition(async () => {
        try {
          const result = await getClientDetailAction(clientId);
          setData(result);
        } catch (err: any) {
          setError(err.message);
        }
      });
    }
  }, [open, clientId]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{clientName}</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        {isPending && (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
        )}

        {data && (
          <>
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant={data.status === "ativo" ? "default" : "secondary"}>
                {data.status === "ativo" ? "Ativo" : "Inativo"}
              </Badge>
              <span className="text-muted-foreground">
                {data.permanencia} meses de permanência
              </span>
              {data.contactOrigin && (
                <span className="text-muted-foreground">
                  Origem: {data.contactOrigin}
                </span>
              )}
            </div>

            {data.notes && (
              <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                {data.notes}
              </p>
            )}

            <h3 className="text-sm font-semibold mt-2">
              Histórico de planos ({data.plans.length})
            </h3>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Mov.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium text-sm">{plan.planType}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatBRL(plan.planValue)}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(plan.startDate)}</TableCell>
                    <TableCell className="text-sm">
                      {plan.endDate ? formatDate(plan.endDate) : (
                        <Badge variant="outline" className="text-xs">Ativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {plan.movementType || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
