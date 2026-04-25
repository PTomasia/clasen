# FIX-1.1 — `updatePlan` recalcula `nextPaymentDate` quando `billingCycleDays` muda

## Problema observado

Em produção (24/04/2026), planos da Innera, Dara e outros 6 clientes apareceram como "sem pagamento" mesmo após pagamento registrado. Investigação no Turso mostrou:

- `lastPaymentDate` preenchido (pagamento real registrado em `plan_payments`)
- `billingCycleDays` definido (Innera=30, Dara=10)
- `nextPaymentDate = NULL`

Sequência reprodutora:
1. Plano criado **sem** `billingCycleDays` (campo opcional no form)
2. Pagamento registrado → `recordPayment` salvou `nextPaymentDate = NULL` (correto: sem ciclo, não dá pra calcular)
3. Pedro depois editou o plano e configurou `billingCycleDays`
4. **`updatePlan` não recalcula `nextPaymentDate`** → fica NULL pra sempre

## Comportamento esperado

`updatePlan` deve recalcular `nextPaymentDate` quando, após o update:
- `billingCycleDays` resultante **não é null**
- `lastPaymentDate` resultante **não é null** (precisa de uma base temporal pra calcular)

A regra de cálculo é a mesma de `recordPayment`: a partir de `lastPaymentDate`, encontra o próximo dia de vencimento (1 ou 2 vencimentos por mês), respeitando meses curtos (`Math.min(due, daysInMonth)`).

Casos de borda:
- `billingCycleDays` continua null → `nextPaymentDate` permanece como estava
- `lastPaymentDate` é null (plano sem pagamentos ainda) → `nextPaymentDate` permanece como estava (foi calculado pelo `createPlan` a partir de `startDate`)
- Update altera `billingCycleDays` mas plano nunca teve pagamento → não recalcular (mantém o `nextPaymentDate` derivado de `startDate`)

## Não-objetivos

- Não alterar `recordPayment` (já está correto)
- Não tornar `billingCycleDays` obrigatório no schema (mudança de UI separada)
- Não fazer rollback automático de pagamentos. Backfill é script separado.

## Critérios de aceitação (testes)

1. `updatePlan` em plano sem `billingCycleDays` mas com `lastPaymentDate`, ao adicionar `billingCycleDays`, calcula `nextPaymentDate` a partir de `lastPaymentDate + 1 mês no dia configurado`
2. `updatePlan` em plano com `billingCycleDays=10` e `lastPaymentDate`, ao mudar pra `billingCycleDays=20`, recalcula `nextPaymentDate` para o dia 20
3. `updatePlan` em plano sem `lastPaymentDate`, ao adicionar `billingCycleDays`, mantém `nextPaymentDate` inalterado (não há base de cálculo)
4. `updatePlan` que não toca `billingCycleDays` (não passa o campo) e mantém o existente: `nextPaymentDate` permanece o mesmo (não recalcula desnecessariamente)
5. Suporte a 2 vencimentos: update com `billingCycleDays=5, billingCycleDays2=20` recalcula corretamente

## Backfill

Script `scripts/backfill-next-payment-date.mjs` (idempotente, dry-run por padrão):
- Para cada plano ativo onde `nextPaymentDate IS NULL`:
  - Se há `lastPaymentDate` E `billingCycleDays`: recalcula a partir de `lastPaymentDate`
  - Se NÃO há `lastPaymentDate` mas há `billingCycleDays` E há `startDate`: recalcula a partir de `startDate` (próximo mês)
  - Se NÃO há `billingCycleDays`: pula (Pedro precisa configurar via UI; ao salvar, o fix do `updatePlan` resolve automaticamente)
- Modo `--apply` aplica de fato. Sem flag, só imprime o que faria.
