"use client";

import { useState, useEffect } from "react";
import { useDialogAction } from "@/lib/hooks/use-dialog-action";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateClientAction, updatePlanAction } from "@/lib/actions/plans";
import { calcularCustoPost } from "@/lib/utils/calculations";
import { formatBRL } from "@/lib/utils/formatting";

import { ORIGINS as CONTACT_ORIGINS, PLAN_TYPES } from "@/lib/constants";

export interface EditDialogData {
  clientId: number;
  clientName: string;
  contactOrigin: string | null;
  clientNotes: string | null;
  clientSince: string | null;
  planId: number;
  planType: string;
  planValue: number;
  billingCycleDays: number | null;
  billingCycleDays2: number | null;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
  startDate: string;
  planNotes: string | null;
}

export function EditClientDialog({
  open,
  onClose,
  onNavigate,
  data,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate?: (direction: "prev" | "next") => void;
  data: EditDialogData;
}) {
  const { isPending, error, run } = useDialogAction(onClose);

  useEffect(() => {
    if (!open || !onNavigate) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        onNavigate!("prev");
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        onNavigate!("next");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onNavigate]);

  // Client fields
  const [name, setName] = useState(data.clientName);
  const [contactOrigin, setContactOrigin] = useState(data.contactOrigin ?? "");
  const [clientNotes, setClientNotes] = useState(data.clientNotes ?? "");
  const [clientSince, setClientSince] = useState(data.clientSince ?? "");

  // Plan fields
  const [planType, setPlanType] = useState(data.planType);
  const [planValue, setPlanValue] = useState(data.planValue.toString());
  const [billingCycleDays, setBillingCycleDays] = useState(
    data.billingCycleDays?.toString() ?? ""
  );
  const [billingCycleDays2, setBillingCycleDays2] = useState(
    data.billingCycleDays2?.toString() ?? ""
  );
  const [postsCarrossel, setPostsCarrossel] = useState(data.postsCarrossel.toString());
  const [postsReels, setPostsReels] = useState(data.postsReels.toString());
  const [postsEstatico, setPostsEstatico] = useState(data.postsEstatico.toString());
  const [postsTrafego, setPostsTrafego] = useState(data.postsTrafego.toString());
  const [startDate, setStartDate] = useState(data.startDate);
  const [planNotes, setPlanNotes] = useState(data.planNotes ?? "");

  // $/post preview
  const custoPost = calcularCustoPost({
    valor: parseFloat(planValue) || 0,
    carrossel: parseInt(postsCarrossel) || 0,
    reels: parseInt(postsReels) || 0,
    estatico: parseInt(postsEstatico) || 0,
    trafego: parseInt(postsTrafego) || 0,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(() =>
      Promise.all([
        updateClientAction({
          clientId: data.clientId,
          name,
          contactOrigin: contactOrigin || undefined,
          clientSince: clientSince || undefined,
          notes: clientNotes || undefined,
        }),
        updatePlanAction({
          planId: data.planId,
          planType,
          planValue: parseFloat(planValue),
          billingCycleDays: billingCycleDays ? parseInt(billingCycleDays) : undefined,
          billingCycleDays2: billingCycleDays2 ? parseInt(billingCycleDays2) : undefined,
          postsCarrossel: parseInt(postsCarrossel) || 0,
          postsReels: parseInt(postsReels) || 0,
          postsEstatico: parseInt(postsEstatico) || 0,
          postsTrafego: parseInt(postsTrafego) || 0,
          startDate: startDate || undefined,
          notes: planNotes || undefined,
        }),
      ])
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between pr-8">
          <DialogTitle>Editar plano e cliente</DialogTitle>
          {onNavigate && (
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onNavigate("prev")}
                title="Plano anterior (← ou ↑)"
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onNavigate("next")}
                title="Próximo plano (→ ou ↓)"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* ── Cliente ── */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-muted-foreground">Cliente</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Origem</Label>
                <Select value={contactOrigin} onValueChange={(v) => v && setContactOrigin(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="De onde veio?" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_ORIGINS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Cliente desde (data real, para ajustar permanência)</Label>
              <Input
                type="date"
                value={clientSince}
                onChange={(e) => setClientSince(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Se preenchido, sobrescreve a data de início do primeiro plano no
                cálculo de permanência.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Obs. cliente</Label>
              <Textarea
                placeholder="Notas sobre o cliente..."
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                rows={2}
              />
            </div>
          </fieldset>

          {/* ── Plano ── */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-muted-foreground">Plano</legend>
            <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr] gap-3 items-end">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={planType} onValueChange={(v) => v && setPlanType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={planValue}
                  onChange={(e) => setPlanValue(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label title="Dia do mês em que o plano vence">Venc.</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="—"
                  value={billingCycleDays}
                  onChange={(e) => setBillingCycleDays(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label title="2º dia de vencimento (planos com 2 cobranças por mês)">
                  2º venc.
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="—"
                  value={billingCycleDays2}
                  onChange={(e) => setBillingCycleDays2(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Início do plano</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            {/* Posts */}
            <div className="space-y-1">
              <Label>Posts</Label>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Carrossel</Label>
                  <Input type="number" min="0" value={postsCarrossel} onChange={(e) => setPostsCarrossel(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Reels</Label>
                  <Input type="number" min="0" value={postsReels} onChange={(e) => setPostsReels(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Estático</Label>
                  <Input type="number" min="0" value={postsEstatico} onChange={(e) => setPostsEstatico(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tráfego</Label>
                  <Input type="number" min="0" value={postsTrafego} onChange={(e) => setPostsTrafego(e.target.value)} />
                </div>
              </div>
              {custoPost !== null && (
                <p className="text-sm text-primary font-medium">
                  $/post: {formatBRL(custoPost)}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Obs. plano</Label>
              <Textarea
                placeholder="Notas sobre o plano..."
                value={planNotes}
                onChange={(e) => setPlanNotes(e.target.value)}
                rows={2}
              />
            </div>
          </fieldset>

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
