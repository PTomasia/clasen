"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, FileText } from "lucide-react";
import { formatBRL, formatDate } from "@/lib/utils/formatting";
import {
  parseStatementText,
  matchTransactions,
} from "@/lib/services/reconciliation";
import type { MatchProposal, ExpectedPayment } from "@/lib/services/reconciliation";
import { applyReconciliationAction } from "@/lib/actions/reconciliation";

interface ActivePlan {
  planId: number;
  clientName: string;
  planValue: number;
}

interface Props {
  activePlans: ActivePlan[];
  currentMonth: string; // YYYY-MM
  prevMonth: string; // YYYY-MM
}

const MONTH_LABELS: Record<string, string> = {};
function labelForMonth(m: string): string {
  const [y, mo] = m.split("-");
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${labels[Number(mo) - 1]}/${y.slice(2)}`;
}

export function ConciliacaoClient({ activePlans, currentMonth, prevMonth }: Props) {
  const [statementText, setStatementText] = useState("");
  const [targetMonth, setTargetMonth] = useState(currentMonth);
  const [proposals, setProposals] = useState<MatchProposal[]>([]);
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set()); // índices
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const [parsed, setParsed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ applied: number; errors: { planId: number; error: string }[] } | null>(null);

  const months = [prevMonth, currentMonth];

  function handleParse() {
    const txs = parseStatementText(statementText);
    const expectedPayments: ExpectedPayment[] = activePlans.map((p) => ({
      planId: p.planId,
      clientName: p.clientName,
      planValue: p.planValue,
      expectedMonth: targetMonth,
    }));
    const matches = matchTransactions(txs, expectedPayments, targetMonth);
    setProposals(matches);
    // Auto-confirma os de alta confiança
    const autoConfirmed = new Set<number>();
    matches.forEach((m, i) => {
      if (m.confidence === "high") autoConfirmed.add(i);
    });
    setConfirmed(autoConfirmed);
    setRejected(new Set());
    setParsed(true);
    setResult(null);
  }

  function toggleConfirm(i: number) {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
    setRejected((prev) => {
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }

  function toggleReject(i: number) {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
    setConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  }

  function handleApply() {
    const toApply = proposals
      .filter((_, i) => confirmed.has(i))
      .map((p) => ({
        planId: p.plan.planId,
        paymentDate: p.transaction.date,
        amount: p.transaction.amount,
      }));

    startTransition(async () => {
      const res = await applyReconciliationAction(toApply);
      setResult(res);
      if (res.applied > 0) {
        // Limpa os confirmados aplicados
        setStatementText("");
        setProposals([]);
        setParsed(false);
        setConfirmed(new Set());
        setRejected(new Set());
      }
    });
  }

  const confirmedCount = confirmed.size;
  const unhandled = proposals.filter((_, i) => !confirmed.has(i) && !rejected.has(i)).length;

  return (
    <div className="space-y-6">
      {/* Instruções */}
      <div className="bg-card border rounded-lg p-5 space-y-3">
        <div className="flex items-start gap-3">
          <FileText size={20} className="text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Como usar</p>
            <ol className="text-sm text-muted-foreground mt-1.5 space-y-1 list-decimal list-inside">
              <li>Abra o extrato do Banco Inter, selecione o período e copie todo o texto</li>
              <li>Cole no campo abaixo e escolha o mês de referência</li>
              <li>Clique em <strong>Analisar</strong> — o sistema identifica os pagamentos</li>
              <li>Confirme ou rejeite cada linha e clique em <strong>Registrar pagamentos</strong></li>
            </ol>
          </div>
        </div>
      </div>

      {/* Entrada */}
      <div className="bg-card border rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-1.5">
            <Label>Texto do extrato</Label>
            <Textarea
              rows={8}
              value={statementText}
              onChange={(e) => setStatementText(e.target.value)}
              placeholder={`Cole aqui o texto do extrato.\nEx:\n05/04/2026  PIX RECEBIDO  Ana Silva  800,00\n10/04/2026  PIX RECEBIDO  Joao Souza  500,00`}
              className="font-mono text-xs"
            />
          </div>
          <div className="sm:w-48 space-y-4">
            <div className="space-y-1.5">
              <Label>Mês de referência</Label>
              <Select value={targetMonth} onValueChange={(v) => v && setTargetMonth(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>
                      {labelForMonth(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleParse}
              disabled={!statementText.trim()}
              className="w-full"
            >
              Analisar extrato
            </Button>
          </div>
        </div>
      </div>

      {/* Resultado da análise */}
      {parsed && (
        <div className="space-y-4">
          {proposals.length === 0 ? (
            <div className="bg-card border rounded-lg p-6 text-center">
              <AlertCircle size={24} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhuma transação identificada. Verifique o formato do texto e o mês selecionado.
              </p>
            </div>
          ) : (
            <div className="bg-card border rounded-lg overflow-x-auto">
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <p className="font-medium">{proposals.length} transações encontradas</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {confirmedCount} confirmadas • {unhandled} aguardando decisão
                  </p>
                </div>
                <Button
                  onClick={handleApply}
                  disabled={confirmedCount === 0 || isPending}
                >
                  {isPending ? "Registrando..." : `Registrar ${confirmedCount} pagamento${confirmedCount !== 1 ? "s" : ""}`}
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição (extrato)</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Cliente sugerido</TableHead>
                    <TableHead>Confiança</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.map((p, i) => {
                    const isConfirmed = confirmed.has(i);
                    const isRejected = rejected.has(i);
                    return (
                      <TableRow
                        key={i}
                        className={
                          isConfirmed
                            ? "bg-success/5"
                            : isRejected
                            ? "opacity-40"
                            : undefined
                        }
                      >
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {p.transaction.date}
                        </TableCell>
                        <TableCell className="text-xs max-w-[220px] truncate" title={p.transaction.description}>
                          {p.transaction.description}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatBRL(p.transaction.amount)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium text-sm">{p.plan.clientName}</span>
                            <span className="text-xs text-muted-foreground ml-1.5">
                              ({formatBRL(p.plan.planValue)}/mês)
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{p.reason}</p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              p.confidence === "high"
                                ? "border-success/50 text-success bg-success/5"
                                : "border-accent/50 text-accent-foreground bg-accent/5"
                            }
                          >
                            {p.confidence === "high" ? "Alta" : "Média"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <button
                              title="Confirmar"
                              onClick={() => toggleConfirm(i)}
                              className={`p-1 rounded transition-colors ${isConfirmed ? "text-success" : "text-muted-foreground hover:text-success"}`}
                            >
                              <CheckCircle2 size={18} />
                            </button>
                            <button
                              title="Rejeitar"
                              onClick={() => toggleReject(i)}
                              className={`p-1 rounded transition-colors ${isRejected ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
                            >
                              <XCircle size={18} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Resultado da aplicação */}
      {result && (
        <div className={`rounded-lg p-4 text-sm ${result.errors.length === 0 ? "bg-success/10 text-success border border-success/30" : "bg-destructive/10 text-destructive border border-destructive/30"}`}>
          {result.applied > 0 && (
            <p className="font-medium">✓ {result.applied} pagamento{result.applied !== 1 ? "s" : ""} registrado{result.applied !== 1 ? "s" : ""} com sucesso.</p>
          )}
          {result.errors.length > 0 && (
            <div>
              <p className="font-medium">Erros ao registrar:</p>
              <ul className="mt-1 list-disc list-inside">
                {result.errors.map((e, i) => (
                  <li key={i}>Plano #{e.planId}: {e.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
