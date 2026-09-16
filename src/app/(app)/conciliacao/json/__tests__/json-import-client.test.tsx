// Testes do guard de aplicação da conciliação (UI).
// Spec: docs/specs/fix-conciliacao-aplicar-idempotente.md — critérios 11-15.
// Incidente 16/09/2026: duplo clique em "Aplicar" disparou o lote 2x.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { JsonImportClient } from "../json-import-client";
import {
  previewBulkImportAction,
  applyBulkImportAction,
} from "@/lib/actions/bulk-import";
import type { ApplyResult, BulkImportPreview } from "@/lib/services/bulk-import";

vi.mock("@/lib/actions/bulk-import", () => ({
  previewBulkImportAction: vi.fn(),
  applyBulkImportAction: vi.fn(),
}));

vi.mock("@/lib/actions/conciliacao-dictionary", () => ({
  exportDictionaryAction: vi.fn(),
}));

type ApplyResponse = Awaited<ReturnType<typeof applyBulkImportAction>>;

const PREVIEW_FIXTURE: BulkImportPreview = {
  source: "extrato set/2026",
  items: [
    {
      index: 0,
      entry: {
        type: "plan_payment",
        date: "2026-09-05",
        month: "2026-09",
        amount: 800,
        clientName: "Ana Silva",
        rawType: "plan_payment",
      },
      status: "ready",
      reason: "OK",
      clientId: 1,
      planId: 1,
    },
  ],
  skippedFromInput: 0,
  counts: {
    ready: 1,
    low_confidence: 0,
    duplicate_warning: 0,
    amount_mismatch: 0,
    ambiguous: 0,
    unknown_client: 0,
    no_active_plan: 0,
    skipped_by_directive: 0,
    error: 0,
  },
};

const APPLY_OK: ApplyResponse = {
  ok: true,
  result: {
    applied: 1,
    appliedIds: [{ index: 0, type: "plan_payment", id: 10 }],
    errors: [],
  } satisfies ApplyResult,
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Renderiza, cola JSON e clica em "Analisar JSON" até o preview aparecer. */
async function renderWithPreview() {
  vi.mocked(previewBulkImportAction).mockResolvedValue({
    ok: true,
    preview: PREVIEW_FIXTURE,
  });
  render(<JsonImportClient />);
  fireEvent.change(screen.getByPlaceholderText(/Cole o JSON/), {
    target: { value: '{"entries":[{"type":"plan_payment"}]}' },
  });
  fireEvent.click(screen.getByRole("button", { name: /Analisar JSON/ }));
  const btn = await screen.findByRole("button", { name: /Aplicar 1/ });
  // Espera a transition da análise terminar — como o usuário, só clica habilitado
  await waitFor(() => expect(btn).toBeEnabled());
  return btn;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("JsonImportClient — guard do Aplicar", () => {
  it("duplo clique síncrono chama applyBulkImportAction UMA vez (ref guard)", async () => {
    const applyBtn = await renderWithPreview();
    const d = deferred<ApplyResponse>();
    vi.mocked(applyBulkImportAction).mockImplementation(() => d.promise);

    // Dois cliques no mesmo frame — antes do re-render que desabilita o botão
    fireEvent.click(applyBtn);
    fireEvent.click(applyBtn);
    await waitFor(() => expect(applyBulkImportAction).toHaveBeenCalled());
    expect(applyBulkImportAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve(APPLY_OK);
    });

    // Depois de tudo assentar, segue tendo sido UMA request
    await screen.findByRole("button", { name: /Lote aplicado/ });
    expect(applyBulkImportAction).toHaveBeenCalledTimes(1);
  });

  it("enquanto a action roda, botão mostra 'Aplicando…' e fica desabilitado", async () => {
    const applyBtn = await renderWithPreview();
    const d = deferred<ApplyResponse>();
    vi.mocked(applyBulkImportAction).mockImplementation(() => d.promise);

    fireEvent.click(applyBtn);
    const pendingBtn = await screen.findByRole("button", { name: /Aplicando/ });
    expect(pendingBtn).toBeDisabled();

    await act(async () => {
      d.resolve(APPLY_OK);
    });
  });

  it("após sucesso, botão vira 'Lote aplicado', fica desabilitado e não dispara de novo", async () => {
    const applyBtn = await renderWithPreview();
    vi.mocked(applyBulkImportAction).mockResolvedValue(APPLY_OK);

    fireEvent.click(applyBtn);
    await screen.findByText(/1 linha aplicada/);

    const doneBtn = screen.getByRole("button", { name: /Lote aplicado/ });
    expect(doneBtn).toBeDisabled();

    fireEvent.click(doneBtn);
    expect(applyBulkImportAction).toHaveBeenCalledTimes(1);
  });

  it("'Analisar JSON' de novo re-habilita o fluxo com preview novo", async () => {
    const applyBtn = await renderWithPreview();
    vi.mocked(applyBulkImportAction).mockResolvedValue(APPLY_OK);

    fireEvent.click(applyBtn);
    await screen.findByRole("button", { name: /Lote aplicado/ });

    const analyzeBtn = screen.getByRole("button", { name: /Analisar JSON/ });
    await waitFor(() => expect(analyzeBtn).toBeEnabled());
    fireEvent.click(analyzeBtn);
    const freshBtn = await screen.findByRole("button", { name: /Aplicar 1/ });
    await waitFor(() => expect(freshBtn).toBeEnabled());
  });

  it("erro da action ('lote já aplicado') mostra banner amigável e permite retry", async () => {
    const applyBtn = await renderWithPreview();
    vi.mocked(applyBulkImportAction).mockResolvedValue({
      ok: false,
      error: "Este lote já foi aplicado em 16/09/2026 (3 linhas). Nenhuma linha foi inserida agora.",
    });

    fireEvent.click(applyBtn);
    await screen.findByText(/Não foi possível aplicar/);
    screen.getByText(/Este lote já foi aplicado em 16\/09\/2026/);

    // Botão volta habilitado para retry legítimo (ex.: erro transitório de rede)
    const retryBtn = await screen.findByRole("button", { name: /Aplicar 1/ });
    await waitFor(() => expect(retryBtn).toBeEnabled());
  });
});
