"use client";

import { useState, useTransition } from "react";
import { Copy, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportOperationalReportAction } from "@/lib/actions/operational";

type Status = "idle" | "loading" | "ok" | "err";

// Gera o relatório operacional em Markdown e copia para o clipboard. checkId
// opcional — sem ele, usa o check mais recente. Espelha CopyForCFOButton.
export function CopyOperationalReportButton({
  checkId,
  disabled,
}: {
  checkId?: number;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [, startTransition] = useTransition();

  function handleClick() {
    setStatus("loading");
    startTransition(async () => {
      try {
        const md = await exportOperationalReportAction(checkId);
        await copyToClipboard(md);
        setStatus("ok");
        setTimeout(() => setStatus("idle"), 2500);
      } catch (err) {
        console.error("[CopyOperationalReportButton]", err);
        setStatus("err");
        setTimeout(() => setStatus("idle"), 3500);
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={disabled || status === "loading"}
    >
      {renderIcon(status)}
      <span>{renderLabel(status)}</span>
    </Button>
  );
}

function renderIcon(status: Status) {
  if (status === "loading") return <Loader2 className="animate-spin" />;
  if (status === "ok") return <Check />;
  if (status === "err") return <AlertCircle />;
  return <Copy />;
}

function renderLabel(status: Status): string {
  if (status === "loading") return "Gerando…";
  if (status === "ok") return "Copiado!";
  if (status === "err") return "Erro ao gerar";
  return "Gerar relatório MD";
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}
