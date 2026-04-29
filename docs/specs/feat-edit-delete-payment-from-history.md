# FEAT — Editar e excluir pagamento no modal de histórico mensal

## Problema observado

O modal `PaymentHistoryDialog` ([payment-history-dialog.tsx](../../src/app/(app)/planos/payment-history-dialog.tsx)) lista os pagamentos mês a mês de um plano, mas só permite **congelar mês** (`skipPaymentMonth`). Se Pedro percebe que digitou valor errado, data errada, ou registrou em duplicidade, ele precisa ir direto no Drizzle Studio — caminho que **provoca o bug que acabamos de corrigir** (last_payment_date / next_payment_date dessincronizam).

Pedro quer dois botões em cada linha do histórico: **editar** (lápis) e **excluir** (lixeira).

## Comportamento esperado

### Botão "Editar" em cada pagamento

Abre dialog inline com formulário pré-preenchido (data, valor, status, notas). Salvar dispara `updatePayment(planId, paymentId, input)` que:
1. Atualiza o registro em `plan_payments`
2. Recalcula `last_payment_date` e `next_payment_date` do plano usando `getActualLastPayment` (introduzido na correção do bug "Atrasado sem +N")
3. Revalida `/planos`, `/dashboard`

Validações:
- Data não pode ser anterior a `subscription_plans.start_date`
- Valor > 0 (exceto se `skipped=true`, mas mês congelado não tem botão "editar" — vira "descongelar" botão futuro fora desse escopo)
- Status só aceita `pago` ou `pendente`

### Botão "Excluir" em cada pagamento

Confirmação modal: "Excluir pagamento de DD/MM/AAAA? Esta ação não pode ser desfeita." Confirmar dispara `deletePayment(planId, paymentId)` que:
1. Remove o registro de `plan_payments`
2. Recalcula `last_payment_date` (= `getActualLastPayment` após delete) e `next_payment_date` do plano
3. Se era o único pagamento: `last_payment_date = NULL`, `next_payment_date` recalculado a partir de `start_date` (mesma lógica do `createPlan`)
4. Revalida `/planos`, `/dashboard`

### UX no modal

| Linha | Estado | Botões à direita |
|---|---|---|
| Pagamento normal (`skipped=0`) | — | ✏️ Editar · 🗑️ Excluir |
| Mês congelado (`skipped=1`) | — | (sem botões — usar opção futura "descongelar") |
| Mês em aberto (gap) | — | ainda mostra "Pagar" e "Pular" como hoje |

Manter alinhamento de coluna com `invisible` quando o slot não aplica (mesmo padrão do fix #2).

## Não-objetivos

- Não permitir editar/excluir pagamentos com `skipped=true` (botão "descongelar" é spec separada se Pedro quiser)
- Não fazer audit log de alterações (não há tabela para isso ainda)
- Não permitir mover pagamento entre planos (caso raro — recriar é mais simples)
- Não permitir editar `paymentDate` para um mês que já tem outro pagamento real (mantém invariante "1 pagamento/mês" do gap analysis)

## Critérios de aceitação (testes)

`updatePayment(db, planId, paymentId, input)` em `lib/services/plans.ts`:

1. Atualiza data/valor/status/notes do registro corretamente
2. Após update, `subscription_plans.last_payment_date = getActualLastPayment(planId)`
3. Após update, `subscription_plans.next_payment_date = calcularProximoVencimento(novoLast, billingCycleDays, billingCycleDays2)` (se billing definido)
4. Se editar levou a data ser a mais nova: last/next refletem isso
5. Se editar levou a data sair da posição "mais recente" (ex: editou 17/04 para 17/02): last_payment volta para o pagamento de 16/03 que agora é o mais recente
6. Erro: data anterior a `start_date` → throw "data não pode ser anterior ao início do plano"
7. Erro: tentar editar pagamento com `skipped=true` → throw "use descongelar mês"
8. Erro: `paymentId` inexistente → throw "pagamento não encontrado"
9. Erro: novo `paymentDate` cai em mês que já tem outro pagamento não-skipped → throw "já existe pagamento neste mês"

`deletePayment(db, planId, paymentId)`:

10. Remove registro
11. Recalcula last/next baseado nos pagamentos restantes
12. Excluir único pagamento → `last_payment_date = null`, `next_payment_date` derivado de `start_date`
13. Excluir pagamento mais recente → `last_payment_date` aponta para o anterior
14. Excluir pagamento intermediário → `last_payment_date` permanece igual ao mais recente
15. Erro: `paymentId` inexistente → throw

## Arquivos críticos

- [src/lib/services/plans.ts](../../src/lib/services/plans.ts) — adicionar `updatePayment` e `deletePayment`. Reutilizar `getActualLastPayment` (linha ~563) e `calcularProximoVencimento` (de `utils/calculations.ts`)
- [src/lib/services/__tests__/plans.test.ts](../../src/lib/services/__tests__/plans.test.ts) — adicionar `describe("updatePayment")` e `describe("deletePayment")` com os 15 cenários acima
- [src/lib/actions/plans.ts](../../src/lib/actions/plans.ts) — adicionar `updatePaymentAction` e `deletePaymentAction` com revalidação
- [src/app/(app)/planos/payment-history-dialog.tsx](../../src/app/(app)/planos/payment-history-dialog.tsx) — adicionar botões nos rows + dialogs aninhados (edit + delete confirmation)
- Pode reusar [src/app/(app)/planos/payment-dialog.tsx](../../src/app/(app)/planos/payment-dialog.tsx) refatorado para suportar modo "edit"

## Ordem de implementação (TDD)

1. Spec ↑
2. Testes para `updatePayment` (9 cenários) — falham
3. Implementar `updatePayment` em `services/plans.ts`
4. Testes para `deletePayment` (6 cenários) — falham
5. Implementar `deletePayment`
6. Adicionar actions com revalidação
7. UI: refatorar `PaymentDialog` para suportar `mode="edit"` ou criar `EditPaymentDialog` separado se ficar mais limpo
8. Adicionar botões + confirmation modal em `PaymentHistoryDialog`
9. Validar manualmente: editar valor de pagamento da Fernanda e confirmar que `/planos` reflete corretamente

## Verificação end-to-end

1. `npm run test -- plans.test.ts` — testes novos passam
2. `npm run typecheck`
3. Abrir histórico de uma cliente em `/planos` → editar pagamento → conferir valor atualizado
4. Excluir um pagamento → conferir que último pgto e status pgto da `/planos` refletem corretamente (sem o bug "Atrasado sem +N")
5. Tentar criar pagamento duplicado no mesmo mês → erro amigável
