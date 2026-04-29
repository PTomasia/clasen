"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export interface TimeRange {
  /** Index do primeiro mês visível (0-based, dentro do array de meses disponíveis) */
  fromIdx: number;
  /** Index do último mês visível, inclusivo */
  toIdx: number;
}

interface Props {
  /** Lista de labels dos meses (ex: ["Mai/25", "Jun/25", ..., "Abr/26"]) — ordem cronológica */
  months: readonly string[];
  range: TimeRange;
  onChange: (next: TimeRange) => void;
  className?: string;
}

const PRESETS = [
  { label: "3M", monthCount: 3 },
  { label: "6M", monthCount: 6 },
  { label: "12M", monthCount: 12 },
  { label: "Tudo", monthCount: -1 },
];

export function TimeRangeControl({ months, range, onChange, className }: Props) {
  const total = months.length;
  const lastIdx = total - 1;

  const activePreset = useMemo(() => {
    // Detecta se range corresponde a um preset (toIdx é o último, fromIdx bate com count)
    if (range.toIdx !== lastIdx) return null;
    for (const p of PRESETS) {
      if (p.monthCount === -1 && range.fromIdx === 0) return p.label;
      if (p.monthCount > 0 && range.fromIdx === Math.max(0, lastIdx - p.monthCount + 1))
        return p.label;
    }
    return null;
  }, [range, lastIdx]);

  function applyPreset(monthCount: number) {
    if (monthCount === -1) {
      onChange({ fromIdx: 0, toIdx: lastIdx });
    } else {
      onChange({
        fromIdx: Math.max(0, lastIdx - monthCount + 1),
        toIdx: lastIdx,
      });
    }
  }

  const fromLabel = months[range.fromIdx] ?? "—";
  const toLabel = months[range.toIdx] ?? "—";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-md border bg-card text-xs">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.monthCount)}
              className={cn(
                "px-3 py-1 transition-colors first:rounded-l-md last:rounded-r-md",
                "border-r last:border-r-0",
                activePreset === p.label
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/40 text-muted-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {fromLabel} → {toLabel}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={lastIdx}
          value={range.fromIdx}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({ fromIdx: Math.min(v, range.toIdx), toIdx: range.toIdx });
          }}
          className="flex-1 accent-[var(--primary)]"
          aria-label="Início do período"
        />
        <input
          type="range"
          min={0}
          max={lastIdx}
          value={range.toIdx}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({ fromIdx: range.fromIdx, toIdx: Math.max(v, range.fromIdx) });
          }}
          className="flex-1 accent-[var(--primary)]"
          aria-label="Fim do período"
        />
      </div>
    </div>
  );
}

/** Recorta um array de dados pelo TimeRange. */
export function sliceByRange<T>(data: readonly T[], range: TimeRange): T[] {
  return data.slice(range.fromIdx, range.toIdx + 1);
}
