"use client";

import { useDialogAction } from "@/lib/hooks/use-dialog-action";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteRevenueAction } from "@/lib/actions/revenues";
import { formatBRL, formatDate } from "@/lib/utils/formatting";
import type { RevenueRow } from "@/lib/services/revenues";

export function DeleteRevenueDialog({
  open,
  onClose,
  revenue,
}: {
  open: boolean;
  onClose: () => void;
  revenue: RevenueRow | null;
}) {
  const { isPending, error, run } = useDialogAction(onClose);

  if (!revenue) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir receita avulsa?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">
            Esta ação não pode ser desfeita.
          </p>
          <div className="bg-muted rounded p-3 text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Produto:</span>{" "}
              <strong>{revenue.product}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Data:</span>{" "}
              {formatDate(revenue.date)}
            </div>
            <div>
              <span className="text-muted-foreground">Valor:</span>{" "}
              <strong className="font-mono">{formatBRL(revenue.amount)}</strong>
            </div>
            {revenue.clientName && (
              <div>
                <span className="text-muted-foreground">Cliente:</span>{" "}
                {revenue.clientName}
              </div>
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => run(() => deleteRevenueAction(revenue.id))}
            >
              {isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
