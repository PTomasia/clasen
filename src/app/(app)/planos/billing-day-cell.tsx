"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useDialogAction } from "@/lib/hooks/use-dialog-action";
import { updateBillingDaysAction } from "@/lib/actions/plans";

interface BillingDayCellProps {
  planId: number;
  billingCycleDays: number | null;
  billingCycleDays2: number | null;
}

function formatDisplay(day1: number | null, day2: number | null): string {
  if (day1 === null && day2 === null) return "—";
  if (day1 !== null && day2 !== null) {
    const [first, second] = day1 < day2 ? [day1, day2] : [day2, day1];
    return `${first}/${second}`;
  }
  return String(day1 ?? day2);
}

export function BillingDayCell({
  planId,
  billingCycleDays,
  billingCycleDays2,
}: BillingDayCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [day1, setDay1] = useState(billingCycleDays?.toString() ?? "");
  const [day2, setDay2] = useState(billingCycleDays2?.toString() ?? "");
  const day1Ref = useRef<HTMLInputElement>(null);

  const { isPending, error, run, resetError } = useDialogAction(() => {
    setIsEditing(false);
  });

  // Reset state quando props mudam (após save bem-sucedido + revalidate)
  useEffect(() => {
    setDay1(billingCycleDays?.toString() ?? "");
    setDay2(billingCycleDays2?.toString() ?? "");
  }, [billingCycleDays, billingCycleDays2]);

  // Foco no input ao entrar em edição
  useEffect(() => {
    if (isEditing) {
      day1Ref.current?.focus();
      day1Ref.current?.select();
    }
  }, [isEditing]);

  function startEdit() {
    if (isPending) return;
    resetError();
    setIsEditing(true);
  }

  function cancel() {
    setDay1(billingCycleDays?.toString() ?? "");
    setDay2(billingCycleDays2?.toString() ?? "");
    setIsEditing(false);
    resetError();
  }

  function commit() {
    const n1 = parseInt(day1, 10);
    const n2 = day2.trim() ? parseInt(day2, 10) : null;

    // Validação client-side
    if (!Number.isInteger(n1) || n1 < 1 || n1 > 31) {
      // Sinaliza erro inline e mantém edição aberta
      run(() => Promise.reject(new Error("Dia 1 deve estar entre 1 e 31")));
      return;
    }
    if (n2 !== null && (!Number.isInteger(n2) || n2 < 1 || n2 > 31)) {
      run(() => Promise.reject(new Error("Dia 2 deve estar entre 1 e 31")));
      return;
    }
    if (n2 !== null && n2 === n1) {
      run(() => Promise.reject(new Error("Os dias devem ser diferentes")));
      return;
    }

    // Sem mudança → fecha sem chamar action
    if (n1 === billingCycleDays && n2 === billingCycleDays2) {
      setIsEditing(false);
      return;
    }

    run(() => updateBillingDaysAction(planId, n1, n2));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  // Evita commit quando o blur muda foco entre os 2 inputs internos
  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as HTMLElement | null;
    if (next && e.currentTarget.contains(next)) return;
    commit();
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className="inline-flex items-center justify-center rounded-md border border-transparent px-2 py-1 text-sm tabular-nums hover:border-border hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors"
        title="Clique para editar o dia de vencimento"
        aria-label="Editar dia de vencimento"
      >
        {formatDisplay(billingCycleDays, billingCycleDays2)}
      </button>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1"
      onBlur={handleBlur}
      data-billing-edit
    >
      <Input
        ref={day1Ref}
        type="number"
        min={1}
        max={31}
        inputMode="numeric"
        value={day1}
        onChange={(e) => setDay1(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isPending}
        className="h-8 w-14 px-1 text-center tabular-nums"
        aria-label="Dia de vencimento principal"
      />
      <span className="text-muted-foreground">/</span>
      <Input
        type="number"
        min={1}
        max={31}
        inputMode="numeric"
        value={day2}
        onChange={(e) => setDay2(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isPending}
        placeholder="—"
        className="h-8 w-14 px-1 text-center tabular-nums"
        aria-label="Segundo dia de vencimento (opcional)"
      />
      {error && (
        <span
          className="ml-1 text-xs text-destructive max-w-[140px] truncate"
          title={error}
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  );
}
