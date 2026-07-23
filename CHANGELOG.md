# Changelog

Registro das mudanças relevantes do Clasen ADM. Mais recente no topo.
Cada entrada referencia o PR e o commit de merge na `main`.

## PR #11 — Realizado total (com avulsas) no Resumo mensal (2026-07-20)

- Tabela **Resumo mensal** e seção **Contratado × Realizado** do CFO ganharam a coluna **"Real. total"** = realizado de planos + receitas avulsas **pagas** do mês. A coluna "Realizado" segue só com pacotes e o **% Recebido continua realizado de planos ÷ contratado** (mede cobrança do recorrente — avulsas fora de propósito, senão um mês com avulsa grande mascararia mensalidade atrasada). Tooltip da célula mostra a decomposição (pacotes + avulsas).

## PR #10 — Nomes dos churned no hover (2026-07-20, `785dbf8`)

- **Aquisição**: o número de Churned de cada mês ganhou tooltip no hover com os nomes de quem saiu naquele mês (sublinhado pontilhado sinaliza; ordem alfabética). `MonthRow.churnedNames` sai do mesmo loop do churn — tooltip e número nunca divergem.

## PR #9 — Evolução operacional vira Social media (2026-07-19, `44c9d14`)

- **Tráfego fora do gráfico de evolução operacional** (decisão do Pedro): "Posts/mês" agora soma só social media ponderado (carrossel + reels + estático×0,5 — antes o tráfego contava 1). **Ticket/post** passa a dividir apenas a receita dos planos que produzem conteúdo (plano puro-tráfego não infla mais o ticket). Título renomeado para **"Evolução operacional — Social media"**; hints do gráfico e da tabela Resumo mensal atualizados (a coluna "Posts equiv." herda a mudança automaticamente).

## PR #8 — MRR contratado, tabela gerencial e curadoria do dashboard (2026-07-18)

- **Tabela "Resumo mensal"** no dashboard (sob o gráfico de evolução operacional): mês a mês desde jan/2026 — clientes, posts (UO), contratado, ticket médio, realizado, % recebido (com faixas de cor) e nº de pagamentos. Mês corrente marcado "em curso". Leitura: operação → contrato → caixa.
- **Fix de consistência**: o hero do dashboard somava posts **com tráfego** (150) enquanto /planos mostra posts de conteúdo (147). Unificado na definição da casa: sem tráfego.
- **Curadoria ampliada**: `diag-dashboard.ts` ganhou a seção 7 (Planos × Dashboard) — compara os três critérios de "plano ativo" (`status`, `status+endDate`, `endDate`) e as duas definições de posts. Hoje os critérios coincidem; a divergência de posts foi corrigida.
- **Relatório CFO atualizado**: nova seção **"Contratado × Realizado (mês a mês)"** (% recebido por mês, com a ressalva inadimplência × conciliação pendente) e agregado de **despesas por classe superior** na seção 4 (aparece conforme as despesas ganham `expense_type`; legado vira "Sem classificação").
- **Tabela Resumo mensal**: posts em duas medidas — **Posts** (quantidade bruta de conteúdo, sem tráfego) e **Posts equiv.** (métrica do gráfico de evolução: estático 0,5 + tráfego 1). A UO estrita com pesos segue sendo medida do presente (medidor de carga).
- **Refactor `isPlanoAtivo`**: definição canônica única de "plano ativo hoje" (`endDate` vazia; `status` é etiqueta redundante) em `lib/utils/calculations.ts`, aplicada nos 14 pontos que antes usavam 3 variações (`status`, `status+endDate`, `endDate`) — Dashboard, Planos, Operacional, CFO, clientes e unit-economics. Elimina o risco de telas divergirem em silêncio com dado dessincronizado.
- **Atrasados (/planos)**: total em aberto exibido sutilmente ao lado do contador do painel.
- **Gráfico Evolução mensal**: total da receita agora aparece no topo da coluna (o renderizador antigo dependia de `index` que o Recharts 3 não injeta — label nunca desenhava; reescrito no padrão de Despesa/Lucro). Mês com **déficit** mostra o valor em vermelho rente ao eixo, sem desenhar barra.
- **Fix de infra de teste**: `backfill-next-payment-date.ts` ganhou guard `isDirectRun` — o `main()` CLI rodava no import do teste e derrubava a suíte com unhandled rejection intermitente.

- **MRR do dashboard agora é 100% contratado** (decisão do Pedro): todos os meses somam o `plan_value` dos planos ativos em algum dia do mês. Antes era híbrido (passado = pagamentos realizados, corrente = contratado), o que fazia o mês "despencar" ao fechar se a conciliação estivesse atrasada (caso jun/2026: R$ 10.314 realizado vs R$ 21.145 contratado). Inadimplência e conciliação não alteram mais a curva — o realizado segue no P&L.
- **Fiscal preservado**: o DAS (tax-estimate) continua usando a série híbrida — imposto tributa receita auferida, não contrato. A lógica virou `aggregateRecorrenteHibrido`, exclusiva do fiscal.
- **Ferramenta de curadoria**: `src/scripts/diag-dashboard.ts` (read-only) audita planos, reajustes encadeados, clientes duplicados, pagamentos fora de janela e projeta a série do MRR. Rodar: `npx tsx --env-file=.env src/scripts/diag-dashboard.ts`.

## PR #7 — Multiplanos: auto-resolve pelo valor na conciliação (2026-06-23)

Suporte fino a cliente com 2 planos ativos (ex.: social media + tráfego na mesma cliente):

- **Conciliação (bulk-import)**: quando o cliente tem 2+ planos ativos e o valor pago bate exatamente **um único** deles, o pagamento é resolvido sozinho nesse plano (status "Pronto", motivo *"OK — plano identificado pelo valor"*). O seletor manual só aparece quando os valores empatam ou o valor não bate nenhum plano. Duplicata/confiança continuam sendo checadas no plano identificado.
- **WhatsApp de atrasados**: se a mesma cliente tem 2+ planos na lista, cada linha mostra o tipo do plano — `*Dara (Essential)*` / `*Dara (Tráfego)*` — e o título conta pessoas, não planos.

Decisão de modelagem registrada: **não** cadastrar tráfego como cliente separado ("Dara - Tráfego") — quebraria matching por nome na conciliação e as métricas por cliente (ativos, churn, LTV, ICP). O modelo é 1 cliente → N planos.

## PR #6 — CI verde confiável + registro das melhorias (2026-06-23, `83f0889`)

- **CI consertado** (estava vermelho em todos os runs desde o #3): lint com política ajustada (`no-explicit-any` e regras advisórias do React Compiler → warning; `rules-of-hooks` segue erro), hook condicional corrigido no gráfico de evolução, `TURSO_DATABASE_URL=":memory:"` no workflow (steps de teste/build nunca tinham rodado).
- Fix: test DB de `clients.test.ts` sem a coluna `description`.
- Docs: CLAUDE.md atualizado + este CHANGELOG criado.

## PR #5 — Conciliação, cobrança de atrasados e classificação (2026-06-23, `e7f6f84`)

### Conciliação (bulk-import via JSON do ChatGPT)
- **Seletor de plano** quando o cliente tem 2+ planos ativos. Antes a linha ficava `ambiguous` sem como resolver (beco sem saída); agora aparece um Select com os planos. `Decision.planIdOverride` + `PreviewItem.planCandidates`.
- Novo status **`amount_mismatch`**: a linha não entra verde quando o valor pago diverge do `plan_value` do plano. Opção de registrar como receita avulsa (`applyAsRevenue`).
- **Criar/vincular cliente em receitas avulsas**: avulsa com `clientName` que não casa vira `unknown_client` (antes gravava receita órfã sem cliente, silenciosamente). Dá pra criar cliente novo ou escolher existente.
- **Prompt do ChatGPT** (`conciliacao-prompt.ts` + `docs/conciliacao-prompt-chatgpt.md`): valor que não bate o plano nunca passa de confiança 89 (o sistema trata `< 90` como "revisar").

### Cobrança de atrasados (painel em `/planos`)
- Botão **"ChatGPT"**: copia a lista de atrasados em markdown para colar no ChatGPT e cruzar com o extrato bancário.
- Botão **"WhatsApp"**: copia texto simples (nome, valor em aberto, desde quando, total) para a sócia cobrar.
- Clicar no **nome do cliente** abre o histórico de pagamentos (`PaymentHistoryDialog`), igual à tabela de planos.
- Lógica pura e testável em `lib/utils/overdue-export.ts`.

### Lançamentos
- Nova página **`/conciliacao/lancamentos`** (`lib/queries/lancamentos.ts`): lista cronológica de pagamentos de plano + receitas avulsas, para conferir se um cliente "atrasado" na verdade já teve lançamento registrado.

### Receitas avulsas
- Coluna **`description`** em `one_time_revenues` (migration `0013`): a conciliação grava ali o nome do extrato (quem pagou). Coluna "Descrição" na tabela.
- **Produto editável inline** na tabela (`updateRevenueProduct`), sem abrir o dialog.

### Despesas
- Coluna **`expense_type`** em `expenses` (migration `0014`): classificação operacional (designer, copywriter, reels, sistemas, administrativo, burocrático, investimento permanente, capacitação, impulsionar, tráfego, imposto).
- **Classe superior derivada** do tipo via `EXPENSE_TYPE_TO_CLASS` (não selecionável). Eixo ortogonal a `category` (fixo/variável/tributos) — **não afeta o P&L**.
- Select de tipo no dialog + classificação inline na tabela.
- Fix: categoria `tributos` exibia "Variável" na tabela de despesas.

### Banco
- Migrations `0013` e `0014` — apenas `ADD COLUMN` nullable, não-destrutivas, aplicadas no Turso via `db:push`.

### Verificação
- Testes (Vitest, TDD) cobrindo bulk-import, overdue-export, lançamentos, revenues e expenses. Typecheck limpo.

---

## Histórico anterior (por PR)

- **#4** — `feat(operacional)`: lembrete de check pendente, banner global.
- **#3** — `feat(operacional)`: página de saúde operacional (Sprint 7).
- **#2** — `feat(planos)`: unidades operacionais (UO) com redutor por plano e teto de capacidade.
- **#1** — `feat`: tributação DAS Simples Nacional (Anexo III + Fator R).

> Antes do changelog: Sprints 1-3 + A-E (planos, clientes, dashboard, ciclo de pagamento, reajustes, ICP) — ver histórico do git.
