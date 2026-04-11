# Fórmulas de Negócio — Clasen ADM

Documento crítico. Todas as fórmulas de cálculo usadas no sistema.
Validadas contra os dados reais da planilha Google Sheets.

---

## $/post (Custo por Post)

```
$/post = valor_mensal / (carrosseis + reels + (estático × 0.5))
```

- **Estático vale 0,5x** — exige menos trabalho que carrossel/reels
- **Tráfego NÃO entra** no denominador — é produto separado
- Se não há posts de conteúdo (só tráfego), retorna `null`

### Validação

| Cliente | Valor | Carrossel | Reels | Estático | Cálculo | $/post |
|---------|-------|-----------|-------|----------|---------|--------|
| Borba Gato | R$900 | 4 | 0 | 6 | 900/(4+0+3) | R$128,57 ✓ |
| Fernanda Muniz | R$1.005 | 4 | 2 | 4 | 1005/(4+2+2) | R$125,63 ✓ |
| Jessica Ortega | R$380 | 1 | 0 | 4 | 380/(1+0+2) | R$126,67 ✓ |

---

## Permanência (Tenure)

```
permanencia_meses = floor(meses entre start_date e (end_date OU hoje))
```

- Usa **meses calendário completos** (floor, não arredonda pra cima)
- Para planos ativos: `end_date` é `null`, usa data de hoje
- Implementar com `date-fns/differenceInMonths`

### Validação

| Cliente | Início | Fim/Hoje | Meses | Planilha |
|---------|--------|----------|-------|----------|
| Borba Gato | 01/04/2024 | 11/04/2026 | 24 | 24 ✓ |
| Isabela Godoy | 01/02/2025 | 11/04/2026 | 14 | 14 ✓ |

---

## Status de Pagamento

```
se next_payment_date == null  → "sem_pagamento"
se next_payment_date >= hoje  → "em_dia"
se next_payment_date < hoje   → "atrasado"
```

Calculado automaticamente — nunca preenchido manualmente.

---

## Status do Cliente (Derivado)

```
se EXISTS(plano WHERE end_date IS NULL) → "ativo"
senão → "inativo"
```

---

## Mediana de Permanência

```
1. Buscar permanência de todos os clientes (ativos ou todos, conforme filtro)
2. Ordenar crescente
3. Se qtd ímpar: elemento do meio
4. Se qtd par: média dos dois do meio
```

SQLite não tem MEDIAN nativa — calculado em TypeScript.

---

## Métricas do Dashboard

| Métrica | Fórmula |
|---------|---------|
| Clientes ativos | COUNT(clients com pelo menos 1 plano ativo) |
| Receita bruta ativos | SUM(plan_value) de planos ativos |
| Ticket médio ativo | AVG(plan_value) de planos ativos |
| Ticket médio por post | AVG($/post) de planos ativos com posts |
| T médio perm. | AVG(permanência) de TODOS os clientes |
| T médio ativo | AVG(permanência) de clientes ativos |
| T médio inativo | AVG(permanência) de clientes inativos |
| T médio +3M | AVG(permanência) de clientes com permanência ≥ 3 |
| Ativo +3M | COUNT(clientes ativos com permanência ≥ 3) |
| Mediana | MEDIAN(permanência de todos) |
| Qtd posts ativos | SUM(carrossel+reels+estático+tráfego) de planos ativos |

---

## Métricas de Aquisição (Sprint 4)

| Métrica | Fórmula |
|---------|---------|
| CAC | ad_spend / new_clients (se new_clients > 0) |
| LTV | SUM(plan_payments + one_time_revenues) / COUNT(clients) |
| Relação LTV/CAC | LTV / CAC |
| ROAS bruto | receita_mes / ad_spend |
| Churn | churned_clients / total_clients_inicio_mes |
