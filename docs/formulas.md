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

## Unidades Operacionais (UO)

Métrica gerencial **interna** de carga operacional de **social media**. **Não afeta
o $/post** (preço continua na contagem cheia) nem nenhuma análise por post.

```
UO_plano = carrossel × pesoCarrossel + reels × pesoReels + (estático × 0.5)
```

- **Carrossel e reels valem 1** por padrão; **estático 0,5**.
- **Tráfego NÃO entra** — é um setor à parte (não consome a operação de social media).
- **Redutor** (`pesoCarrossel` / `pesoReels`): peso ajustável **por plano**, default
  1,0. Para produções simplificadas, reduz-se o peso (ex.: "só design" = 0,5; reels
  médio = 0,75). Sem teto superior. Estático não tem redutor.

> O gráfico "Posts/mês" da evolução operacional (Dashboard) é uma métrica histórica
> separada e **conta tráfego** (peso 1), sem redutor — não confundir com a UO.
- **Carga da carteira** = soma de `UO_plano` dos planos ativos.
- **Teto de capacidade** = `TETO_OPERACIONAL_UO` = **120 UO**, desenhado como 30
  clientes Essential × 4,0 UO. **Utilização** = carga ÷ teto.

### Validação

| Composição | Pesos | Cálculo | UO |
|------------|-------|---------|-----|
| Essential: 2C 2R 1E | reels 0,75 | 2×1 + 2×0,75 + 1×0,5 | 4,0 ✓ |
| "Só design": 2C | carrossel 0,5 | 2×0,5 | 1,0 ✓ |
| 30× Essential | reels 0,75 | 30 × 4,0 | 120 (100% do teto) ✓ |

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

---

## Imposto — DAS Simples Nacional (Anexo III + Fator R)

> **Estimativa gerencial.** O valor oficial do DAS é apurado pela contabilidade
> (Contabilizei/PGDAS). Implementado em `src/lib/utils/simples-nacional.ts`.
> Substitui a antiga premissa de **6% fixo** (mantida só como baseline de comparação).

Premissa principal da Clasen: CNAE 7311-4/00 (agência de publicidade), usa **Fator R**
→ tributa pelo **Anexo III**. Base de receita = **regime de competência** (MRR contratado
+ avulsas do mês).

### Alíquota efetiva e DAS

```
aliquota_efetiva = ((RBT12 × aliquota_nominal) − parcela_deduzir) / RBT12
DAS_do_mes       = receita_bruta_do_mes × aliquota_efetiva
```

### RBT12 (Receita Bruta dos últimos 12 meses)

```
real (≥12 meses de operação)  = soma da receita bruta dos 12 meses anteriores ao mês de apuração
proporcionalizada (<12 meses) = (receita acumulada desde o início / meses apurados) × 12
1º mês de atividade           = receita do próprio mês × 12
```

O dashboard sinaliza se a RBT12 é **real** ou **proporcionalizada**.

**Início do enquadramento:** a RBT12 conta a partir da abertura do **CNPJ atual**
(`SIMPLES_NACIONAL_INICIO = "2026-06"` em `constants.ts`) — a Clasen abriu o CNPJ novo
em jun/2026; antes operava sob outro CNPJ. Receita anterior a junho **não** entra na
RBT12 deste CNPJ. Logo **junho/2026 é o 1º mês de atividade** (RBT12 = receita do mês ×
12, proporcionalizada, 1 mês apurado). Esse marco é separado de `FINANCIAL_DATA_START`
(jan/2026), que segue valendo para as demais agregações financeiras.

### Tabela do Anexo III

| Faixa | RBT12 até | Alíquota nominal | Parcela a deduzir |
|-------|-----------|------------------|-------------------|
| 1 | R$ 180.000 | 6,00% | R$ 0 |
| 2 | R$ 360.000 | 11,20% | R$ 9.360 |
| 3 | R$ 720.000 | 13,50% | R$ 17.640 |
| 4 | R$ 1.800.000 | 16,00% | R$ 35.640 |
| 5 | R$ 3.600.000 | 21,00% | R$ 125.640 |
| 6 | R$ 4.800.000 | 33,00% | R$ 648.000 |

### Fator R

```
Fator_R = folha_salarios_12m (incl. pró-labore) / RBT12
status  = "OK — Anexo III"            se Fator_R ≥ 28%
          "Atenção — risco de Anexo V" se Fator_R < 28%
```

Política da Clasen: o **pró-labore contábil = exatamente 28% da receita do mês** (o
restante até os R$ 15.000 gerenciais vira distribuição de lucros; o contador calcula).
Logo folha 12m = 28% × RBT12 → **Fator R = 28% por design** → Anexo III. O pró-labore
**gerencial** da DRE continua **R$ 15.000**.

### Validação (Faixa 1 e Faixa 3)

| RBT12 | Faixa | Alíquota efetiva | Receita do mês | DAS |
|-------|-------|------------------|----------------|-----|
| R$ 168.000 (proporc.) | 1 | 6,00% | R$ 14.000 | R$ 840 |
| R$ 480.000 (real) | 3 | 9,825% = (480000×0,135 − 17640)/480000 | R$ 40.000 | R$ 3.930 |
