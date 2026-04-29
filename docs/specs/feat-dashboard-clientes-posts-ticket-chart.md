# FEAT — Gráfico de evolução: clientes ativos, posts/mês e ticket por post

## Problema observado

O Dashboard hoje só tem o gráfico de barras "Evolução mensal" com receita/despesa/lucro ([monthly-evolution-chart.tsx](../../src/app/(app)/dashboard/monthly-evolution-chart.tsx)). Faltam três séries operacionais que ajudam a entender se o crescimento de receita vem de **mais clientes**, **mais posts por cliente**, ou **ticket por post mais alto**:

1. **Nº de clientes ativos por mês** (cliente ativo no mês = tinha plano sem `end_date` em algum dia daquele mês)
2. **Posts/mês** (soma de `postsCarrossel + postsReels + postsEstatico × 0.5 + postsTrafego` dos planos ativos no fim do mês)
3. **Ticket médio por post** (`MRR_mês / posts_mês`)

Pedro também quer um **card** no topo do Dashboard mostrando o **nº médio de posts por cliente** (instante presente, mesma lógica do `$/post médio` que já existe).

## Comportamento esperado

### Card "Posts por cliente" no Dashboard

Posicionar junto aos KPIs existentes (Receita bruta, MRR, Custo médio/post). Fórmula:
```
total_posts_ativos / clientes_ativos
```
Onde `total_posts_ativos = sum(postsCarrossel + postsReels + postsEstatico × 0.5 + postsTrafego)` em planos com `end_date IS NULL`. `clientes_ativos` = nº de clientes distintos com pelo menos um plano ativo.

Mostrar também o sub-rótulo `X clientes · Y posts/mês` para contexto.

### Gráfico de linha "Evolução operacional — últimos 12 meses"

Componente novo `OperationalEvolutionChart` colocado abaixo do gráfico financeiro existente. Usa Recharts `LineChart` com 3 séries em eixos duplos (Y-esquerdo = clientes/posts contagem; Y-direito = ticket em R$):

| Série | Eixo | Cor sugerida | Formato |
|---|---|---|---|
| Clientes ativos | Y-esquerdo | `var(--primary)` (terracota) | inteiro |
| Posts/mês | Y-esquerdo | `#a3b545` (verde-amarelado) | inteiro |
| Ticket por post (R$) | Y-direito | `#15803d` (verde-escuro) | R$ XX,XX |

Tooltip customizado mostrando os 3 valores + variação % vs mês anterior.

Mesmo cutoff temporal do gráfico financeiro (a partir de `agency_settings.earliest_tracked_month` ou jan/2026 default).

## Não-objetivos

- Não incluir "posts entregues" (não temos esse dado — só temos posts contratados via plano)
- Não desagregar por tipo de post (carrossel/reels/estático) — mostrar total ponderado conforme fórmula de $/post
- Não calcular retroativamente para clientes que mudaram de plano: usar o `plan_value` e `posts*` vigentes no fim do mês de cada plano ativo

## Critérios de aceitação (testes)

Função `getOperationalEvolution(db, monthsBack = 12)` em `lib/queries/dashboard.ts`:

1. Retorna array de `{ month: "YYYY-MM", label: "abr/26", clientesAtivos, postsTotal, ticketPorPost }`
2. Mês com 0 planos ativos: `clientesAtivos=0, postsTotal=0, ticketPorPost=null`
3. Plano que iniciou no meio do mês conta como ativo naquele mês (`startDate <= último dia do mês AND (endDate IS NULL OR endDate >= primeiro dia do mês)`)
4. Plano que encerrou em 15/03 não conta em abril
5. Posts são ponderados: 1C + 1R + 2E + 1T = 1+1+1+1 = 4 (estático conta meio); ajustar conforme fórmula `calcularCustoPost` invertida
6. Ticket por post = MRR_do_mês (soma de `plan_value` ativos) / posts_total. Se posts_total=0 → null
7. Cliente com 2 planos ativos no mesmo mês conta 1 vez (DISTINCT)
8. `clientesAtivos` ignora planos com `endDate IS NOT NULL AND endDate < primeiro_dia_mes`
9. Função `getPostsPorCliente(db)` retorna `{ clientes, posts, ratio }` para o instante presente
10. Cobertura para 12 meses sem dados antigos: retorna 12 entradas com zeros, não trunca

## Arquivos críticos

- [src/lib/queries/dashboard.ts](../../src/lib/queries/dashboard.ts) — adicionar `getOperationalEvolution` e `getPostsPorCliente`
- [src/lib/queries/__tests__/dashboard.test.ts](../../src/lib/queries/__tests__/dashboard.test.ts) — testes (criar se não existir)
- [src/app/(app)/dashboard/operational-evolution-chart.tsx](../../src/app/(app)/dashboard/operational-evolution-chart.tsx) — componente novo
- [src/app/(app)/dashboard/dashboard-client.tsx](../../src/app/(app)/dashboard/dashboard-client.tsx) — incluir card "Posts/cliente" e o novo gráfico
- [src/app/(app)/dashboard/page.tsx](../../src/app/(app)/dashboard/page.tsx) — passar dados do server
- Reutilizar `calcularCustoPost` invertida em [src/lib/utils/calculations.ts](../../src/lib/utils/calculations.ts) — extrair `calcularPostsPonderados({carrossel, reels, estatico, trafego})` se ainda não existir

## Dependências

Recharts (já instalado — usado em `monthly-evolution-chart.tsx`).

## Ordem de implementação (TDD)

1. Spec ↑
2. Adicionar `calcularPostsPonderados` em `utils/calculations.ts` + teste
3. Adicionar `getPostsPorCliente` em `queries/dashboard.ts` + teste com 5 cenários
4. Adicionar `getOperationalEvolution` em `queries/dashboard.ts` + testes (10 cenários acima)
5. Criar `operational-evolution-chart.tsx`
6. Integrar em `dashboard-client.tsx` (card + gráfico)
7. Validar visualmente em `/dashboard` com dados reais

## Verificação end-to-end

1. `npm run test -- dashboard.test.ts` — todos os testes passam
2. `npm run typecheck`
3. Abrir `/dashboard` em dev: confirmar card "Posts/cliente" mostra valor coerente (~6 posts/cliente esperado para 30 clientes × 4-8 posts/plano), e gráfico mostra 3 linhas com legendas claras
4. Hover no gráfico mostra tooltip com valores + variação %
