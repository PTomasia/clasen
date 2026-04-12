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
import { getPaymentHistoryAction } from "@/lib/actions/plans";
import { formatBRL } from "@/lib/utils/formatting";

interface PaymentHistoryData {
  planId: number;
  planType: string;
  planValue: number;
  billingCycleDays: number | null;
  startDate: string;
  payments: {
    id: number;
    paymentDate: string;
    amount: number;
    status: string;
    notes: string | null;
  }[];
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pago") {
    return <Badge className="bg-success text-success-foreground">Pago</Badge>;
  }
  if (status === "pendente") {
    return <Badge className="bg-accent text-accent-foreground">Pendente</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

export function PaymentHistoryDialog({
  open,
  onClose,
  planId,
  clientName,
}: {
  open: boolean;
  onClose: () => void;
  planId: number;
  clientName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState<PaymentHistoryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && planId) {
      setData(null);
      setError(null);
      startTransition(async () => {
        try {
          const result = await getPaymentHistoryAction(planId);
          setData(result);
        } catch (err: any) {
          setError(err.message);
        }
      });
    }
  }, [open, planId]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagamentos — {clientName}</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        {isPending && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Carregando...
          </p>
        )}

        {data && (
          <>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{data.planType}</span>
              <span>{formatBRL(data.planValue)}/mês</span>
              {data.billingCycleDays && (
                <span>Vence dia {data.billingCycleDays}</span>
              )}
            </div>

            {data.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum pagamento registrado
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Obs.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">
                        {formatDate(p.paymentDate)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatBRL(p.amount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                        {p.notes || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
