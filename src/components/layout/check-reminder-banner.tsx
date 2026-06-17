"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { formatMonth } from "@/lib/utils/formatting";
import { CHECK_PERIOD_LABELS, type CheckPeriod } from "@/lib/constants";

interface PendingCheck {
  month: string;
  period: CheckPeriod;
}

const DISMISS_KEY = "opcheck-reminder-dismissed";

// Banner global de lembrete de check operacional pendente. Aparece no topo de
// qualquer página (exceto a própria /operacional). Dispensar guarda a "assinatura"
// do pendente no localStorage — reaparece quando muda o check pendente (novo mês).
export function CheckReminderBanner({ pending }: { pending: PendingCheck[] }) {
  const pathname = usePathname();
  const signature = pending.map((p) => `${p.month}:${p.period}`).join("|");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!signature) {
      setVisible(false);
      return;
    }
    const dismissed = localStorage.getItem(DISMISS_KEY) === signature;
    setVisible(!dismissed);
  }, [signature]);

  if (!signature || !visible || pathname === "/operacional") return null;

  const p = pending[0];
  const periodo = CHECK_PERIOD_LABELS[p.period].toLowerCase();

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, signature);
    setVisible(false);
  }

  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
      <CalendarClock className="size-4 shrink-0" />
      <span className="flex-1">
        Lembrete: o check operacional de <strong>{periodo}</strong> de{" "}
        <strong>{formatMonth(p.month)}</strong> ainda não foi preenchido.
      </span>
      <Link href="/operacional" className={cn(buttonVariants({ size: "sm" }))} onClick={dismiss}>
        Preencher agora
      </Link>
      <button
        type="button"
        aria-label="Dispensar lembrete"
        onClick={dismiss}
        className="rounded p-1 text-amber-900/70 transition-colors hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200/70 dark:hover:bg-amber-500/15 dark:hover:text-amber-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
