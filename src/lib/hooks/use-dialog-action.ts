"use client";

import { useState, useTransition } from "react";

/**
 * Boilerplate compartilhado por dialogs de mutação:
 * - `isPending`: true enquanto a action roda
 * - `error`: mensagem do último erro, ou null
 * - `run(action)`: executa a action dentro de useTransition + try/catch.
 *    Se OK, chama onSuccess. Se erro, pega err.message para exibir.
 *
 * Uso típico:
 *   const { isPending, error, run } = useDialogAction(onClose);
 *   function handleSubmit(e) { e.preventDefault(); run(() => myAction(...)); }
 */
export function useDialogAction(onSuccess?: () => void) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        onSuccess?.();
      } catch (err: any) {
        setError(err?.message ?? "Erro inesperado");
      }
    });
  }

  function resetError() {
    setError(null);
  }

  return { isPending, error, run, resetError };
}
