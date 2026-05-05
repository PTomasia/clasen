"use client";

import { useState, useTransition } from "react";
import { Copy, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportCfoReportAction } from "@/lib/actions/cfo-export";

type Status = "idle" | "loading" | "ok" | "err";

export function CopyForCFOButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [, startTransition] = useTransition();

  function handleClick() {
    setStatus("loading");
    startTransition(async () => {
      try {
        const md = await exportCfoReportAction();
        await copyToClipboard(md);
        setStatus("ok");
        setTimeout(() => setStatus("idle"), 2500);
      } catch (err) {
        console.error("[CopyForCFOButton]", err);
        setStatus("err");
        setTimeout(() => setStatus("idle"), 3500);
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={status === "loading"}>
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
  if (status === "err") return "Erro ao copiar";
  return "Copiar para CFO";
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback antigo
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
