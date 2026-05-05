// Parâmetros financeiros usados no relatório CFO.
// Mantidos como constantes — quando houver UI de settings, migra-se para agency_settings.
export const FINANCIAL_PARAMS = {
  proLaboreMonthly: 15_000,
  designerMonthly: 2_500,
  copywriterPlannedMonthly: 1_500,
  claudeMonthly: 500,
  contadorMonthly: 400,
  taxRate: 0.06,
  monthlyRevenueTarget: 40_000,
  reserveMonthsTarget: 2,
} as const;

export type FinancialParams = typeof FINANCIAL_PARAMS;
