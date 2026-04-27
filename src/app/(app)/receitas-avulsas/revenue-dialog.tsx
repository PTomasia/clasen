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
import { createRevenueAction, updateRevenueAction } from "@/lib/actions/revenues";
import { REVENUE_PRODUCTS } from "@/lib/constants";
import type { RevenueRow } from "@/lib/services/revenues";

export function RevenueDialog({
  open,
  onClose,
  clients,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  clients: { id: number; name: string }[];
  editing?: RevenueRow | null;
}) {
  const { isPending, error, run } = useDialogAction(() => {
    onClose();
  });

  const [clientMode, setClientMode] = useState<"none" | "existing" | "new">("none");
  const [clientId, setClientId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [product, setProduct] = useState<string>("Arte para tráfego");
  const [productCustom, setProductCustom] = useState("");
  const [channel, setChannel] = useState("");
  const [campaign, setCampaign] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      if (editing.clientId) {
        setClientMode("existing");
        setClientId(String(editing.clientId));
      } else {
        setClientMode("none");
        setClientId("");
      }
      setClientName("");
      setDate(editing.date);
      setAmount(String(editing.amount));
      const isStandard = (REVENUE_PRODUCTS as readonly string[]).includes(editing.product);
      setProduct(isStandard ? editing.product : "Outro");
      setProductCustom(isStandard ? "" : editing.product);
      setChannel(editing.channel ?? "");
      setCampaign(editing.campaign ?? "");
      setIsPaid(editing.isPaid);
      setNotes(editing.notes ?? "");
    } else {
      setClientMode("none");
      setClientId("");
      setClientName("");
      setDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setProduct("Arte para tráfego");
      setProductCustom("");
      setChannel("");
      setCampaign("");
      setIsPaid(true);
      setNotes("");
    }
  }, [open, editing]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const productFinal = product === "Outro" ? productCustom.trim() : product;
    const input = {
      clientId: clientMode === "existing" && clientId ? Number(clientId) : null,
      clientName: clientMode === "new" ? clientName.trim() || null : null,
      date,
      amount: parseFloat(amount),
      product: productFinal,
      channel: channel.trim() || null,
      campaign: campaign.trim() || null,
      isPaid,
      notes: notes.trim() || null,
    };

    run(async () => {
      if (editing) {
        await updateRevenueAction(editing.id, input);
      } else {
        await createRevenueAction(input);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar receita avulsa" : "Nova receita avulsa"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="150,00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Produto</Label>
            <Select value={product} onValueChange={(v) => v && setProduct(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVENUE_PRODUCTS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {product === "Outro" && (
              <Input
                placeholder="Descreva o produto"
                value={productCustom}
                onChange={(e) => setProductCustom(e.target.value)}
                required
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Cliente (opcional)</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={clientMode === "none" ? "default" : "outline"}
                onClick={() => { setClientMode("none"); setClientId(""); setClientName(""); }}
              >
                Nenhum
              </Button>
              {clients.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant={clientMode === "existing" ? "default" : "outline"}
                  onClick={() => setClientMode("existing")}
                >
                  Existente
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant={clientMode === "new" ? "default" : "outline"}
                onClick={() => { setClientMode("new"); setClientId(""); }}
              >
                Novo
              </Button>
            </div>
            {clientMode === "existing" && (
              <Select value={clientId} onValueChange={(v) => v && setClientId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {clientMode === "new" && (
              <Input
                placeholder="Nome do cliente"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="channel">Canal (opcional)</Label>
              <Input
                id="channel"
                placeholder="WhatsApp, Instagram..."
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign">Campanha (opcional)</Label>
              <Input
                id="campaign"
                placeholder="Indicação, promoção..."
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isPaid"
              type="checkbox"
              checked={isPaid}
              onChange={(e) => setIsPaid(e.target.checked)}
              className="w-4 h-4"
            />
            <Label htmlFor="isPaid" className="cursor-pointer">
              Pagamento recebido
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Observação</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              {isPending ? "Salvando..." : editing ? "Salvar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
