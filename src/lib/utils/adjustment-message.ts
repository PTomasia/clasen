import { formatBRL } from "./formatting";

export interface AdjustmentMessageVars {
  cliente: string;
  valorAtual: number;
  valorNovo: number;
  percentual: number;
  custoPostAtual: number | null;
  custoPostNovo: number | null;
}

export function renderAdjustmentMessage(
  template: string,
  vars: AdjustmentMessageVars
): string {
  return template
    .replaceAll("{cliente}", vars.cliente)
    .replaceAll("{valorAtual}", formatBRL(vars.valorAtual))
    .replaceAll("{valorNovo}", formatBRL(vars.valorNovo))
    .replaceAll("{percentual}", vars.percentual.toFixed(0))
    .replaceAll(
      "{custoPostAtual}",
      vars.custoPostAtual != null ? formatBRL(vars.custoPostAtual) : "—"
    )
    .replaceAll(
      "{custoPostNovo}",
      vars.custoPostNovo != null ? formatBRL(vars.custoPostNovo) : "—"
    );
}

export const ADJUSTMENT_PLACEHOLDERS = [
  { name: "{cliente}", desc: "Nome do cliente" },
  { name: "{valorAtual}", desc: "Valor atual do plano (R$ XXX,XX)" },
  { name: "{valorNovo}", desc: "Valor sugerido após reajuste" },
  { name: "{percentual}", desc: "Aumento em % (ex: 25)" },
  { name: "{custoPostAtual}", desc: "$/post hoje" },
  { name: "{custoPostNovo}", desc: "$/post depois do reajuste" },
] as const;
