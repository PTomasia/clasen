"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Copy, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createAppNoteAction,
  deleteAppNoteAction,
  listAppNotesAction,
  updateAppNoteAction,
} from "@/lib/actions/app-notes";
import type { AppNote } from "@/lib/services/app-notes";

export function AppNotesPanel() {
  const [notes, setNotes] = useState<AppNote[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [, startTransition] = useTransition();
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listAppNotesAction("pending").then(setNotes).catch(() => {
      // silencioso — sidebar não pode quebrar a app
    });
  }, []);

  useEffect(() => {
    if (editingId !== null) editInputRef.current?.focus();
  }, [editingId]);

  function triggerPulse() {
    setPulse(true);
    setTimeout(() => setPulse(false), 450);
  }

  function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        const created = await createAppNoteAction(trimmed);
        setNotes((prev) => [created, ...prev]);
        setDraft("");
        if (!expanded) triggerPulse();
      } catch {
        // noop
      }
    });
  }

  function handleToggleDone(note: AppNote) {
    startTransition(async () => {
      try {
        await updateAppNoteAction(note.id, { status: "done" });
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
      } catch {
        // noop
      }
    });
  }

  function handleDelete(note: AppNote) {
    startTransition(async () => {
      try {
        await deleteAppNoteAction(note.id);
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
      } catch {
        // noop
      }
    });
  }

  function startEdit(note: AppNote) {
    setEditingId(note.id);
    setEditDraft(note.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  function commitEdit() {
    if (editingId === null) return;
    const trimmed = editDraft.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }
    const id = editingId;
    startTransition(async () => {
      try {
        const updated = await updateAppNoteAction(id, { content: trimmed });
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
        cancelEdit();
      } catch {
        cancelEdit();
      }
    });
  }

  async function handleCopy() {
    if (notes.length === 0) return;
    const md = notes.map((n) => `- [ ] ${n.content}`).join("\n");
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // noop
    }
  }

  const hasNotes = notes.length > 0;

  return (
    <div className="space-y-2">
      {hasNotes ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="app-notes-list"
          className="group flex w-full items-baseline justify-between rounded-sm px-0.5 py-0.5 text-left transition-colors hover:text-sidebar-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-sidebar-foreground/40"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60 group-hover:text-sidebar-foreground/80">
            Melhorias
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "text-[10px] tabular-nums transition-all duration-300",
                pulse
                  ? "scale-125 text-sidebar-foreground"
                  : "scale-100 text-sidebar-foreground/50",
              )}
            >
              {notes.length} pendente{notes.length === 1 ? "" : "s"}
            </span>
            <ChevronDown
              size={11}
              className={cn(
                "text-sidebar-foreground/40 transition-transform duration-200 group-hover:text-sidebar-foreground/70",
                expanded && "rotate-180",
              )}
            />
          </span>
        </button>
      ) : (
        <p className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">
          Melhorias
        </p>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSave();
          }
        }}
        placeholder="anotar ideia..."
        rows={2}
        className="w-full resize-none rounded-md border border-sidebar-border bg-sidebar-accent/30 px-2 py-1.5 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40 outline-none focus:border-sidebar-foreground/30 focus:bg-sidebar-accent/50"
      />

      <button
        onClick={handleSave}
        disabled={!draft.trim()}
        className="w-full rounded-md bg-sidebar-accent px-2 py-1 text-xs text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent/80 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Salvar
      </button>

      {hasNotes && (
        <div
          id="app-notes-list"
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out",
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-1.5 pt-2 mt-1 border-t border-sidebar-border/60">
              <div className="flex justify-end">
                <button
                  onClick={handleCopy}
                  title="Copiar pendentes em markdown"
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                >
                  {copied ? (
                    <>
                      <Check size={10} /> copiado
                    </>
                  ) : (
                    <>
                      <Copy size={10} /> copiar md
                    </>
                  )}
                </button>
              </div>

              <ul className="no-scrollbar max-h-44 space-y-1 overflow-y-auto">
                {notes.map((note) => {
                  const isEditing = editingId === note.id;
                  return (
                    <li
                      key={note.id}
                      className={cn(
                        "group flex items-start gap-1.5 rounded-md px-1.5 py-1 text-xs text-sidebar-foreground/80 transition-colors",
                        "hover:bg-sidebar-accent/30",
                      )}
                    >
                      <button
                        onClick={() => handleToggleDone(note)}
                        title="Marcar como feito"
                        className="mt-0.5 size-3.5 shrink-0 rounded border border-sidebar-foreground/30 transition-colors hover:border-sidebar-foreground/60 hover:bg-sidebar-accent"
                      />
                      {isEditing ? (
                        <input
                          ref={editInputRef}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitEdit();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit();
                            }
                          }}
                          onBlur={commitEdit}
                          className="flex-1 min-w-0 rounded border border-sidebar-foreground/30 bg-sidebar px-1 py-0.5 text-xs text-sidebar-foreground outline-none focus:border-sidebar-foreground/60"
                        />
                      ) : (
                        <span
                          title={note.content}
                          className="flex-1 min-w-0 break-words leading-snug line-clamp-3 cursor-text"
                          onDoubleClick={() => startEdit(note)}
                        >
                          {note.content}
                        </span>
                      )}
                      {isEditing ? (
                        <button
                          onClick={cancelEdit}
                          title="Cancelar"
                          className="shrink-0 rounded p-0.5 text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        >
                          <X size={11} />
                        </button>
                      ) : (
                        <span className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEdit(note)}
                            title="Editar"
                            className="rounded p-0.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => handleDelete(note)}
                            title="Excluir"
                            className="rounded p-0.5 text-sidebar-foreground/50 hover:bg-destructive/20 hover:text-destructive"
                          >
                            <Trash2 size={11} />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
