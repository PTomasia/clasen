"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createPlanAction } from "@/lib/actions/plans";
import { calcularCustoPost } from "@/lib/utils/calculations";
import { formatBRL } from "@/lib/utils/formatting";

interface Client {
  id: number;
  name: string;
}

import { PLAN_TYPES } from "@/lib/constants";
const MOVEMENT_TYPES = ["New", "Upgrade", "Downgrade"];

export function PlanFormDialog({
  open,
  onClose,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
}) {
  const { isPending, error, run, resetError } = useDialogAction(() => {
    resetForm();
    onClose();
  });

  // Form state
  const [clientMode, setClientMode] = useState<"existing" | "new">("new");
  const [clientId, setClientId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [planType, setPlanType] = useState("Personalizado");
  const [planValue, setPlanValue] = useState("");
  const [billingCycleDays, setBillingCycleDays] = useState("");
  const [billingCycleDays2, setBillingCycleDays2] = useState("");
  const [postsCarrossel, setPostsCarrossel] = useState("0");
  const [postsReels, setPostsReels] = useState("0");
  const [postsEstatico, setPostsEstatico] = useState("0");
  const [postsTrafego, setPostsTrafego] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [movementType, setMovementType] = useState("New");
  const [notes, setNotes] = useState("");

  // $/post preview
  const custoPost = calcularCustoPost({
    valor: parseFloat(planValue) || 0,
    carrossel: parseInt(postsCarrossel) || 0,
    reels: parseInt(postsReels) || 0,
    estatico: parseInt(postsEstatico) || 0,
    trafego: parseInt(postsTrafego) || 0,
  });

  function resetForm() {
    setClientMode("new");
    setClientId("");
    setClientName("");
    setPlanType("Personalizado");
    setPlanValue("");
    setBillingCycleDays("");
    setBillingCycleDays2("");
    setPostsCarrossel("0");
    setPostsReels("0");
    setPostsEstatico("0");
    setPostsTrafego("0");
    setStartDate("");
    setMovementType("New");
    setNotes("");
    resetError();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(() =>
      createPlanAction({
        ...(clientMode === "existing"
          ? { clientId: parseInt(clientId) }
          : { clientName }),
        planType,
        planValue: parseFloat(planValue),
        billingCycleDays: billingCycleDays ? parseInt(billingCycleDays) : undefined,
        billingCycleDays2: billingCycleDays2 ? parseInt(billingCycleDays2) : undefined,
        postsCarrossel: parseInt(postsCarrossel) || 0,
        postsReels: parseInt(postsReels) || 0,
        postsEstatico: parseInt(postsEstatico) || 0,
        postsTrafego: parseInt(postsTrafego) || 0,
        startDate,
        movementType,
        notes: notes || undefined,
      })
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Plano</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Cliente */}
          <div className="space-y-2">
            <Label>Cliente</Label>
            <div className="flex gap-2 mb-2">
              <Button
                type="button"
                variant={clientMode === "new" ? "default" : "outline"}
                size="sm"
                onClick={() => setClientMode("new")}
              >
                Novo
              </Button>
              {clients.length > 0 && (
                <Button
                  type="button"
                  variant={clientMode === "existing" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setClientMode("existing")}
                >
                  Existente
                </Button>
              )}
            </div>
            {clientMode === "new" ? (
              <Input
                placeholder="Nome do cliente"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
              />
            ) : (
              <Select value={clientId} onValueChange={(v) => v && setClientId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Tipo e Valor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de plano</Label>
              <Select value={planType} onValueChange={(v) => v && setPlanType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor mensal (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="500,00"
                value={planValue}
                onChange={(e) => setPlanValue(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Posts */}
          <div className="space-y-2">
            <Label>Composição de posts</Label>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Carrossel</Label>
                <Input
                  type="number"
                  min="0"
                  value={postsCarrossel}
                  onChange={(e) => setPostsCarrossel(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Reels</Label>
                <Input
                  type="number"
                  min="0"
                  value={postsReels}
                  onChange={(e) => setPostsReels(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Estático</Label>
                <Input
                  type="number"
                  min="0"
                  value={postsEstatico}
                  onChange={(e) => setPostsEstatico(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tráfego</Label>
                <Input
                  type="number"
                  min="0"
                  value={postsTrafego}
                  onChange={(e) => setPostsTrafego(e.target.value)}
                />
              </div>
            </div>
            {/* $/post preview */}
            {custoPost !== null && (
              <p className="text-sm text-primary font-medium">
                $/post: {formatBRL(custoPost)}
              </p>
            )}
          </div>

          {/* Datas e ciclo */}
          <div className="grid grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label>Data início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label title="Dia do mês em que o plano vence">Venc. *</Label>
              <Input
                type="number"
                min="1"
                max="31"
                placeholder="ex: 10"
                value={billingCycleDays}
                onChange={(e) => setBillingCycleDays(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>Movimentação</Label>
              <Select value={movementType} onValueChange={(v) => v && setMovementType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              placeholder="Notas sobre o plano..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar plano"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
