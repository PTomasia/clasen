// ─── Simples Nacional — Anexo III + Fator R ───────────────────────────────────
// Cálculo gerencial da estimativa do DAS (Documento de Arrecadação do Simples).
// Premissa principal da Clasen: usa Fator R → tributa pelo Anexo III.
//
// IMPORTANTE: tudo aqui é ESTIMATIVA gerencial. O valor oficial do DAS é apurado
// pela contabilidade/PGDAS (Contabilizei). Estas funções são puras (sem banco) e
// existem para dar leitura realista de margem/caixa/resultado mês a mês.
//
// Fórmulas oficiais:
//   Alíquota efetiva = ((RBT12 × alíquota nominal) − parcela a deduzir) / RBT12
//   DAS do mês       = receita bruta do mês × alíquota efetiva
//   RBT12 (real)     = soma da receita bruta dos 12 meses anteriores ao mês de apuração
//   RBT12 (propor.)  = (receita acumulada desde o início / meses apurados) × 12
//   Fator R          = folha de salários (12m, incl. pró-labore) / RBT12

export interface FaixaAnexoIII {
  faixa: number; // 1..6
  rbt12Min: number; // limite inferior (inclusive)
  rbt12Max: number; // limite superior (inclusive); Infinity na última
  aliquotaNominal: number; // fração 0..1
  parcelaDeduzir: number; // R$
}

// Tabela do Anexo III (LC 123/2006, atualizada). Valores conforme briefing.
export const ANEXO_III_FAIXAS: FaixaAnexoIII[] = [
  { faixa: 1, rbt12Min: 0, rbt12Max: 180_000, aliquotaNominal: 0.06, parcelaDeduzir: 0 },
  { faixa: 2, rbt12Min: 180_000.01, rbt12Max: 360_000, aliquotaNominal: 0.112, parcelaDeduzir: 9_360 },
  { faixa: 3, rbt12Min: 360_000.01, rbt12Max: 720_000, aliquotaNominal: 0.135, parcelaDeduzir: 17_640 },
  { faixa: 4, rbt12Min: 720_000.01, rbt12Max: 1_800_000, aliquotaNominal: 0.16, parcelaDeduzir: 35_640 },
  { faixa: 5, rbt12Min: 1_800_000.01, rbt12Max: 3_600_000, aliquotaNominal: 0.21, parcelaDeduzir: 125_640 },
  { faixa: 6, rbt12Min: 3_600_000.01, rbt12Max: Infinity, aliquotaNominal: 0.33, parcelaDeduzir: 648_000 },
];

// Fator R ≥ 28% mantém a empresa no Anexo III; abaixo cai no Anexo V.
export const FATOR_R_THRESHOLD = 0.28;

// ─── Faixa e alíquota efetiva ─────────────────────────────────────────────────

export function findFaixaAnexoIII(rbt12: number): FaixaAnexoIII {
  const found = ANEXO_III_FAIXAS.find((f) => rbt12 <= f.rbt12Max);
  // rbt12 negativo ou estranho cai na faixa 1; acima do teto cai na última.
  return found ?? ANEXO_III_FAIXAS[ANEXO_III_FAIXAS.length - 1];
}

export function calcAliquotaEfetiva(rbt12: number): number {
  if (rbt12 <= 0) return 0;
  const f = findFaixaAnexoIII(rbt12);
  return (rbt12 * f.aliquotaNominal - f.parcelaDeduzir) / rbt12;
}

// ─── RBT12 (Receita Bruta dos últimos 12 meses) ───────────────────────────────

export interface RBT12Input {
  // Receita bruta (competência) de cada mês ANTERIOR ao mês de apuração, em
  // ordem cronológica, considerando apenas meses já em operação.
  receitasMesesAnteriores: number[];
  // Receita bruta do mês de apuração — usada só para proporcionalizar no 1º mês.
  receitaMesApuracao: number;
}

export interface RBT12Result {
  rbt12: number;
  tipo: "real" | "proporcionalizada";
  mesesApurados: number; // meses usados na base de cálculo
}

export function calcRBT12(input: RBT12Input): RBT12Result {
  const { receitasMesesAnteriores, receitaMesApuracao } = input;
  const n = receitasMesesAnteriores.length;

  // ≥12 meses de histórico: RBT12 real = soma dos 12 meses anteriores.
  if (n >= 12) {
    const ultimos12 = receitasMesesAnteriores.slice(n - 12);
    const rbt12 = ultimos12.reduce((s, v) => s + v, 0);
    return { rbt12: round2(rbt12), tipo: "real", mesesApurados: 12 };
  }

  // Início de atividade (<12 meses): proporcionalizada.
  if (n === 0) {
    // 1º mês: RBT12 = receita do próprio mês × 12.
    return {
      rbt12: round2(receitaMesApuracao * 12),
      tipo: "proporcionalizada",
      mesesApurados: receitaMesApuracao > 0 ? 1 : 0,
    };
  }

  const acumulado = receitasMesesAnteriores.reduce((s, v) => s + v, 0);
  const rbt12 = (acumulado / n) * 12;
  return { rbt12: round2(rbt12), tipo: "proporcionalizada", mesesApurados: n };
}

// ─── DAS estimado do mês ──────────────────────────────────────────────────────

export interface DasEstimadoInput {
  receitaBrutaMes: number;
  rbt12: number;
}

export interface DasEstimadoResult {
  faixa: number;
  aliquotaNominal: number;
  parcelaDeduzir: number;
  aliquotaEfetiva: number;
  das: number;
  receitaLiquidaAposDas: number;
}

export function calcDasEstimado(input: DasEstimadoInput): DasEstimadoResult {
  const { receitaBrutaMes, rbt12 } = input;
  const f = findFaixaAnexoIII(rbt12);
  const aliquotaEfetiva = calcAliquotaEfetiva(rbt12);
  const das = round2(receitaBrutaMes * aliquotaEfetiva);
  return {
    faixa: f.faixa,
    aliquotaNominal: f.aliquotaNominal,
    parcelaDeduzir: f.parcelaDeduzir,
    aliquotaEfetiva,
    das,
    receitaLiquidaAposDas: round2(receitaBrutaMes - das),
  };
}

// ─── Fator R ──────────────────────────────────────────────────────────────────

export type FatorRStatus = "ok_anexo_iii" | "risco_anexo_v";

export function calcFatorR(input: { folha12m: number; rbt12: number }): number {
  if (input.rbt12 <= 0) return 0;
  return input.folha12m / input.rbt12;
}

export function fatorRStatus(fatorR: number): FatorRStatus {
  return fatorR >= FATOR_R_THRESHOLD ? "ok_anexo_iii" : "risco_anexo_v";
}

// ─── Fachada: bloco tributário completo ───────────────────────────────────────

export interface EstimativaTributariaInput {
  receitaBrutaMes: number; // competência do mês de apuração
  receitasMesesAnteriores: number[]; // competência dos meses anteriores em operação
  proLaboreContabilRate: number; // ex.: 0.28 → pró-labore contábil = 28% da receita
  taxRateLegacy?: number; // premissa antiga (6% fixo) p/ comparação; default 0.06
}

export interface EstimativaTributaria {
  receitaBrutaMes: number;
  rbt12: number;
  rbt12Tipo: "real" | "proporcionalizada";
  mesesApurados: number;
  faixa: number;
  aliquotaNominal: number;
  parcelaDeduzir: number;
  aliquotaEfetiva: number;
  das: number;
  receitaLiquidaAposDas: number;
  proLaboreContabil: number; // 28% × receita do mês (registrado formalmente)
  folha12m: number; // 28% × RBT12 (folha estimada p/ Fator R)
  fatorR: number;
  fatorRStatus: FatorRStatus;
  // Comparação com a premissa antiga de 6% fixo
  dasSeisPorcento: number;
  diferencaVs6: number; // das − dasSeisPorcento
}

export function calcEstimativaTributaria(
  input: EstimativaTributariaInput
): EstimativaTributaria {
  const { receitaBrutaMes, receitasMesesAnteriores, proLaboreContabilRate } = input;
  const taxRateLegacy = input.taxRateLegacy ?? 0.06;

  const { rbt12, tipo, mesesApurados } = calcRBT12({
    receitasMesesAnteriores,
    receitaMesApuracao: receitaBrutaMes,
  });

  const das = calcDasEstimado({ receitaBrutaMes, rbt12 });

  // Pró-labore contábil = 28% da receita do mês; folha 12m estimada = 28% da RBT12.
  const proLaboreContabil = round2(proLaboreContabilRate * receitaBrutaMes);
  const folha12m = round2(proLaboreContabilRate * rbt12);
  const fatorR = calcFatorR({ folha12m, rbt12 });

  const dasSeisPorcento = round2(receitaBrutaMes * taxRateLegacy);

  return {
    receitaBrutaMes: round2(receitaBrutaMes),
    rbt12,
    rbt12Tipo: tipo,
    mesesApurados,
    faixa: das.faixa,
    aliquotaNominal: das.aliquotaNominal,
    parcelaDeduzir: das.parcelaDeduzir,
    aliquotaEfetiva: das.aliquotaEfetiva,
    das: das.das,
    receitaLiquidaAposDas: das.receitaLiquidaAposDas,
    proLaboreContabil,
    folha12m,
    fatorR,
    fatorRStatus: fatorRStatus(fatorR),
    dasSeisPorcento,
    diferencaVs6: round2(das.das - dasSeisPorcento),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
