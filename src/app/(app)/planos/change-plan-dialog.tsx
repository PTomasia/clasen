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
import { changePlanAction } from "@/lib/actions/plans";
import { calcularCustoPost } from "@/lib/utils/calculations";
import { formatBRL } from "@/lib/utils/formatting";

const PLAN_TYPES = ["Personalizado", "Essential", "Tráfego", "Site"];
const BILLING_CYCLES = [5, 10, 15, 20, 30];

export interface ChangePlanData {
  planId: number;
  clientName: string;
  planType: string;
  planValue: number;
  billingCycleDays: number | null;
  billingCycleDays2: number | null;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
}

export function ChangePlanDialog({
  open,
  onClose,
  data,
  movementType,
}: {
  open: boolean;
  onClose: () => void;
  data: ChangePlanData;
  movementType: "Upgrade" | "Downgrade";
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  // New plan fields — pre-filled with current plan data
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
  const [startDate, setStartDate] = useState(today);
  const [notes, setNotes] = useState("");

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
        await changePlanAction({
          oldPlanId: data.planId,
          endDate: startDate, // plano antigo encerra na data de início do novo
          newPlan: {
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
          },
        });
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
          <DialogTitle>
            {movementType} — {data.clientName}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          O plano atual será encerrado e um novo será criado automaticamente.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Tipo e Valor */}
          <div className="grid grid-cols-4 gap-3">
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
              <Label>Vencimento</Label>
              <Select value={billingCycleDays} onValueChange={(v) => v && setBillingCycleDays(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((c) => (
                    <SelectItem key={c} value={c.toString()}>Dia {c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>2º venc.</Label>
              <Select value={billingCycleDays2} onValueChange={(v) => v && setBillingCycleDays2(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((c) => (
                    <SelectItem key={c} value={c.toString()}>Dia {c}</SelectItem>
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

          {/* Data início */}
          <div className="space-y-1">
            <Label>Data início do novo plano</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea
              placeholder="Notas sobre a mudança..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : `Confirmar ${movementType}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
