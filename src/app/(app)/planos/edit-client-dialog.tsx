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

const CONTACT_ORIGINS = ["Instagram", "Indicação", "Google", "WhatsApp", "Outro"];
const PLAN_TYPES = ["Personalizado", "Essential", "Tráfego", "Site"];
const BILLING_CYCLES = [5, 10, 15, 20, 30];

export interface EditDialogData {
  clientId: number;
  clientName: string;
  contactOrigin: string | null;
  clientNotes: string | null;
  planId: number;
  planType: string;
  planValue: number;
  billingCycleDays: number | null;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
  planNotes: string | null;
}

export function EditClientDialog({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: EditDialogData;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Client fields
  const [name, setName] = useState(data.clientName);
  const [contactOrigin, setContactOrigin] = useState(data.contactOrigin ?? "");
  const [clientNotes, setClientNotes] = useState(data.clientNotes ?? "");

  // Plan fields
  const [planType, setPlanType] = useState(data.planType);
  const [planValue, setPlanValue] = useState(data.planValue.toString());
  const [billingCycleDays, setBillingCycleDays] = useState(
    data.billingCycleDays?.toString() ?? ""
  );
  const [postsCarrossel, setPostsCarrossel] = useState(data.postsCarrossel.toString());
  const [postsReels, setPostsReels] = useState(data.postsReels.toString());
  const [postsEstatico, setPostsEstatico] = useState(data.postsEstatico.toString());
  const [postsTrafego, setPostsTrafego] = useState(data.postsTrafego.toString());
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
    setError(null);

    startTransition(async () => {
      try {
        await Promise.all([
          updateClientAction({
            clientId: data.clientId,
            name,
            contactOrigin: contactOrigin || undefined,
            notes: clientNotes || undefined,
          }),
          updatePlanAction({
            planId: data.planId,
            planType,
            planValue: parseFloat(planValue),
            billingCycleDays: billingCycleDays ? parseInt(billingCycleDays) : undefined,
            postsCarrossel: parseInt(postsCarrossel) || 0,
            postsReels: parseInt(postsReels) || 0,
            postsEstatico: parseInt(postsEstatico) || 0,
            postsTrafego: parseInt(postsTrafego) || 0,
            notes: planNotes || undefined,
          }),
        ]);
        onClose();
      } catch (err: any) {
        setError(err.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar plano e cliente</DialogTitle>
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
            <div className="grid grid-cols-3 gap-3">
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
                <Label>Ciclo (dias)</Label>
                <Select value={billingCycleDays} onValueChange={(v) => v && setBillingCycleDays(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {BILLING_CYCLES.map((c) => (
                      <SelectItem key={c} value={c.toString()}>{c} dias</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
