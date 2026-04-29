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
import { updateClientAction } from "@/lib/actions/plans";
import { createClientAction } from "@/lib/actions/clients";
import { ORIGINS, NICHES } from "@/lib/constants";

export interface EditClientQuickData {
  clientId: number;
  name: string;
  contactOrigin: string | null;
  clientSince: string | null;
  birthday: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  niche: string | null;
  yearsInPractice: number | null;
  consultaTicket: number | null;
  hasPhysicalOffice: boolean | null;
  birthYear: number | null;
  targetAudience: string | null;
  notes: string | null;
}

const EMPTY_DATA: EditClientQuickData = {
  clientId: 0,
  name: "",
  contactOrigin: null,
  clientSince: null,
  birthday: null,
  whatsapp: null,
  email: null,
  city: null,
  state: null,
  niche: null,
  yearsInPractice: null,
  consultaTicket: null,
  hasPhysicalOffice: null,
  birthYear: null,
  targetAudience: null,
  notes: null,
};

export function EditClientQuickDialog({
  open,
  onClose,
  data,
  mode = "edit",
}: {
  open: boolean;
  onClose: () => void;
  data?: EditClientQuickData;
  mode?: "edit" | "create";
}) {
  const effectiveData = data ?? EMPTY_DATA;
  const { isPending, error, run } = useDialogAction(onClose);

  const [name, setName] = useState(effectiveData.name);
  const [contactOrigin, setContactOrigin] = useState(effectiveData.contactOrigin ?? "");
  const [clientSince, setClientSince] = useState(effectiveData.clientSince ?? "");
  const [birthday, setBirthday] = useState(effectiveData.birthday ?? "");
  const [whatsapp, setWhatsapp] = useState(effectiveData.whatsapp ?? "");
  const [email, setEmail] = useState(effectiveData.email ?? "");
  // ICP
  const [city, setCity] = useState(effectiveData.city ?? "");
  const [state, setState] = useState(effectiveData.state ?? "");
  const [niche, setNiche] = useState(effectiveData.niche ?? "");
  const [yearsInPractice, setYearsInPractice] = useState(
    effectiveData.yearsInPractice != null ? String(effectiveData.yearsInPractice) : ""
  );
  const [consultaTicket, setConsultaTicket] = useState(
    effectiveData.consultaTicket != null ? String(effectiveData.consultaTicket) : ""
  );
  const [hasPhysicalOffice, setHasPhysicalOffice] = useState(
    effectiveData.hasPhysicalOffice != null ? (effectiveData.hasPhysicalOffice ? "sim" : "nao") : ""
  );
  const [birthYear, setBirthYear] = useState(
    effectiveData.birthYear != null ? String(effectiveData.birthYear) : ""
  );
  const [targetAudience, setTargetAudience] = useState(effectiveData.targetAudience ?? "");
  const [notes, setNotes] = useState(effectiveData.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name,
      contactOrigin: contactOrigin || undefined,
      clientSince: clientSince || undefined,
      birthday: birthday || undefined,
      whatsapp: whatsapp || undefined,
      email: email || undefined,
      city: city || undefined,
      state: state || undefined,
      niche: niche || undefined,
      yearsInPractice: yearsInPractice ? Number(yearsInPractice) : undefined,
      consultaTicket: consultaTicket ? Number(consultaTicket) : undefined,
      hasPhysicalOffice:
        hasPhysicalOffice === "sim" ? true : hasPhysicalOffice === "nao" ? false : undefined,
      birthYear: birthYear ? Number(birthYear) : undefined,
      targetAudience: targetAudience || undefined,
      notes: notes || undefined,
    };

    if (mode === "create") {
      run(() => createClientAction(payload));
    } else {
      run(() => updateClientAction({ clientId: effectiveData.clientId, ...payload }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Cadastrar cliente" : "Editar cliente"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* ─── Dados básicos ─── */}
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label>Origem do contato</Label>
            <Select value={contactOrigin} onValueChange={(v) => v && setContactOrigin(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {ORIGINS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Cliente desde</Label>
            <Input
              type="date"
              value={clientSince}
              onChange={(e) => setClientSince(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Preencha se a cliente é mais antiga que o primeiro plano registrado
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Aniversário</Label>
              <Input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp</Label>
              <Input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="(11) 98888-7777"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@exemplo.com"
            />
          </div>

          {/* ─── Perfil profissional (ICP) ─── */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Perfil profissional
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="São Paulo"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Nicho</Label>
                <Select value={niche} onValueChange={(v) => v && setNiche(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {NICHES.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Anos de prática</Label>
                  <Input
                    type="number"
                    min="0"
                    value={yearsInPractice}
                    onChange={(e) => setYearsInPractice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor consulta</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={consultaTicket}
                    onChange={(e) => setConsultaTicket(e.target.value)}
                    placeholder="R$"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ano nasc.</Label>
                  <Input
                    type="number"
                    min="1940"
                    max="2010"
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    placeholder="1990"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Consultório físico?</Label>
                <Select value={hasPhysicalOffice} onValueChange={(v) => v && setHasPhysicalOffice(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Não informado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Público-alvo</Label>
                <Input
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Ex: mulheres 25-40, autoconhecimento"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
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
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
