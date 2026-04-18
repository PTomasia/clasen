"use client";

import { useEffect, useState } from "react";
import { useDialogAction } from "@/lib/hooks/use-dialog-action";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getClientDetailAction } from "@/lib/actions/clients";
import { formatBRL, formatDate } from "@/lib/utils/formatting";

interface PlanRow {
  id: number;
  planType: string;
  planValue: number;
  startDate: string;
  endDate: string | null;
  status: string;
  movementType: string | null;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
}

interface Avulsa {
  id: number;
  date: string;
  amount: number;
  product: string;
  isPaid: boolean;
}

interface ClientDetail {
  id: number;
  name: string;
  contactOrigin: string | null;
  birthday: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  niche: string | null;
  yearsInPractice: number | null;
  consultaTicket: number | null;
  hasPhysicalOffice: boolean | null;
  birthYear: number | null;
  targetAudience: string | null;
  notes: string | null;
  status: "ativo" | "inativo";
  permanencia: number;
  plans: PlanRow[];
  ltv: number;
  ltvRecorrente: number;
  ltvAvulsas: number;
  avulsas: Avulsa[];
}

export function ClientDetailDialog({
  open,
  onClose,
  clientId,
  clientName,
}: {
  open: boolean;
  onClose: () => void;
  clientId: number;
  clientName: string;
}) {
  const { isPending, error, run } = useDialogAction();
  const [data, setData] = useState<ClientDetail | null>(null);

  useEffect(() => {
    if (open && clientId) {
      setData(null);
      run(async () => {
        const result = await getClientDetailAction(clientId);
        setData(result);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{clientName}</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        {isPending && (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
        )}

        {data && (
          <>
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant={data.status === "ativo" ? "default" : "secondary"}>
                {data.status === "ativo" ? "Ativo" : "Inativo"}
              </Badge>
              <span className="text-muted-foreground">
                {data.permanencia} meses de permanência
              </span>
              {data.contactOrigin && (
                <span className="text-muted-foreground">
                  Origem: {data.contactOrigin}
                </span>
              )}
            </div>

            {(data.whatsapp || data.birthday) && (
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {data.whatsapp && (
                  <span>WhatsApp: <span className="text-foreground font-mono">{data.whatsapp}</span></span>
                )}
                {data.birthday && (
                  <span>Aniversário: <span className="text-foreground">{formatDate(data.birthday)}</span></span>
                )}
              </div>
            )}

            {/* Perfil profissional (ICP) */}
            {(data.city || data.niche || data.yearsInPractice != null || data.consultaTicket != null || data.birthYear || data.targetAudience || data.hasPhysicalOffice != null) && (
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Perfil profissional
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {data.niche && (
                    <div>
                      <span className="text-muted-foreground">Nicho: </span>
                      <span>{data.niche}</span>
                    </div>
                  )}
                  {(data.city || data.state) && (
                    <div>
                      <span className="text-muted-foreground">Local: </span>
                      <span>{[data.city, data.state].filter(Boolean).join(", ")}</span>
                    </div>
                  )}
                  {data.yearsInPractice != null && (
                    <div>
                      <span className="text-muted-foreground">Tempo de prática: </span>
                      <span>{data.yearsInPractice} anos</span>
                    </div>
                  )}
                  {data.consultaTicket != null && (
                    <div>
                      <span className="text-muted-foreground">Valor consulta: </span>
                      <span className="font-mono">{formatBRL(data.consultaTicket)}</span>
                    </div>
                  )}
                  {data.birthYear != null && (
                    <div>
                      <span className="text-muted-foreground">Nascimento: </span>
                      <span>{data.birthYear} ({new Date().getFullYear() - data.birthYear} anos)</span>
                    </div>
                  )}
                  {data.hasPhysicalOffice != null && (
                    <div>
                      <span className="text-muted-foreground">Consultório: </span>
                      <span>{data.hasPhysicalOffice ? "Sim" : "Não"}</span>
                    </div>
                  )}
                </div>
                {data.targetAudience && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Público-alvo: </span>
                    <span>{data.targetAudience}</span>
                  </div>
                )}
              </div>
            )}

            {data.notes && (
              <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                {data.notes}
              </p>
            )}

            {/* LTV card */}
            <div className="border rounded-lg p-3 bg-muted/40">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                LTV — Lifetime Value
              </p>
              <p className="text-2xl font-bold font-mono">{formatBRL(data.ltv)}</p>
              <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                <span>
                  Recorrente:{" "}
                  <span className="text-foreground font-mono">
                    {formatBRL(data.ltvRecorrente)}
                  </span>
                </span>
                <span>
                  Avulsas:{" "}
                  <span className="text-foreground font-mono">
                    {formatBRL(data.ltvAvulsas)}
                  </span>
                </span>
              </div>
            </div>

            <h3 className="text-sm font-semibold mt-2">
              Histórico de planos ({data.plans.length})
            </h3>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Mov.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium text-sm">{plan.planType}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatBRL(plan.planValue)}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(plan.startDate)}</TableCell>
                    <TableCell className="text-sm">
                      {plan.endDate ? formatDate(plan.endDate) : (
                        <Badge variant="outline" className="text-xs">Ativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {plan.movementType || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {data.avulsas.length > 0 && (
              <>
                <h3 className="text-sm font-semibold mt-2">
                  Receitas avulsas ({data.avulsas.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.avulsas
                      .slice()
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-sm">{formatDate(a.date)}</TableCell>
                          <TableCell className="text-sm">{a.product}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatBRL(a.amount)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {a.isPaid ? (
                              <Badge className="bg-success/10 text-success border-success/20">Pago</Badge>
                            ) : (
                              <Badge variant="outline">Pendente</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
