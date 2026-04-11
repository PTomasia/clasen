# Sprint 1 — Scaffold + Histórico de Planos

## Objetivo

Criar a base do sistema e o módulo principal: Histórico de Planos.
Ao final do sprint, deve ser possível cadastrar planos, registrar pagamentos,
ver $/post calculado e rankear clientes por custo.

## Comportamentos Esperados (Spec)

### Criar Plano
- [ ] Selecionar cliente existente OU digitar nome novo (cria inline)
- [ ] Campos obrigatórios: cliente, tipo, valor, data início
- [ ] Campos opcionais: ciclo, posts, movimentação, observações
- [ ] Se tipo = Tráfego: posts de conteúdo podem ser zero
- [ ] Se tipo != Tráfego: deve ter pelo menos 1 post de conteúdo
- [ ] $/post é calculado e exibido ao preencher o formulário

### Lista de Planos
- [ ] Exibe todos os planos (ativos e inativos)
- [ ] Filtro por status: Todos / Ativos / Inativos
- [ ] Colunas: Cliente, Tipo, Valor, $/post, Permanência, Status Pgto, Status
- [ ] Ordenação por $/post crescente (ranking de reajuste)
- [ ] Status de pagamento calculado: Em dia / Atrasado / Sem pagamento

### Registrar Pagamento
- [ ] Abre modal ao clicar "Registrar pagamento"
- [ ] Campos: data, valor (pré-preenchido com valor do plano), status
- [ ] Após salvar: atualiza last_payment_date e next_payment_date no plano
- [ ] Recalcula payment_status automaticamente

### Encerrar Plano
- [ ] Define end_date
- [ ] Se cliente não tem outros planos ativos → cliente fica inativo

### Editar Plano
- [ ] Permite editar valor (registra last_adjustment_date)
- [ ] Permite editar composição de posts

## Decisões Tomadas
_Preenchido durante/após implementação_

## Como Testar Manualmente
_Preenchido após implementação_
