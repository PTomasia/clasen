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

const ORIGINS = ["Instagram", "Indicação", "Google", "WhatsApp", "Outro"];

export interface EditClientQuickData {
  clientId: number;
  name: string;
  contactOrigin: string | null;
  clientSince: string | null;
  birthday: string | null;
  whatsapp: string | null;
  notes: string | null;
}

export function EditClientQuickDialog({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: EditClientQuickData;
}) {
  const { isPending, error, run } = useDialogAction(onClose);

  const [name, setName] = useState(data.name);
  const [contactOrigin, setContactOrigin] = useState(data.contactOrigin ?? "");
  const [clientSince, setClientSince] = useState(data.clientSince ?? "");
  const [birthday, setBirthday] = useState(data.birthday ?? "");
  const [whatsapp, setWhatsapp] = useState(data.whatsapp ?? "");
  const [notes, setNotes] = useState(data.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(() =>
      updateClientAction({
        clientId: data.clientId,
        name,
        contactOrigin: contactOrigin || undefined,
        clientSince: clientSince || undefined,
        birthday: birthday || undefined,
        whatsapp: whatsapp || undefined,
        notes: notes || undefined,
      })
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

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
              placeholder="Se diferente do primeiro plano"
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
