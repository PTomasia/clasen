"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  Check,
  Clipboard,
  Download,
  FileJson,
  FileText,
  Copy,
} from "lucide-react";
import { formatBRL } from "@/lib/utils/formatting";
import {
  previewBulkImportAction,
  applyBulkImportAction,
} from "@/lib/actions/bulk-import";
import { exportDictionaryAction } from "@/lib/actions/conciliacao-dictionary";
import { CONCILIACAO_CHATGPT_PROMPT } from "@/lib/conciliacao-prompt";
import type {
  BulkImportPreview,
  Decision,
  EntryStatus,
  PreviewItem,
  ApplyResult,
} from "@/lib/services/bulk-import";

const STATUS_LABELS: Record<EntryStatus, string> = {
  ready: "Pronto",
  low_confidence: "Confiança baixa",
  duplicate_warning: "Duplicata?",
  ambiguous: "Ambíguo",
  unknown_client: "Cliente novo",
  no_active_plan: "Sem plano ativo",
  skipped_by_directive: "Ignorado",
  error: "Erro",
};

const STATUS_COLORS: Record<EntryStatus, string> = {
  ready: "border-success/50 text-success bg-success/5",
  low_confidence: "border-destructive/30 text-destructive bg-destructive/5",
  duplicate_warning: "border-yellow-500/50 text-yellow-700 bg-yellow-500/5",
  ambiguous: "border-orange-500/50 text-orange-700 bg-orange-500/5",
  unknown_client: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
  no_active_plan: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
  skipped_by_directive: "border-muted-foreground/30 text-muted-foreground bg-muted/30",
  error: "border-destructive/50 text-destructive bg-destructive/10",
};

const TYPE_LABELS: Record<string, string> = {
  plan_payment: "Plano",
  one_time_revenue: "Avulso",
  expense: "Despesa",
};

function downloadBlob(filename: string, content: string, mime = "text/markdown") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function JsonImportClient() {
  const [rawJson, setRawJson] = useState("");
  const [preview, setPreview] = useState<BulkImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Map<number, Decision>>(new Map());
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [errorsAcked, setErrorsAcked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isExporting, startExport] = useTransition();
  const [promptCopied, setPromptCopied] = useState(false);

  function getDecision(index: number, status: EntryStatus): Decision {
    return (
      decisions.get(index) ?? {
        index,
        include: status === "ready",
      }
    );
  }

  function setDecision(index: number, patch: Partial<Decision>, status: EntryStatus) {
    const current = getDecision(index, status);
    const next: Decision = { ...current, ...patch, index };
    const m = new Map(decisions);
    m.set(index, next);
    setDecisions(m);
  }

  function handlePreview() {
    setResult(null);
    setErrorsAcked(false);
    setPreviewError(null);
    startTransition(async () => {
      const res = await previewBulkImportAction(rawJson);
      if (res.ok) {
        setPreview(res.preview);
        // Inicializar decisions com defaults
        const m = new Map<number, Decision>();
        for (const item of res.preview.items) {
          m.set(item.index, { index: item.index, include: item.status === "ready" });
        }
        setDecisions(m);
      } else {
        setPreview(null);
        setPreviewError(res.error);
      }
    });
  }

  function handleExportDictionary() {
    startExport(async () => {
      const { filename, content } = await exportDictionaryAction();
      downloadBlob(filename, content);
    });
  }

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(CONCILIACAO_CHATGPT_PROMPT);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      // Fallback raro (HTTP, browsers antigos): baixa como arquivo
      downloadBlob("conciliacao-prompt.txt", CONCILIACAO_CHATGPT_PROMPT, "text/plain");
    }
  }

  function handleApply() {
    if (!preview) return;
    const decisionsArray = Array.from(decisions.values());
    startTransition(async () => {
      const res = await applyBulkImportAction(rawJson, decisionsArray);
      if (res.ok) {
        setResult(res.result);
        setErrorsAcked(false);
      } else {
        setPreviewError(res.error);
      }
    });
  }

  function handleReset() {
    if (result && result.errors.length > 0 && !errorsAcked) return;
    setRawJson("");
    setPreview(null);
    setPreviewError(null);
    setDecisions(new Map());
    setResult(null);
    setErrorsAcked(false);
  }

  function handleCopyErrors() {
    if (!result || result.errors.length === 0) return;
    const payload = {
      source: preview?.source ?? "errors",
      entries: result.errors.map((e) => e.rawEntry),
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  }

  const includedCount = useMemo(() => {
    if (!preview) return 0;
    return preview.items.filter((item) => {
      const d = getDecision(item.index, item.status);
      if (item.status === "skipped_by_directive" || item.status === "error") return false;
      return d.include;
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, decisions]);

  const groupedItems = useMemo(() => {
    if (!preview) return null;
    const groups: Record<string, PreviewItem[]> = {
      plan_payment: [],
      one_time_revenue: [],
      expense: [],
      skipped: [],
      error: [],
    };
    for (const item of preview.items) {
      if (item.status === "skipped_by_directive") groups.skipped.push(item);
      else if (item.status === "error") groups.error.push(item);
      else groups[item.entry.type].push(item);
    }
    return groups;
  }, [preview]);

  const blockedByErrors = result !== null && result.errors.length > 0 && !errorsAcked;

  return (
    <div className="space-y-6">
      {/* Instruções + Dicionário */}
      <div className="bg-card border rounded-lg p-5 space-y-3">
        <div className="flex items-start gap-3">
          <FileText size={20} className="text-primary mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Fluxo recomendado</p>
            <ol className="text-sm text-muted-foreground mt-1.5 space-y-1 list-decimal list-inside">
              <li>
                Numa conversa nova do ChatGPT, cole o <strong>dicionário</strong> e o <strong>prompt</strong> (botões à direita)
              </li>
              <li>Anexe o PDF/CSV do extrato — o GPT devolve um JSON estruturado</li>
              <li>Cole o JSON aqui embaixo e clique em <strong>Analisar</strong></li>
              <li>Revise linha a linha e clique em <strong>Aplicar</strong></li>
            </ol>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <Button
              variant="outline"
              onClick={handleExportDictionary}
              disabled={isExporting}
            >
              <Download size={16} className="mr-1.5" />
              {isExporting ? "Gerando..." : "Baixar dicionário"}
            </Button>
            <Button
              variant="outline"
              onClick={handleCopyPrompt}
            >
              {promptCopied ? (
                <>
                  <Check size={16} className="mr-1.5" />
                  Copiado!
                </>
              ) : (
                <>
                  <Clipboard size={16} className="mr-1.5" />
                  Copiar prompt
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Entrada do JSON */}
      <div className="bg-card border rounded-lg p-5 space-y-4">
        <div className="flex flex-col gap-3">
          <div className="space-y-1.5">
            <Label>JSON do ChatGPT</Label>
            <Textarea
              rows={10}
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              placeholder='Cole o JSON gerado pelo ChatGPT. Aceita formato canônico (`entries[]`) ou legado (`pagamentos[]`).'
              className="font-mono text-xs"
              disabled={blockedByErrors}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handlePreview}
              disabled={!rawJson.trim() || isPending || blockedByErrors}
            >
              <FileJson size={16} className="mr-1.5" />
              {isPending && !preview ? "Analisando..." : "Analisar JSON"}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={blockedByErrors}>
              Limpar
            </Button>
          </div>
        </div>
        {previewError && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Erro ao analisar JSON</p>
                <p className="text-xs mt-0.5 font-mono">{previewError}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && groupedItems && (
        <div className="space-y-4">
          {/* Sumário */}
          <div className="bg-card border rounded-lg p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-medium">
                  {preview.items.length} linhas no JSON
                  {preview.skippedFromInput > 0 && (
                    <span className="text-muted-foreground text-sm font-normal ml-2">
                      (+{preview.skippedFromInput} em `desconsiderados[]`)
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <CountBadge label="Prontos" count={preview.counts.ready} color="bg-success/10 text-success" />
                  <CountBadge label="Confiança baixa" count={preview.counts.low_confidence} color="bg-destructive/10 text-destructive" />
                  <CountBadge label="Duplicatas" count={preview.counts.duplicate_warning} color="bg-yellow-500/10 text-yellow-700" />
                  <CountBadge label="Ambíguos" count={preview.counts.ambiguous} color="bg-orange-500/10 text-orange-700" />
                  <CountBadge label="Sem cadastro" count={preview.counts.unknown_client} color="bg-muted text-muted-foreground" />
                  <CountBadge label="Sem plano ativo" count={preview.counts.no_active_plan} color="bg-muted text-muted-foreground" />
                  <CountBadge label="Ignorados" count={preview.counts.skipped_by_directive} color="bg-muted text-muted-foreground" />
                  <CountBadge label="Erros" count={preview.counts.error} color="bg-destructive/10 text-destructive" />
                </p>
              </div>
              <Button onClick={handleApply} disabled={includedCount === 0 || isPending || blockedByErrors}>
                {isPending && preview ? "Aplicando..." : `Aplicar ${includedCount}`}
              </Button>
            </div>
          </div>

          {/* Grupos */}
          {groupedItems.plan_payment.length > 0 && (
            <GroupTable
              title="Pagamentos de plano"
              items={groupedItems.plan_payment}
              getDecision={getDecision}
              setDecision={setDecision}
            />
          )}
          {groupedItems.one_time_revenue.length > 0 && (
            <GroupTable
              title="Receitas avulsas"
              items={groupedItems.one_time_revenue}
              getDecision={getDecision}
              setDecision={setDecision}
            />
          )}
          {groupedItems.expense.length > 0 && (
            <GroupTable
              title="Despesas"
              items={groupedItems.expense}
              getDecision={getDecision}
              setDecision={setDecision}
            />
          )}
          {groupedItems.skipped.length > 0 && (
            <GroupTable
              title="Ignorados pelo ChatGPT"
              items={groupedItems.skipped}
              getDecision={getDecision}
              setDecision={setDecision}
              readonly
            />
          )}
          {groupedItems.error.length > 0 && (
            <GroupTable
              title="Linhas com erro de formato"
              items={groupedItems.error}
              getDecision={getDecision}
              setDecision={setDecision}
              readonly
            />
          )}
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div
          className={`rounded-lg p-4 text-sm border ${
            result.errors.length === 0
              ? "bg-success/10 text-success border-success/30"
              : "bg-yellow-500/10 text-yellow-800 border-yellow-500/30"
          }`}
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">
                {result.applied} linha{result.applied !== 1 ? "s" : ""} aplicada{result.applied !== 1 ? "s" : ""}
                {result.errors.length > 0 && ` • ${result.errors.length} erro${result.errors.length !== 1 ? "s" : ""}`}
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2 space-y-2">
                  <ul className="list-disc list-inside text-xs space-y-1">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        Linha {e.index} ({TYPE_LABELS[e.type] ?? e.type}): {e.reason}
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={handleCopyErrors}>
                      <Copy size={14} className="mr-1.5" />
                      Copiar erros como JSON
                    </Button>
                    {!errorsAcked && (
                      <Button size="sm" variant="outline" onClick={() => setErrorsAcked(true)}>
                        Entendi os erros
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {result.appliedIds.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer">IDs criados ({result.appliedIds.length})</summary>
                  <ul className="mt-1 font-mono text-[11px] space-y-0.5">
                    {result.appliedIds.map((a, i) => (
                      <li key={i}>
                        #{a.id} ({TYPE_LABELS[a.type] ?? a.type})
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CountBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] mr-1.5 mb-1 ${color}`}>
      {count} {label.toLowerCase()}
    </span>
  );
}

interface GroupTableProps {
  title: string;
  items: PreviewItem[];
  getDecision: (index: number, status: EntryStatus) => Decision;
  setDecision: (index: number, patch: Partial<Decision>, status: EntryStatus) => void;
  readonly?: boolean;
}

function GroupTable({ title, items, getDecision, setDecision, readonly }: GroupTableProps) {
  return (
    <div className="bg-card border rounded-lg overflow-x-auto">
      <div className="p-3 border-b">
        <p className="font-medium text-sm">
          {title} <span className="text-muted-foreground">({items.length})</span>
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Cliente / Descrição</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <RowItem
              key={item.index}
              item={item}
              getDecision={getDecision}
              setDecision={setDecision}
              readonly={readonly}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RowItem({
  item,
  getDecision,
  setDecision,
  readonly,
}: {
  item: PreviewItem;
  getDecision: (index: number, status: EntryStatus) => Decision;
  setDecision: (index: number, patch: Partial<Decision>, status: EntryStatus) => void;
  readonly?: boolean;
}) {
  const decision = getDecision(item.index, item.status);
  const dateStr = item.entry.date ?? item.entry.month ?? "—";
  const include = decision.include;
  const canInclude = item.status !== "skipped_by_directive" && item.status !== "error";

  return (
    <TableRow className={include ? "bg-success/5" : undefined}>
      <TableCell>
        {canInclude && !readonly && (
          <input
            type="checkbox"
            checked={include}
            onChange={(e) => setDecision(item.index, { include: e.target.checked }, item.status)}
            className="h-4 w-4 rounded border-input"
            aria-label="incluir"
          />
        )}
      </TableCell>
      <TableCell className="font-mono text-xs whitespace-nowrap">{dateStr}</TableCell>
      <TableCell className="text-right font-mono">{formatBRL(item.entry.amount)}</TableCell>
      <TableCell className="text-xs">
        <div className="font-medium">{item.entry.clientName ?? item.entry.description ?? "—"}</div>
        {item.entry.description && item.entry.clientName && (
          <div className="text-muted-foreground truncate max-w-[260px]" title={item.entry.description}>
            {item.entry.description}
          </div>
        )}
        {typeof item.entry.confidence === "number" && (
          <div className="text-muted-foreground text-[10px]">
            confiança {item.entry.confidence}%{item.entry.bank ? ` • ${item.entry.bank}` : ""}
          </div>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={STATUS_COLORS[item.status]}>
          {STATUS_LABELS[item.status]}
        </Badge>
        <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px]">{item.reason}</div>
      </TableCell>
      <TableCell>
        {/* Decisões inline por status */}
        {item.status === "ambiguous" && item.candidates && (
          <Select
            value={decision.clientIdOverride ? String(decision.clientIdOverride) : ""}
            onValueChange={(v) =>
              setDecision(item.index, { clientIdOverride: v ? Number(v) : null }, item.status)
            }
          >
            <SelectTrigger className="h-8 text-xs w-[180px]">
              <SelectValue placeholder="Escolher cliente" />
            </SelectTrigger>
            <SelectContent>
              {item.candidates.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {item.status === "unknown_client" && (
          <div className="flex gap-1">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={!!decision.createClient}
                onChange={(e) =>
                  setDecision(item.index, { createClient: e.target.checked }, item.status)
                }
                className="h-3.5 w-3.5"
              />
              criar
            </label>
          </div>
        )}
        {item.status === "no_active_plan" && (
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={!!decision.applyAsRevenue}
              onChange={(e) =>
                setDecision(item.index, { applyAsRevenue: e.target.checked }, item.status)
              }
              className="h-3.5 w-3.5"
            />
            avulsa
          </label>
        )}
      </TableCell>
    </TableRow>
  );
}
