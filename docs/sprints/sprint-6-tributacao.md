# Sprint 6 — Tributação (DAS Simples Nacional · Anexo III + Fator R)

## Objetivo

Substituir a premissa de **6% fixo** de imposto por uma **estimativa gerencial do DAS**
calculada pela tabela progressiva do Simples Nacional (Anexo III), assumindo que a Clasen
usa **Fator R**. Melhora a leitura de margem, caixa e resultado mês a mês. O valor oficial
continua sendo confirmado pela contabilidade (Contabilizei/PGDAS) — a estimativa nunca é
tratada como pagamento realizado.

## Decisões de modelagem

1. **Base de receita = competência** (MRR contratado + avulsas do mês), reusando
   `aggregateMrr` de `dashboard.ts` + avulsas por mês de `date`.
2. **DAS nas Despesas = sugestão calculada + botão "Lançar DAS estimado"** (não grava nada
   automaticamente). Ao lançar, cria uma despesa real, **não paga**, categoria `tributos`,
   que o usuário substitui pelo valor oficial e marca como paga.
3. **Fator R = 28% por design**: pró-labore contábil = 28% da receita (folha 12m = 28%×RBT12).
   Pró-labore gerencial da DRE segue R$ 15.000.

## Entregas (TDD: spec → testes → código)

- `lib/utils/simples-nacional.ts` — tabela Anexo III + RBT12 + alíquota efetiva + DAS +
  Fator R (puro, testado).
- `lib/queries/tax-estimate.ts` — série de receita por competência + `getTaxEstimate`.
- `lib/cfo-export/financial-params.ts` — `proLaboreContabilRate: 0.28`, `fatorRThreshold: 0.28`
  (mantém `taxRate: 0.06` como baseline de comparação).
- DRE (`calculations.ts`): linha de tributo = DAS estimado; cenários usam alíquota efetiva
  projetada (RBT12 = receita × 12).
- P&L (`profit-and-loss.ts`): categoria `tributos` não entra em despesa operacional (evita
  dupla contagem); novo campo `tributosPagos` por mês.
- Categoria `tributos` em `constants.ts` + `expense-dialog.tsx`.
- Dashboard: bloco "Estimativa Tributária" (11 campos + observação).
- Despesas: painel de sugestão + botão "Lançar DAS estimado".
- Relatório CFO: seção "Estimativa Tributária" (RBT12, faixa, efetiva, DAS, Fator R,
  comparação 6% × efetiva, alerta de valor não-oficial).

## Campos manuais por mês

- **Valor oficial do DAS** (quando a Contabilizei/PGDAS confirmar): editar a despesa de
  `tributos` lançada e marcar como paga.
- Opcional: ajustar pró-labore gerencial se mudar de R$ 15.000.
- Receita, RBT12, faixa, alíquota, DAS e Fator R são automáticos. Início do enquadramento
  usa `FINANCIAL_DATA_START` (2026-01).

## Fórmulas

Ver `docs/formulas.md` → seção "Imposto — DAS Simples Nacional (Anexo III + Fator R)".
