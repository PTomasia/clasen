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
] as const;

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
