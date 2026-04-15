"use client";

import { useEffect, useState } from "react";
import { useDialogAction } from "@/lib/hooks/use-dialog-action";
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
  nextPaymentDate: string | null;
  payments: {
    id: number;
    paymentDate: string;
    amount: number;
    status: string;
    notes: string | null;
  }[];
  gaps: string[];
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
  const { isPending, error, run } = useDialogAction();
  const [data, setData] = useState<PaymentHistoryData | null>(null);

  useEffect(() => {
    if (open && planId) {
      setData(null);
      run(async () => {
        const result = await getPaymentHistoryAction(planId);
        setData(result);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

            {data.nextPaymentDate && (
              <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Próximo pagamento</p>
                  <p className="text-sm font-semibold">
                    {formatDate(data.nextPaymentDate)}
                  </p>
                </div>
                <p className="text-base font-mono font-semibold text-primary">
                  {formatBRL(data.planValue)}
                </p>
              </div>
            )}

            {data.gaps.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-1">
                <p className="text-sm font-semibold text-destructive">
                  {data.gaps.length === 1
                    ? "1 mês em aberto"
                    : `${data.gaps.length} meses em aberto`}
                </p>
                <p className="text-xs text-destructive/80">
                  {data.gaps.map((d) => formatDate(d)).join(", ")}
                </p>
              </div>
            )}

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
