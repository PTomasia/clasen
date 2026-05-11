"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { MessageSquare, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updatePlanNotesAction } from "@/lib/actions/plans";

const POPOVER_WIDTH = 340;

export function PlanNotesIndicator({
  planId,
  clientName,
  notes,
}: {
  planId: number;
  clientName: string;
  notes: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; placed: boolean } | null>(
    null,
  );

  const hasNotes = !!notes?.trim();

  // Posicionamento: abrir abaixo do trigger; flipar pra cima se não couber
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    setPos({
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - margin),
      placed: false,
    });
  }, [open]);

  useLayoutEffect(() => {
    if (!pos || pos.placed || !popoverRef.current || !triggerRef.current) return;
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    const spaceBelow = window.innerHeight - triggerRect.bottom - margin;

    if (popoverRect.height > spaceBelow) {
      setPos((p) =>
        p
          ? {
              top: Math.max(margin, triggerRect.top - popoverRect.height - 6),
              left: p.left,
              placed: true,
            }
          : null,
      );
    } else {
      setPos((p) => (p ? { ...p, placed: true } : null));
    }
  }, [pos]);

  // Foco automático no textarea quando abre
  useEffect(() => {
    if (open && pos?.placed) {
      textareaRef.current?.focus();
      const len = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(len, len);
    }
  }, [open, pos?.placed]);

  // Fechar em click fora / Esc / scroll
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target))
        return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleViewportChange() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [open]);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updatePlanNotesAction(planId, draft);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "erro ao salvar");
      }
    });
  }

  function handleClear() {
    setError(null);
    setDraft("");
    startTransition(async () => {
      try {
        await updatePlanNotesAction(planId, null);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "erro ao salvar");
      }
    });
  }

  // Tooltip nativo: prévia da obs ou prompt para adicionar
  const tooltipText = hasNotes
    ? notes!.length > 200
      ? `${notes!.slice(0, 197)}...`
      : notes!
    : "Adicionar observação";

  const Icon = hasNotes ? MessageSquareText : MessageSquare;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!open) {
            setDraft(notes ?? "");
            setError(null);
          }
          setOpen((o) => !o);
        }}
        title={tooltipText}
        aria-label={hasNotes ? `Ver/editar observação de ${clientName}` : `Adicionar observação a ${clientName}`}
        className={cn(
          "inline-flex items-center justify-center rounded p-1 transition-colors",
          hasNotes
            ? "text-accent hover:bg-accent/10"
            : "text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/60",
        )}
      >
        <Icon size={14} />
      </button>

      {open && pos && typeof window !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={`Observação — ${clientName}`}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: POPOVER_WIDTH,
              opacity: pos.placed ? 1 : 0,
              pointerEvents: pos.placed ? "auto" : "none",
            }}
            className="z-50 rounded-lg border bg-popover shadow-xl p-3"
          >
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">
              Observação · {clientName}
            </p>
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ex: adiar reajuste — cliente estratégica"
              rows={4}
              disabled={isPending}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
            {error && (
              <p className="text-xs text-destructive mt-2">{error}</p>
            )}
            <div className="flex items-center justify-between gap-2 mt-3">
              <div>
                {hasNotes && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleClear}
                    disabled={isPending}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    Limpar
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isPending}>
                  {isPending ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-2 text-right">
              <kbd className="px-1 py-0.5 border rounded font-mono">Ctrl</kbd>+
              <kbd className="px-1 py-0.5 border rounded font-mono">Enter</kbd> para salvar
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
