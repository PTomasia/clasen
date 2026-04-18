"use client";

import { useDialogAction } from "@/lib/hooks/use-dialog-action";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteExpenseAction } from "@/lib/actions/expenses";
import { formatBRL } from "@/lib/utils/formatting";
import type { ExpenseRow } from "@/lib/services/expenses";

export function DeleteExpenseDialog({
  open,
  onClose,
  expense,
}: {
  open: boolean;
  onClose: () => void;
  expense: ExpenseRow | null;
}) {
  const { isPending, error, run } = useDialogAction(onClose);

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir despesa</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir{" "}
          <strong className="text-foreground">{expense.description}</strong>{" "}
          ({formatBRL(expense.amount)}, {expense.month})?
        </p>
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
            onClick={() => run(() => deleteExpenseAction(expense.id))}
          >
            {isPending ? "Excluindo..." : "Excluir"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
