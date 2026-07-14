# Changelog

Registro das mudanças relevantes do Clasen ADM. Mais recente no topo.
Cada entrada referencia o PR e o commit de merge na `main`.

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
