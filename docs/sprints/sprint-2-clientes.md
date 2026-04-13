# Sprint 2 — Clientes

## Objetivo

Visão consolidada de cada cliente, com permanência real (desde o primeiro plano),
independente de upgrades/downgrades que encerram planos individuais.

## Comportamentos Esperados (Spec)

### Lista de Clientes
- [ ] Colunas: Nome, Origem, Status, Permanência, Planos Ativos, Valor Mensal, $/post Médio
- [ ] Status derivado: ativo se tem >= 1 plano com end_date IS NULL
- [ ] Permanência = meses desde o start_date do PRIMEIRO plano até hoje (ativo) ou até end_date do ÚLTIMO plano (inativo)
- [ ] Planos Ativos = count de planos sem end_date
- [ ] Valor Mensal = sum(plan_value) dos planos ativos
- [ ] $/post Médio = média ponderada dos $/post dos planos ativos (ou null se só tráfego)
- [ ] Filtros: status (Todos/Ativos/Inativos), origem do contato
- [ ] Busca por nome
- [ ] Ordenação em todas as colunas (3-click: asc > desc > reset)
- [ ] Clicar no nome abre lista de planos do cliente (ativos e históricos)

### Métricas resumidas (cards no topo)
- [ ] Total de clientes ativos
- [ ] Permanência média (ativos)
- [ ] Permanência mediana (todos)
- [ ] Ticket médio (valor mensal médio dos ativos)

## Decisões
- Permanência do cliente != permanência do plano. Cliente tenure sobrevive a upgrades.
- Fórmula: `floor(differenceInMonths(firstPlanStartDate, referenceDate))`
  - referenceDate = hoje se ativo, ou lastPlanEndDate se inativo
