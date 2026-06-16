// Parâmetros financeiros usados no relatório CFO.
// Mantidos como constantes — quando houver UI de settings, migra-se para agency_settings.

export const PLANNED_FIXED_EXPENSES = {
  bibo: 2_500,
  copywriter: 1_500,
  claude: 550,
  contador: 400,
  cursoCopywriter: 300,
  computador: 300,
  capcut: 65,
  chatgpt: 100,
  photoshop: 95,
} as const;

export const PLANNED_FIXED_EXPENSES_LABELS: Record<
  keyof typeof PLANNED_FIXED_EXPENSES,
  string
> = {
  bibo: "Bibo (design)",
  copywriter: "Copywriter",
  claude: "Claude",
  contador: "Contador",
  cursoCopywriter: "Curso Copywriter",
  computador: "Computador",
  capcut: "Capcut",
  chatgpt: "ChatGPT",
  photoshop: "Photoshop",
};

export const PLANNED_FIXED_EXPENSES_TOTAL = Object.values(
  PLANNED_FIXED_EXPENSES
).reduce((sum, v) => sum + v, 0);

export const FINANCIAL_PARAMS = {
  proLaboreMonthly: 15_000, // pró-labore GERENCIAL (linha da DRE)
  // taxRate 6% = premissa ANTIGA (fixa). Mantida só como baseline de comparação
  // no relatório CFO. O tributo agora é estimado pelo Simples Nacional (Anexo III)
  // via src/lib/utils/simples-nacional.ts (alíquota efetiva por RBT12).
  taxRate: 0.06,
  // Pró-labore CONTÁBIL = 28% da receita do mês (o resto até R$15k vira
  // distribuição de lucros). Mantém o Fator R em 28% → Anexo III.
  proLaboreContabilRate: 0.28,
  // Fator R ≥ 28% mantém no Anexo III; abaixo cai no Anexo V.
  fatorRThreshold: 0.28,
  monthlyRevenueTarget: 40_000,
  reserveMonthsTarget: 2,
  respiroMargin: 0.2, // breakeven × (1 + respiroMargin) = receita mínima de respiro
  plannedFixedExpensesTotal: PLANNED_FIXED_EXPENSES_TOTAL,
} as const;

export type FinancialParams = typeof FINANCIAL_PARAMS;
