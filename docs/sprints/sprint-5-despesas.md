# Sprint 5 — Despesas

## Objetivo

Fechar o ciclo financeiro da agência: registrar despesas mensais (fixas e variáveis), calcular resultado líquido por mês cruzando com receitas, e visualizar evolução de lucro ao longo do tempo.

Até aqui o sistema controla só **entradas**. Despesas são a outra metade do P&L — sem elas, não há visão real de lucro.

## Comportamentos esperados

### Service `expenses.ts`

- `createExpense({ month, description, category, amount, isPaid?, notes? })`
  - `month` formato `YYYY-MM` — rejeita formato inválido
  - `amount > 0` — rejeita 0 e negativos
  - `description` obrigatória e não-vazia (trim)
  - `category` ∈ `{'fixo', 'variavel'}` — default `variavel`
  - `isPaid` default `true` (agência paga, registra como quitado)
  - Retorna linha inserida

- `updateExpense(id, input)` — substitui campos; rejeita ID inexistente.

- `deleteExpense(id)` — remove registro.

- `getExpenses({ month? })` — lista tudo, ou filtra por mês específico. Ordenado por `month` desc, então `id` desc dentro do mesmo mês.

- `getExpensesSummary(today?)` — resumo agregado:
  - `totalMesAtual` (despesas pagas no mês corrente)
  - `totalAno` (despesas pagas no ano corrente)
  - `totalGeral` (despesas pagas em todos os meses)
  - `totalPendente` (soma de não-pagas, qualquer mês)
  - `totalFixoMesAtual`, `totalVariavelMesAtual` — breakdown do mês corrente
  - `qtdMesAtual`, `qtdTotal`

### Query `profit-and-loss.ts`

Cruza `plan_payments` (pagos) + `one_time_revenues` (pagas) − `expenses` (pagas) por mês, últimos 12 meses.

- `getProfitAndLossData()` retorna:
  ```ts
  rows: Array<{
    month, label,
    receitaRecorrente, receitaAvulsa, receitaTotal,
    despesaFixa, despesaVariavel, despesaTotal,
    lucroLiquido,
    margemLiquida // null se receitaTotal === 0
  }>
  totals: {
    receitaTotal, despesaTotal, lucroTotal,
    margemMedia: // lucro / receita agregado
    despesaFixaTotal, despesaVariavelTotal,
    mesesNoLucro, mesesNoPrejuizo
  }
  ```

### Página `/despesas`

**Cards (linha 1):** Este mês (pagas), Ano atual, Pendentes (destaque se > 0), Lucro do mês (cruzando receita do mês − despesas do mês).

**Cards (linha 2):** Receita 12m, Despesa 12m, Lucro 12m (com %).

**Tabela principal:** lista de despesas com filtros (mês, categoria, status pago/pendente, busca).
- Colunas: Mês, Descrição, Categoria (badge), Valor, Status, Ações (editar/excluir)
- Dialog de criar/editar
- Dialog de confirmar exclusão

**Tabela P&L (12 meses):** mês, receita total, despesa fixa, despesa variável, lucro, margem %.
- Lucro negativo em destaque (coral/destructive).
- Margem ≥ 20% em verde.

### Sidebar

Ativar rota `Despesas` (remover "em breve" se houver). Ícone: `Receipt` ou `TrendingDown`.

### Integrações com o existente

- **Dashboard `/dashboard`** (opcional neste sprint): adicionar card "Lucro do mês" e "Margem líquida".
- `CURRENT_SPRINT` na sidebar → 5.

## Fora de escopo

- Categorias dinâmicas (só fixo/variável por ora)
- Recorrência automática (despesas fixas replicadas mês a mês) — pode ir pro Sprint 7
- Anexos de comprovante
- Fornecedores / vendors
- Orçado vs realizado

## Decisões técnicas

- `category` enum restrito a `'fixo'` e `'variavel'` — validado no service, não no DB.
- `month` é `YYYY-MM`, não data completa — despesa é mensal por natureza (aluguel, salário). Se precisar de data exata, usa `notes`.
- Margem líquida usa receita **recebida** (pagamentos pagos + avulsas pagas), não MRR contratado. Isso reflete caixa real.
- Pendentes não entram no cálculo de lucro — só caixa que entrou/saiu de fato.

## Testes prioritários

1. `createExpense` rejeita mês inválido, amount ≤ 0, description vazia, category inválida
2. `getExpensesSummary` separa pagas/pendentes, fixo/variável, mês/ano/geral
3. `getProfitAndLossData` cobre:
   - Receita vem de pagamentos pagos + avulsas pagas
   - Despesa vem só de expenses pagas (não pendentes)
   - Lucro negativo quando despesa > receita
   - Margem null quando receita = 0
   - Categorização fixo/variável no breakdown
   - Meses sem movimentação aparecem com zeros
   - Últimos 12 meses (não 13)
