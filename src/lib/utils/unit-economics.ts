// ─── Unit Economics — Funções puras ──────────────────────────────────────────

/**
 * CAC = Custo de Aquisição de Cliente
 * Fórmula: ad_spend / novos_clientes
 * Retorna null se não houve novos clientes (indefinido)
 */
export function calcularCAC(
  adSpend: number,
  novosClientes: number
): number | null {
  if (novosClientes <= 0) return null;
  return adSpend / novosClientes;
}

/**
 * ROAS = Return on Ad Spend (múltiplo)
 * Fórmula: receita / ad_spend
 * Retorna null se não houve investimento (indefinido)
 */
export function calcularROAS(
  receita: number,
  adSpend: number
): number | null {
  if (adSpend <= 0) return null;
  return receita / adSpend;
}

/**
 * Churn rate = clientes que sairam / ativos no início do período
 * Retorna valor entre 0 e 1 (multiplicar por 100 para %)
 * Retorna null se não havia ativos no início (indefinido)
 */
export function calcularChurnRate(
  churned: number,
  ativosInicio: number
): number | null {
  if (ativosInicio <= 0) return null;
  return churned / ativosInicio;
}

/**
 * LTV (Lifetime Value) de um cliente = total que ele pagou ao longo da vida.
 * Soma pagamentos recorrentes + receitas avulsas.
 */
export function calcularLTV(input: {
  planPayments: number[];
  oneTimeRevenues?: number[];
}): number {
  const recorrente = input.planPayments.reduce((s, v) => s + v, 0);
  const avulso = (input.oneTimeRevenues ?? []).reduce((s, v) => s + v, 0);
  return recorrente + avulso;
}

/**
 * Payback = quantos meses de ticket médio são necessários para recuperar o CAC.
 * Retorna null se CAC for null ou ticket for 0.
 */
export function calcularPayback(
  cac: number | null,
  ticketMedioMensal: number
): number | null {
  if (cac === null) return null;
  if (ticketMedioMensal <= 0) return null;
  return cac / ticketMedioMensal;
}
