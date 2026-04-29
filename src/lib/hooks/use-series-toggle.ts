"use client";

import { useState, useCallback } from "react";

/**
 * Hook para legenda interativa de gráficos.
 *
 * - Click simples em uma série → isola (hide outras). Click novamente na mesma → restaura todas.
 * - Ctrl+click (ou meta) → adiciona/remove sem perder o restante.
 *
 * O caller fornece a lista completa de séries; o hook devolve o set visível e helpers.
 */
export function useSeriesToggle(allSeries: readonly string[]) {
  const [visible, setVisible] = useState<Set<string>>(() => new Set(allSeries));

  const isAllVisible = visible.size === allSeries.length;

  const toggle = useCallback(
    (name: string, multi: boolean) => {
      setVisible((prev) => {
        // Multi (ctrl+click): add/remove sem afetar o resto.
        if (multi) {
          const next = new Set(prev);
          if (next.has(name)) {
            next.delete(name);
            // Não permitir esconder tudo
            if (next.size === 0) return new Set(allSeries);
          } else {
            next.add(name);
          }
          return next;
        }

        // Click simples
        // Se já está isolado nessa série → restaura todas
        if (prev.size === 1 && prev.has(name)) {
          return new Set(allSeries);
        }
        // Caso contrário → isola
        return new Set([name]);
      });
    },
    [allSeries]
  );

  const isVisible = useCallback((name: string) => visible.has(name), [visible]);

  return { visible, isVisible, toggle, isAllVisible };
}
