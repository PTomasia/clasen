// ─── Formatação BRL ────────────────────────────────────────────────────────────

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBRL(value: number): string {
  // Intl.NumberFormat usa non-breaking space (\u00a0) — normalizar para espaço regular
  return brlFormatter.format(value).replace(/\u00a0/g, " ");
}

// ─── Formatação de Data ────────────────────────────────────────────────────────
// ISO 8601 ('2024-01-15') → dd/MM/yyyy ('15/01/2024')

export function formatDate(
  isoDate: string | null | undefined
): string {
  if (!isoDate) return "";

  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

// ─── Formatação de Mês (YYYY-MM → "Abr/2026") ─────────────────────────────────

const MONTH_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export function formatMonth(yyyymm: string | null | undefined): string {
  if (!yyyymm) return "";
  const [y, m] = yyyymm.split("-");
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11 || !y) return yyyymm;
  return `${MONTH_PT[idx]}/${y}`;
}

// ─── Formatação de Percentual ──────────────────────────────────────────────────

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPercentage(value: number): string {
  return `${percentFormatter.format(value)}%`;
}
