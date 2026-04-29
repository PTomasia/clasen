"use client";

import { useEffect, useState, useTransition } from "react";
import { useDialogAction } from "@/lib/hooks/use-dialog-action";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2 } from "lucide-react";
import {
  deletePaymentAction,
  getPaymentHistoryAction,
  skipPaymentMonthAction,
  updatePaymentAction,
} from "@/lib/actions/plans";
import { formatBRL } from "@/lib/utils/formatting";

interface PaymentHistoryData {
  planId: number;
  planType: string;
  planValue: number;
  billingCycleDays: number | null;
  startDate: string;
  nextPaymentDate: string | null;
  payments: {
    id: number;
    paymentDate: string;
    amount: number;
    status: string;
    notes: string | null;
    skipped: boolean;
  }[];
  gaps: string[];
}

type EditingPayment = NonNullable<PaymentHistoryData["payments"][number]>;

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pago") {
    return <Badge className="bg-success text-success-foreground">Pago</Badge>;
  }
  if (status === "pendente") {
    return <Badge className="bg-accent text-accent-foreground">Pendente</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

export function PaymentHistoryDialog({
  open,
  onClose,
  planId,
  clientName,
}: {
  open: boolean;
  onClose: () => void;
  planId: number;
  clientName: string;
}) {
  const { isPending, error, run } = useDialogAction();
  const [data, setData] = useState<PaymentHistoryData | null>(null);
  const [freezePending, startFreeze] = useTransition();
  const [freezingMonth, setFreezingMonth] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingPayment | null>(null);
  const [deleting, setDeleting] = useState<EditingPayment | null>(null);

  async function refreshData() {
    const result = await getPaymentHistoryAction(planId);
    setData(result);
  }

  function handleFreeze(gapDate: string) {
    const month = gapDate.slice(0, 7);
    setFreezingMonth(month);
    startFreeze(async () => {
      await skipPaymentMonthAction(planId, month);
      await refreshData();
      setFreezingMonth(null);
    });
  }

  useEffect(() => {
    if (open && planId) {
      setData(null);
      run(async () => {
        const result = await getPaymentHistoryAction(planId);
        setData(result);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planId]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagamentos — {clientName}</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        {isPending && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Carregando...
          </p>
        )}

        {data && (
          <>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{data.planType}</span>
              <span>{formatBRL(data.planValue)}/mês</span>
              {data.billingCycleDays && (
                <span>Vence dia {data.billingCycleDays}</span>
              )}
            </div>

            {data.nextPaymentDate && (
              <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Próximo pagamento</p>
                  <p className="text-sm font-semibold">
                    {formatDate(data.nextPaymentDate)}
                  </p>
                </div>
                <p className="text-base font-mono font-semibold text-primary">
                  {formatBRL(data.planValue)}
                </p>
              </div>
            )}

            {data.gaps.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
                <p className="text-sm font-semibold text-destructive">
                  {data.gaps.length === 1
                    ? "1 vencimento em aberto"
                    : `${data.gaps.length} vencimentos em aberto`}
                </p>
                {data.gaps.map((gapDate) => (
                  <div key={gapDate} className="flex items-center justify-between">
                    <span className="text-xs text-destructive/80 font-mono">
                      {formatDate(gapDate)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs px-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={freezePending && freezingMonth === gapDate.slice(0, 7)}
                      onClick={() => handleFreeze(gapDate)}
                    >
                      {freezePending && freezingMonth === gapDate.slice(0, 7)
                        ? "Congelando..."
                        : "Congelar"}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {data.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum pagamento registrado
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Obs.</TableHead>
                    <TableHead className="w-[64px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">
                        {formatDate(p.paymentDate)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatBRL(p.amount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                        {p.notes || "—"}
                      </TableCell>
                      <TableCell className="text-right p-1">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 w-7 p-0 ${p.skipped ? "invisible" : ""}`}
                            onClick={() => setEditing(p)}
                            disabled={p.skipped}
                            title="Editar pagamento"
                          >
                            <Pencil size={12} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleting(p)}
                            title={p.skipped ? "Descongelar mês" : "Excluir pagamento"}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </DialogContent>

      {editing && (
        <EditPaymentDialog
          open={!!editing}
          onClose={() => setEditing(null)}
          planId={planId}
          payment={editing}
          onSaved={async () => {
            setEditing(null);
            await refreshData();
          }}
        />
      )}

      {deleting && (
        <DeletePaymentDialog
          open={!!deleting}
          onClose={() => setDeleting(null)}
          planId={planId}
          payment={deleting}
          onDeleted={async () => {
            setDeleting(null);
            await refreshData();
          }}
        />
      )}
    </Dialog>
  );
}

// ─── EditPaymentDialog ────────────────────────────────────────────────────────

function EditPaymentDialog({
  open,
  onClose,
  planId,
  payment,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  planId: number;
  payment: EditingPayment;
  onSaved: () => Promise<void>;
}) {
  const { isPending, error, run } = useDialogAction();
  const [paymentDate, setPaymentDate] = useState(payment.paymentDate);
  const [amount, setAmount] = useState(String(payment.amount));
  const [status, setStatus] = useState(payment.status);
  const [notes, setNotes] = useState(payment.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      await updatePaymentAction(planId, payment.id, {
        paymentDate,
        amount: Number(amount),
        status,
        notes: notes.trim() || null,
      });
      await onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar pagamento</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <Label>Data</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Valor (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Observações</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── DeletePaymentDialog ──────────────────────────────────────────────────────

function DeletePaymentDialog({
  open,
  onClose,
  planId,
  payment,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  planId: number;
  payment: EditingPayment;
  onDeleted: () => Promise<void>;
}) {
  const { isPending, error, run } = useDialogAction();

  function handleDelete() {
    run(async () => {
      await deletePaymentAction(planId, payment.id);
      await onDeleted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {payment.skipped ? "Descongelar mês?" : "Excluir pagamento?"}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        <p className="text-sm">
          {payment.skipped ? (
            <>
              Remover o registro de mês congelado de{" "}
              <strong>{formatDate(payment.paymentDate)}</strong>? Os vencimentos
              voltarão a aparecer como em aberto.
            </>
          ) : (
            <>
              Excluir pagamento de <strong>{formatDate(payment.paymentDate)}</strong>{" "}
              ({formatBRL(payment.amount)})? Esta ação não pode ser desfeita.
            </>
          )}
        </p>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? "Excluindo..." : payment.skipped ? "Descongelar" : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
