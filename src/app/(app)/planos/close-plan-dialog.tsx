"use client";

import { useState, useTransition } from "react";
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
  const [isPending, startTransition] = useTransition();
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    startTransition(async () => {
      await closePlanAction(plan.id, endDate);
      onClose();
    });
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
          <div className="space-y-2">
            <Label>Data de encerramento</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

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
