"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { setAdjustmentMessageTemplate } from "@/lib/actions/settings";
import { useDialogAction } from "@/lib/hooks/use-dialog-action";
import {
  ADJUSTMENT_PLACEHOLDERS,
  renderAdjustmentMessage,
} from "@/lib/utils/adjustment-message";

const PREVIEW_VARS = {
  cliente: "Ana Souza",
  valorAtual: 400,
  valorNovo: 500,
  percentual: 25,
  custoPostAtual: 100,
  custoPostNovo: 125,
};

export function EditAdjustmentTemplateDialog({
  open,
  onClose,
  currentTemplate,
}: {
  open: boolean;
  onClose: () => void;
  currentTemplate: string;
}) {
  const { isPending, error, run } = useDialogAction(onClose);
  const [value, setValue] = useState(currentTemplate);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    run(() => setAdjustmentMessageTemplate(value));
  }

  const preview = renderAdjustmentMessage(value, PREVIEW_VARS);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar mensagem de reajuste</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Texto pré-formatado que aparece quando você clica numa célula de reajuste em /planos.
            Use os placeholders abaixo — o sistema substitui automaticamente.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Template</Label>
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={10}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                required
                autoFocus
              />
              <div className="text-[11px] text-muted-foreground space-y-0.5">
                {ADJUSTMENT_PLACEHOLDERS.map((p) => (
                  <p key={p.name}>
                    <code className="bg-muted/60 px-1 rounded">{p.name}</code>{" "}
                    <span className="text-muted-foreground/70">— {p.desc}</span>
                  </p>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="w-full min-h-[256px] rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed">
                {preview}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Usando dados de exemplo: cliente Ana Souza, R$ 400 → R$ 500 (+25%).
              </p>
            </div>
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
