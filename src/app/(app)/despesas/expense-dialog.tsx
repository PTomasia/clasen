"use client";

import { useEffect, useState } from "react";
import { useDialogAction } from "@/lib/hooks/use-dialog-action";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createExpenseAction,
  updateExpenseAction,
  createExpenseInstallmentsAction,
} from "@/lib/actions/expenses";
import type { ExpenseRow } from "@/lib/services/expenses";

type PaymentMode = "avista" | "parcelado";

export function ExpenseDialog({
  open,
  onClose,
  editing,
  defaultMode = "avista",
  defaultIsRecurring = false,
}: {
  open: boolean;
  onClose: () => void;
  editing?: ExpenseRow | null;
  defaultMode?: PaymentMode;
  defaultIsRecurring?: boolean;
}) {
  const { isPending, error, run } = useDialogAction(onClose);

  const [month, setMonth] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"fixo" | "variavel">("fixo");
  const [amount, setAmount] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [isRecurring, setIsRecurring] = useState(false);
  const [notes, setNotes] = useState("");

  // Parcelamento — só disponível na criação
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("avista");
  const [installmentsTotal, setInstallmentsTotal] = useState("2");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setMonth(editing.month);
      setDescription(editing.description);
      setCategory(editing.category);
      setAmount(String(editing.amount));
      setIsPaid(editing.isPaid);
      setIsRecurring(editing.isRecurring ?? false);
      setNotes(editing.notes ?? "");
      setPaymentMode("avista"); // edição não altera parcelamento
    } else {
      const now = new Date();
      setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
      setDescription("");
      setCategory("fixo");
      setAmount("");
      setIsPaid(true);
      setIsRecurring(defaultIsRecurring);
      setNotes("");
      setPaymentMode(defaultMode);
      setInstallmentsTotal("2");
    }
  }, [open, editing, defaultMode, defaultIsRecurring]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing && paymentMode === "parcelado") {
      run(async () => {
        await createExpenseInstallmentsAction({
          month,
          description,
          category,
          amount: parseFloat(amount),
          installmentsTotal: parseInt(installmentsTotal, 10),
          notes: notes.trim() || null,
        });
      });
      return;
    }

    const input = {
      month,
      description,
      category,
      amount: parseFloat(amount),
      isPaid,
      isRecurring,
      notes: notes.trim() || null,
    };
    run(async () => {
      if (editing) {
        await updateExpenseAction(editing.id, input);
      } else {
        await createExpenseAction(input);
      }
    });
  }

  const isParcelado = !editing && paymentMode === "parcelado";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar despesa" : "Nova despesa"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mês {isParcelado && <span className="text-muted-foreground">(1ª parcela)</span>}</Label>
              <Input
                type="month"
                required
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor por {isParcelado ? "parcela" : "mês"} (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input
              required
              placeholder="Aluguel, hosting, software..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select
              value={category}
              onValueChange={(v) => v && setCategory(v as "fixo" | "variavel")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixo">Fixo</SelectItem>
                <SelectItem value="variavel">Variável</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Modo de pagamento — só na criação */}
          {!editing && (
            <div className="space-y-1.5">
              <Label>Pagamento</Label>
              <div className="flex gap-1">
                {(["avista", "parcelado"] as PaymentMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMode(m)}
                    className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                      paymentMode === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {m === "avista" ? "À vista" : "Parcelado"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Número de parcelas */}
          {isParcelado && (
            <div className="space-y-1.5">
              <Label>Número de parcelas</Label>
              <Input
                type="number"
                min="2"
                max="60"
                required
                value={installmentsTotal}
                onChange={(e) => setInstallmentsTotal(e.target.value)}
                placeholder="2"
              />
            </div>
          )}

          {/* Já paga — oculto em parcelado (todas começam pendentes) */}
          {!isParcelado && (
            <div className="flex items-center gap-2">
              <input
                id="isPaid"
                type="checkbox"
                checked={isPaid}
                onChange={(e) => setIsPaid(e.target.checked)}
                className="w-4 h-4"
              />
              <Label htmlFor="isPaid" className="cursor-pointer">
                Já paga
              </Label>
            </div>
          )}

          {/* Recorrente — só em à vista e sem edição de parcela */}
          {!isParcelado && (
            <div className="flex items-center gap-2">
              <input
                id="isRecurring"
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-4 h-4"
              />
              <Label htmlFor="isRecurring" className="cursor-pointer">
                Despesa recorrente (lançar automaticamente no próximo mês)
              </Label>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes opcionais..."
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Salvando..."
                : editing
                ? "Salvar"
                : isParcelado
                ? `Criar ${installmentsTotal || "N"} parcelas`
                : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
