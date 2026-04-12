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
import { updateClientAction } from "@/lib/actions/plans";

const CONTACT_ORIGINS = ["Instagram", "Indicação", "Google", "WhatsApp", "Outro"];

interface EditClientDialogProps {
  open: boolean;
  onClose: () => void;
  client: { id: number; name: string; contactOrigin: string | null; notes: string | null };
}

export function EditClientDialog({ open, onClose, client }: EditClientDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(client.name);
  const [contactOrigin, setContactOrigin] = useState(client.contactOrigin ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        await updateClientAction({
          clientId: client.id,
          name,
          contactOrigin: contactOrigin || undefined,
          notes: notes || undefined,
        });
        onClose();
      } catch (err: any) {
        setError(err.message);
      }
    });
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
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Origem</Label>
            <Select value={contactOrigin} onValueChange={(v) => v && setContactOrigin(v)}>
              <SelectTrigger>
                <SelectValue placeholder="De onde veio?" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_ORIGINS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              placeholder="Notas sobre o cliente..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
