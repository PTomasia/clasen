"use client";

import { useEffect, useState, useTransition } from "react";
import { useDialogAction } from "@/lib/hooks/use-dialog-action";
import { cn } from "@/lib/utils";
import { RotateCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createOperationalCheckAction,
  getCargaPlanejadaAction,
} from "@/lib/actions/operational";
import type { OperationalCheckRow } from "@/lib/services/operational";
import type { ActiveClientOption } from "@/lib/queries/operational";
import {
  CHECK_PERIODS,
  CHECK_PERIOD_LABELS,
  GARGALOS,
  MAX_GARGALOS,
  MOTIVOS_PESO,
  RATING_LABELS,
  RATING_DESCRIPTIONS,
  NIVEL_QUALITATIVO_VALUES,
  NIVEL_QUALITATIVO_LABELS,
  EXECUCAO_RETRABALHO_LABELS,
  type CheckPeriod,
  type RatingKey,
  type ExecucaoRetrabalhoKey,
} from "@/lib/constants";

// ─── Subcomponentes ─────────────────────────────────────────────────────────────

function RatingScale({
  field,
  value,
  onChange,
}: {
  field: RatingKey;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{RATING_LABELS[field]}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "flex-1 h-9 rounded-lg border text-sm font-medium transition-colors",
              value === n
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground min-h-[2rem]">
        {RATING_DESCRIPTIONS[field][value as 1 | 2 | 3 | 4 | 5]}
      </p>
    </div>
  );
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-2.5 py-1 rounded-full border text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border text-muted-foreground hover:bg-muted",
        disabled && !active && "opacity-40 cursor-not-allowed hover:bg-background"
      )}
    >
      {children}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min="0"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
    </div>
  );
}

// Escala qualitativa (Nada→Muito), ordinal 1-5. Toque no nível já selecionado limpa.
function QualScale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1">
        {NIVEL_QUALITATIVO_VALUES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              "flex-1 h-8 px-0.5 rounded-lg border text-[11px] font-medium transition-colors",
              value === n
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {NIVEL_QUALITATIVO_LABELS[n]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Estado dos campos numéricos ─────────────────────────────────────────────────

// Carga planejada/contratada — numérica, pré-preenchida dos planos (editável).
const NUM_KEYS = [
  "postsTotais",
  "unidadesOperacionais",
  "carrosseis",
  "reels",
  "estaticos",
  "criativosTrafego",
  "avulsos",
] as const;
type NumKey = (typeof NUM_KEYS)[number];

// Execução da Gabi e retrabalho — escala qualitativa (ordinal 1-5).
const QUALI_KEYS = [
  "entregasExecutadasGabi",
  "copysDevolvidas",
  "designsRefeitos",
  "postsRevisadosGabi",
  "postsRevisadosPedro",
] as const;

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

const DEFAULT_NOTAS: Record<RatingKey, number> = {
  execucaoDireta: 3,
  revisao: 3,
  direcaoCriativa: 3,
  energia: 3,
  capacidade: 3,
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Dialog ──────────────────────────────────────────────────────────────────────

export function OperationalCheckDialog({
  open,
  onClose,
  editing,
  activeClients,
}: {
  open: boolean;
  onClose: () => void;
  editing?: OperationalCheckRow | null;
  activeClients: ActiveClientOption[];
}) {
  const { isPending, error, run } = useDialogAction(onClose);
  const [pulling, startPull] = useTransition();

  const [period, setPeriod] = useState<CheckPeriod>("meio_mes");
  const [month, setMonth] = useState(currentMonth());
  const [notas, setNotas] = useState<Record<RatingKey, number>>(DEFAULT_NOTAS);
  const [gargalos, setGargalos] = useState<string[]>([]);
  const [clientesPesadasIds, setClientesPesadasIds] = useState<number[]>([]);
  const [motivosPeso, setMotivosPeso] = useState<string[]>([]);
  const [comentarioClientes, setComentarioClientes] = useState("");
  const [comentario, setComentario] = useState("");
  const [nums, setNums] = useState<Record<string, string>>({});
  const [quali, setQuali] = useState<Record<ExecucaoRetrabalhoKey, number | null>>({
    entregasExecutadasGabi: null,
    copysDevolvidas: null,
    designsRefeitos: null,
    postsRevisadosGabi: null,
    postsRevisadosPedro: null,
  });

  function setNum(k: NumKey, v: string) {
    setNums((prev) => ({ ...prev, [k]: v }));
  }
  function numVal(k: NumKey): number | null {
    const v = nums[k];
    if (v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  function setQual(k: ExecucaoRetrabalhoKey, n: number | null) {
    setQuali((prev) => ({ ...prev, [k]: n }));
  }

  // Pré-preenche os campos de carga planejada a partir dos planos + avulsos do mês.
  function aplicarCarga(carga: {
    postsTotais: number;
    unidadesOperacionais: number;
    carrosseis: number;
    reels: number;
    estaticos: number;
    criativosTrafego: number;
    avulsos: number;
  }) {
    setNums((prev) => ({
      ...prev,
      postsTotais: String(carga.postsTotais),
      unidadesOperacionais: String(carga.unidadesOperacionais),
      carrosseis: String(carga.carrosseis),
      reels: String(carga.reels),
      estaticos: String(carga.estaticos),
      criativosTrafego: String(carga.criativosTrafego),
      avulsos: String(carga.avulsos),
    }));
  }

  function recarregarCarga(targetMonth: string) {
    startPull(async () => {
      const carga = await getCargaPlanejadaAction(targetMonth);
      aplicarCarga(carga);
    });
  }

  // Inicializa o formulário ao abrir.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setPeriod(editing.period);
      setMonth(editing.referenceMonth);
      setNotas({
        execucaoDireta: editing.notaExecucaoDireta,
        revisao: editing.notaRevisao,
        direcaoCriativa: editing.notaDirecaoCriativa,
        energia: editing.notaEnergia,
        capacidade: editing.notaCapacidade,
      });
      setGargalos(editing.gargalos);
      setClientesPesadasIds(editing.clientesPesadasIds);
      setMotivosPeso(editing.motivosPeso);
      setComentarioClientes(editing.comentarioClientesPesadas ?? "");
      setComentario(editing.comentario ?? "");
      const filled: Record<string, string> = {};
      for (const k of NUM_KEYS) {
        const v = editing[k as keyof OperationalCheckRow] as number | null;
        filled[k] = v == null ? "" : String(v);
      }
      setNums(filled);
      setQuali({
        entregasExecutadasGabi: editing.entregasExecutadasGabi,
        copysDevolvidas: editing.copysDevolvidas,
        designsRefeitos: editing.designsRefeitos,
        postsRevisadosGabi: editing.postsRevisadosGabi,
        postsRevisadosPedro: editing.postsRevisadosPedro,
      });
    } else {
      const m = currentMonth();
      setPeriod("meio_mes");
      setMonth(m);
      setNotas(DEFAULT_NOTAS);
      setGargalos([]);
      setClientesPesadasIds([]);
      setMotivosPeso([]);
      setComentarioClientes("");
      setComentario("");
      setNums({});
      setQuali({
        entregasExecutadasGabi: null,
        copysDevolvidas: null,
        designsRefeitos: null,
        postsRevisadosGabi: null,
        postsRevisadosPedro: null,
      });
      // Puxa a carga planejada do mês corrente como sugestão editável.
      startPull(async () => {
        const carga = await getCargaPlanejadaAction(m);
        aplicarCarga(carga);
      });
    }
  }, [open, editing]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      await createOperationalCheckAction({
        referenceMonth: month,
        period,
        notaExecucaoDireta: notas.execucaoDireta,
        notaRevisao: notas.revisao,
        notaDirecaoCriativa: notas.direcaoCriativa,
        notaEnergia: notas.energia,
        notaCapacidade: notas.capacidade,
        entregasExecutadasGabi: quali.entregasExecutadasGabi,
        gargalos,
        clientesPesadasIds,
        motivosPeso,
        comentarioClientesPesadas: comentarioClientes.trim() || null,
        comentario: comentario.trim() || null,
        postsTotais: numVal("postsTotais"),
        unidadesOperacionais: numVal("unidadesOperacionais"),
        carrosseis: numVal("carrosseis"),
        reels: numVal("reels"),
        estaticos: numVal("estaticos"),
        criativosTrafego: numVal("criativosTrafego"),
        avulsos: numVal("avulsos"),
        copysDevolvidas: quali.copysDevolvidas,
        designsRefeitos: quali.designsRefeitos,
        postsRevisadosGabi: quali.postsRevisadosGabi,
        postsRevisadosPedro: quali.postsRevisadosPedro,
      });
    });
  }

  const gargalosFull = gargalos.length >= MAX_GARGALOS;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar check operacional" : "Novo check operacional"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Período + mês */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Período</Label>
              <div className="flex gap-1">
                {CHECK_PERIODS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={cn(
                      "flex-1 h-8 px-2 text-xs rounded-lg border transition-colors",
                      period === p
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {CHECK_PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Mês de referência</Label>
              <Input
                type="month"
                required
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
          </div>

          {/* Notas 1-5 */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Autoavaliação da Gabi
            </p>
            <RatingScale field="execucaoDireta" value={notas.execucaoDireta} onChange={(n) => setNotas((p) => ({ ...p, execucaoDireta: n }))} />
            <RatingScale field="revisao" value={notas.revisao} onChange={(n) => setNotas((p) => ({ ...p, revisao: n }))} />
            <RatingScale field="direcaoCriativa" value={notas.direcaoCriativa} onChange={(n) => setNotas((p) => ({ ...p, direcaoCriativa: n }))} />
            <RatingScale field="energia" value={notas.energia} onChange={(n) => setNotas((p) => ({ ...p, energia: n }))} />
            <RatingScale field="capacidade" value={notas.capacidade} onChange={(n) => setNotas((p) => ({ ...p, capacidade: n }))} />
          </div>

          {/* Gargalos */}
          <div className="space-y-1.5">
            <Label>
              Gargalos principais{" "}
              <span className="text-muted-foreground font-normal">(até {MAX_GARGALOS})</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {GARGALOS.map((g) => {
                const active = gargalos.includes(g);
                return (
                  <Chip
                    key={g}
                    active={active}
                    disabled={gargalosFull && !active}
                    onClick={() => setGargalos((prev) => toggle(prev, g))}
                  >
                    {g}
                  </Chip>
                );
              })}
            </div>
          </div>

          {/* Clientes mais pesadas */}
          <div className="space-y-1.5">
            <Label>Clientes mais pesadas</Label>
            {activeClients.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma cliente ativa cadastrada.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {activeClients.map((c) => (
                  <Chip
                    key={c.id}
                    active={clientesPesadasIds.includes(c.id)}
                    onClick={() => setClientesPesadasIds((prev) => toggle(prev, c.id))}
                  >
                    {c.name}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {/* Motivos do peso */}
          <div className="space-y-1.5">
            <Label>Motivo do peso</Label>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_PESO.map((m) => (
                <Chip
                  key={m}
                  active={motivosPeso.includes(m)}
                  onClick={() => setMotivosPeso((prev) => toggle(prev, m))}
                >
                  {m}
                </Chip>
              ))}
            </div>
            <Textarea
              rows={2}
              value={comentarioClientes}
              onChange={(e) => setComentarioClientes(e.target.value)}
              placeholder="Comentário sobre as clientes pesadas (opcional)"
            />
          </div>

          {/* Carga planejada/contratada */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Carga planejada (contratada)
              </p>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => recarregarCarga(month)}
                disabled={pulling}
              >
                <RotateCw className={cn(pulling && "animate-spin")} />
                {pulling ? "Puxando…" : "Recarregar do portal"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Pré-preenchida dos planos ativos + avulsos do mês. Reflete o planejado, não a produção concluída — ajuste se precisar.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="Posts totais" value={nums.postsTotais ?? ""} onChange={(v) => setNum("postsTotais", v)} />
              <NumberField label="Unid. operac." value={nums.unidadesOperacionais ?? ""} onChange={(v) => setNum("unidadesOperacionais", v)} />
              <NumberField label="Carrosséis" value={nums.carrosseis ?? ""} onChange={(v) => setNum("carrosseis", v)} />
              <NumberField label="Reels" value={nums.reels ?? ""} onChange={(v) => setNum("reels", v)} />
              <NumberField label="Estáticos" value={nums.estaticos ?? ""} onChange={(v) => setNum("estaticos", v)} />
              <NumberField label="Criativos tráfego" value={nums.criativosTrafego ?? ""} onChange={(v) => setNum("criativosTrafego", v)} />
              <NumberField label="Avulsos" value={nums.avulsos ?? ""} onChange={(v) => setNum("avulsos", v)} />
            </div>
          </div>

          {/* Execução da Gabi e retrabalho — escala qualitativa */}
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Execução da Gabi e retrabalho
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Responda por intensidade (Nada → Muito). Toque de novo para limpar. Tudo opcional.
              </p>
            </div>
            {QUALI_KEYS.map((k) => (
              <QualScale
                key={k}
                label={EXECUCAO_RETRABALHO_LABELS[k]}
                value={quali[k]}
                onChange={(n) => setQual(k, n)}
              />
            ))}
          </div>

          {/* Comentário geral */}
          <div className="space-y-1.5">
            <Label>Comentário (opcional)</Label>
            <Textarea
              rows={2}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Observação geral do período"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar check"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
