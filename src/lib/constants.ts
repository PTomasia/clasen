// ─── Constantes compartilhadas ────────────────────────────────────────────────

export const ORIGINS = [
  "Instagram",
  "Indicação",
  "Google",
  "WhatsApp",
  "Outro",
] as const;

export const PLAN_TYPES = [
  "Essential",
  "Personalizado",
  "Tráfego",
  "Site",
] as const;

// Classificação estratégica da carteira de clientes.
// Premium: proteger e desenvolver · Essencial: manter e evoluir ·
// Manutenção: baixo volume, regra clara · Legado: preço antigo, observar transição ·
// Desalinhada: fora do padrão Clasen.
export const CLIENT_TYPES = [
  "Premium",
  "Essencial",
  "Manutenção",
  "Legado",
  "Desalinhada",
] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];

// Cores do badge por tipo (classes Tailwind, light + dark).
export const CLIENT_TYPE_COLORS: Record<ClientType, string> = {
  Premium: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Essencial: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Manutenção: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  Legado: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400",
  Desalinhada: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
};

export const NICHES = [
  "Clínica geral",
  "Infantil",
  "Casal e família",
  "TCC",
  "Psicanálise",
  "Neuropsicologia",
  "Organizacional",
  "Social",
  "Outro",
] as const;

// Paths que precisam de revalidação após mutations
export const REVALIDATE_PATHS = [
  "/planos",
  "/clientes",
  "/dashboard",
  "/icp",
  "/receitas-avulsas",
  "/aquisicao",
  "/despesas",
] as const;

// "tributos" = impostos sobre a receita (DAS Simples Nacional). Separado de
// fixo/variável porque aparece como linha própria na DRE e não conta como
// despesa operacional (evita dupla contagem com o DAS estimado).
export const EXPENSE_CATEGORIES = ["fixo", "variavel", "tributos"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fixo: "Fixo",
  variavel: "Variável",
  tributos: "Tributos",
};

// Produtos comuns de receita avulsa
// Corte temporal: agregações financeiras só consideram dados a partir desta data
export const FINANCIAL_DATA_START = "2026-01-01";

// Início do enquadramento no Simples Nacional (abertura do CNPJ atual). A Clasen
// abriu o CNPJ novo em jun/2026 — antes operava sob outro CNPJ. A RBT12 e o DAS
// começam a contar a partir deste mês: junho é o 1º mês de atividade
// (RBT12 = receita do mês × 12, proporcionalizada). Receita anterior a este mês
// (CNPJ antigo) NÃO entra na RBT12 deste CNPJ. Formato YYYY-MM.
export const SIMPLES_NACIONAL_INICIO = "2026-06";

// Produtos comuns de receita avulsa
export const REVENUE_PRODUCTS = [
  "Arte para tráfego",
  "PDF",
  "Carrossel avulso",
  "Reels avulso",
  "Apresentação",
  "Identidade visual",
  "Roteiro",
  "Outro",
] as const;
