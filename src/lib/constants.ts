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

// Teto de capacidade operacional, em unidades operacionais (UO). Desenhado como
// 30 clientes Essential (2 carrosséis + 2 reels + 1 estático, reels a 0,75 em
// média) = 30 × 4,0 UO = 120. Métrica gerencial interna (ver
// calcularUnidadesOperacionais). Pode migrar para agency_settings no futuro.
export const TETO_OPERACIONAL_UO = 120;

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
  "/operacional",
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

// ─── Operacional (Sprint 7) ────────────────────────────────────────────────────
// Ferramenta de saúde operacional da agência. Acompanha a transição da Gabi de
// executora para diretora criativa/conteúdo. Dois checks rápidos por mês.

export const CHECK_PERIODS = ["meio_mes", "fim_mes"] as const;
export type CheckPeriod = (typeof CHECK_PERIODS)[number];

export const CHECK_PERIOD_LABELS: Record<CheckPeriod, string> = {
  meio_mes: "Meio do mês",
  fim_mes: "Fim do mês",
};

// Gargalos operacionais — seleção de até 3 por check.
export const GARGALOS = [
  "Copy",
  "Design",
  "Atendimento",
  "Briefing",
  "Revisão",
  "Aprovação de cliente",
  "Atraso",
  "Cliente específica",
  "Pâmela",
  "Bibo",
  "Pedro",
  "Gabi",
  "Produto novo",
  "Falta de processo",
  "Falta de equipe",
  "Outro",
] as const;

export const MAX_GARGALOS = 3;

// Motivos pelos quais uma cliente "pesa" na operação.
export const MOTIVOS_PESO = [
  "Atendimento",
  "Aprovação",
  "Retrabalho de copy",
  "Retrabalho de design",
  "Briefing confuso",
  "Cliente exigente",
  "Urgência",
  "Questão emocional/energia",
  "Outro",
] as const;

// Status da agenda — capacidade de absorver novas clientes.
export const AGENDA_STATUSES = ["saudavel", "atencao", "contencao", "critico"] as const;
export type AgendaStatus = (typeof AGENDA_STATUSES)[number];

export const AGENDA_STATUS_LABELS: Record<AgendaStatus, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  contencao: "Contenção",
  critico: "Crítico",
};

// Faixas de interpretação do score operacional (média 1-5 das 5 notas). Avaliadas
// por limiar (>= min), da mais alta para a mais baixa — sem buracos entre faixas.
export const SCORE_BANDS = [
  { min: 4.3, key: "saudavel", label: "Saudável" },
  { min: 3.5, key: "boa", label: "Boa, com pontos de atenção" },
  { min: 2.8, key: "limite", label: "No limite" },
  { min: 2.0, key: "contencao", label: "Contenção" },
  { min: 0, key: "critico", label: "Crítico" },
] as const;

export type ScoreBandKey = (typeof SCORE_BANDS)[number]["key"];

// Notas 1-5 da Gabi — chaves, rótulos e descrição de cada nível. Fonte única
// usada pelo formulário (RatingScale) e pelo relatório.
export const RATING_LABELS = {
  execucaoDireta: "Carga da Gabi em execução direta",
  revisao: "Revisão da Gabi",
  direcaoCriativa: "Direção criativa",
  energia: "Energia da Gabi",
  capacidade: "Capacidade para novas clientes",
} as const;

export type RatingKey = keyof typeof RATING_LABELS;

export const RATING_DESCRIPTIONS: Record<RatingKey, Record<1 | 2 | 3 | 4 | 5, string>> = {
  execucaoDireta: {
    1: "Gabi executou muito e segurou a operação",
    2: "Gabi executou mais do que deveria",
    3: "Gabi executou algumas exceções",
    4: "Gabi quase não executou",
    5: "Gabi não executou produção recorrente",
  },
  revisao: {
    1: "Revisão virou reescrita/refação",
    2: "Revisão pesada e frequente",
    3: "Revisão média, ainda operacional",
    4: "Revisão leve e pontual",
    5: "Revisão estratégica/direção criativa",
  },
  direcaoCriativa: {
    1: "Gabi ficou presa na execução",
    2: "Pouca direção, muitas urgências",
    3: "Parcialmente",
    4: "Atuou bem em direção, com poucas interferências operacionais",
    5: "Atuou principalmente como diretora criativa/conteúdo",
  },
  energia: {
    1: "Esgotada",
    2: "Muito cansada",
    3: "Cansada, mas funcional",
    4: "Bem, com pressão controlada",
    5: "Boa, com sensação de controle",
  },
  capacidade: {
    1: "Impossível",
    2: "Muito arriscado",
    3: "Possível, mas apertado",
    4: "Possível com organização",
    5: "Tranquilo",
  },
};

// Escala qualitativa (Nada→Muito) para execução da Gabi e retrabalho. A Gabi
// responde por intensidade, não por contagem. Armazenada como ordinal 1-5 nas
// colunas integer existentes (sem migration).
export const NIVEL_QUALITATIVO_VALUES = [1, 2, 3, 4, 5] as const;

export const NIVEL_QUALITATIVO_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Nada",
  2: "Pouco",
  3: "Médio",
  4: "Bastante",
  5: "Muito",
};

// Rótulos dos campos de execução/retrabalho (escala qualitativa). Fonte única
// para o formulário, o card e o relatório.
export const EXECUCAO_RETRABALHO_LABELS = {
  entregasExecutadasGabi: "Entregas executadas pela Gabi",
  copysDevolvidas: "Copys devolvidas p/ refação",
  designsRefeitos: "Designs refeitos",
  postsRevisadosGabi: "Posts revisados pela Gabi",
  postsRevisadosPedro: "Posts revisados pelo Pedro",
} as const;

export type ExecucaoRetrabalhoKey = keyof typeof EXECUCAO_RETRABALHO_LABELS;
