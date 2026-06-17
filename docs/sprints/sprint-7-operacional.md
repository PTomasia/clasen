# Sprint 7 — Operacional (saúde operacional · transição da Gabi)

## Objetivo

Medir a **saúde operacional** da Clasen de forma simples e recorrente, e acompanhar a
**transição da Gabi de executora para diretora criativa/conteúdo** — se a dependência da
execução direta dela (e da revisão do Pedro) está caindo e se a operação comporta novas
clientes. A Gabi preenche **dois checks rápidos por mês** (meio e fim do mês). A experiência
é leve (botões/escalas/chips), não um formulário burocrático.

## Decisões de modelagem

1. **Um registro por `(reference_month, period)`** (`meio_mes` | `fim_mes`) — upsert no
   service, sem duplicar. Arrays (gargalos, clientes pesadas, motivos) gravados como **JSON
   text**, serializados na camada service.
2. **Carga de produção = planejada/contratada, não realizada (MVP).** Os campos de produção
   (posts totais, UO, carrosséis, reels, estáticos, tráfego, avulsos) são **pré-preenchidos**
   da carteira ativa + avulsos do mês (editável, snapshot fixo no check). Split futuro:
   planejada / realizada / retrabalho.
3. **Carga alinhada à página Planos**: `aggregateCargaPlanejada` usa a MESMA definição do
   hero card de Planos — planos com `status === "ativo"` (exclui predecessores de reajuste,
   que viram `cancelado`, e demais cancelados — sem double-count). "Posts totais" = conteúdo
   (carrossel+reels+estático), **sem tráfego**; UO via pesos por plano. Avulsos = contagem em
   `one_time_revenues` no mês.
4. **Execução da Gabi e retrabalho = qualitativo, não numérico.** Os 5 campos (entregas
   executadas, copys devolvidas, designs refeitos, posts revisados Gabi/Pedro) usam escala
   **Nada · Pouco · Médio · Bastante · Muito**, gravada como **ordinal 1-5** nas colunas
   integer (sem migration). A Gabi não preenche contagem.
5. **Status da agenda** = principalmente a nota de capacidade, com **travas que só pioram**
   (nunca melhoram): a percepção da Gabi é o sinal principal; os dados operacionais podem
   rebaixar a leitura otimista.

## Entregas (TDD: spec → testes → código)

- `lib/db/schema.ts` — tabela `operational_checks` (migration `0012`).
- `lib/utils/operational-metrics.ts` — puro/testado: `calcScoreOperacional`, `interpretarScore`
  (5 faixas), `derivarStatusAgenda` (base + travas), `sugerirDecisoes`, `avaliarDependencia`.
- `lib/services/operational.ts` — upsert por mês+período, validação (notas 1-5, qualitativo
  1-5, gargalos ≤ 3), serialização JSON.
- `lib/queries/operacional.ts` — `getCargaPlanejada` (prefill), `pickLatestCheck`,
  `buildEvolutionSeries`, `deriveMetrics`, `getOperationalPageData`.
- `lib/operational-report/build-operational-report.ts` — relatório MD copiável (8 seções do
  template), execução/retrabalho como rótulos qualitativos.
- `lib/actions/operational.ts` — `createOperationalCheckAction`, `deleteOperationalCheckAction`,
  `getCargaPlanejadaAction`, `exportOperationalReportAction`.
- `app/(app)/operacional/` — `page.tsx`, `operacional-client.tsx` (cards + 4 gráficos +
  histórico), `operational-check-dialog.tsx` (escalas, chips de gargalos ≤ 3, clientes
  pesadas + motivos, carga prefill), `operational-charts.tsx`, `copy-operational-report-button.tsx`.
- `components/layout/sidebar.tsx` — novo grupo "Gestão Interna" → Operacional (`CURRENT_SPRINT = 7`).
- `constants.ts` — `CHECK_PERIODS`, `GARGALOS`, `MOTIVOS_PESO`, `SCORE_BANDS`,
  `AGENDA_STATUS_LABELS`, `RATING_*`, `NIVEL_QUALITATIVO_*`, `/operacional` em `REVALIDATE_PATHS`.

## Campos manuais por check

- Notas 1-5: execução direta, revisão, direção criativa, energia, capacidade.
- Execução/retrabalho (escala Nada→Muito), gargalos (até 3), clientes pesadas + motivos,
  comentários.
- Carga planejada vem pré-preenchida (botão "Recarregar do portal") mas é editável.

## Fórmulas

Ver `CLAUDE.md` → "Business Logic Formulas" → bloco "Operational health (Sprint 7)":
score, status da agenda (base + travas) e carga planejada.
