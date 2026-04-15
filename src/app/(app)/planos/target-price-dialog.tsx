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
import { setTargetCostPerPost } from "@/lib/actions/settings";
import { useDialogAction } from "@/lib/hooks/use-dialog-action";

export function TargetPriceDialog({
  open,
  onClose,
  currentValue,
}: {
  open: boolean;
  onClose: () => void;
  currentValue: number | null;
}) {
  const { isPending, error, run } = useDialogAction(onClose);
  const [value, setValue] = useState(
    currentValue ? String(currentValue) : ""
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(value);
    if (isNaN(parsed) || parsed <= 0) return;
    run(() => setTargetCostPerPost(parsed));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Preço-alvo por post</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Valor de referência para sugestões de reajuste. Planos com $/post
            abaixo deste valor receberão sugestão de aumento (máximo 25%).
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="1"
              placeholder="178.00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
