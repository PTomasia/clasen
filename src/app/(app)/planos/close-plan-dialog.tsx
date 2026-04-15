"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { closePlanAction } from "@/lib/actions/plans";
import { useDialogAction } from "@/lib/hooks/use-dialog-action";

interface Plan {
  id: number;
  clientName: string;
}

export function ClosePlanDialog({
  open,
  onClose,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  plan: Plan;
}) {
  const { isPending, error, run } = useDialogAction(onClose);
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [prorataAmount, setProrataAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = prorataAmount.trim() === "" ? undefined : Number(prorataAmount);
    const options =
      parsed !== undefined && !Number.isNaN(parsed) && parsed > 0
        ? { prorataAmount: parsed, notes: notes.trim() || undefined }
        : {};
    run(() => closePlanAction(plan.id, endDate, options));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Encerrar Plano</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Encerrar plano de {plan.clientName}?
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Data de encerramento</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>
              Valor proporcional a cobrar (R$){" "}
              <span className="text-muted-foreground font-normal">
                — opcional
              </span>
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={prorataAmount}
              onChange={(e) => setProrataAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se houver posts já produzidos neste ciclo, informe o valor proporcional.
              Será gerado um pagamento pendente.
            </p>
          </div>

          {prorataAmount.trim() !== "" && (
            <div className="space-y-2">
              <Label>Observação</Label>
              <Input
                type="text"
                placeholder="Ex: 3 posts entregues"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Encerrando..." : "Confirmar encerramento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
