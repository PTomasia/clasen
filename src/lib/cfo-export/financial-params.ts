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
  proLaboreMonthly: 15_000,
  taxRate: 0.06,
  monthlyRevenueTarget: 40_000,
  reserveMonthsTarget: 2,
  respiroMargin: 0.2, // breakeven × (1 + respiroMargin) = receita mínima de respiro
  plannedFixedExpensesTotal: PLANNED_FIXED_EXPENSES_TOTAL,
} as const;

export type FinancialParams = typeof FINANCIAL_PARAMS;
