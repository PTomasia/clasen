"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deletePlanAction } from "@/lib/actions/plans";
import { useDialogAction } from "@/lib/hooks/use-dialog-action";

interface DeletePlanDialogProps {
  open: boolean;
  onClose: () => void;
  plan: { id: number; clientName: string; planType: string; planValue: number };
}

export function DeletePlanDialog({ open, onClose, plan }: DeletePlanDialogProps) {
  const { isPending, error, run } = useDialogAction(onClose);

  function handleDelete() {
    run(() => deletePlanAction(plan.id));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir registro</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja excluir o plano{" "}
          <strong>{plan.planType}</strong> de{" "}
          <strong>{plan.clientName}</strong>? Essa ação não pode ser desfeita.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? "Excluindo..." : "Excluir"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
