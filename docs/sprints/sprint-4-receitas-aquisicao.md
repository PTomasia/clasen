# Sprint 4 — Receitas Avulsas + Aquisição & Unit Economics

## Escopo

Dois módulos novos que completam a visão financeira do negócio além da receita recorrente:

1. **Receitas Avulsas** — tudo que entra fora do plano mensal (ex: arte para tráfego, PDF, carrossel solto, produção de conteúdo pontual). Pode estar vinculada a um cliente existente ou ser um job isolado.
2. **Aquisição & Unit Economics** — quanto custa trazer um novo cliente (CAC), quanto cada cliente paga ao longo da vida (LTV), retorno sobre investimento em marketing (ROAS), e taxa de saída (churn).

## Comportamentos esperados

### Receitas Avulsas (`/receitas-avulsas`)

- Listagem de receitas avulsas com filtros: ano/mês, cliente, status de pagamento, produto
- Criar receita avulsa: data, valor, produto, canal (opcional), campanha (opcional), cliente (opcional — pode ser job de prospect sem cadastro), pago sim/não, observação
- Editar e excluir receitas
- Cards no topo: Total do mês atual, Total do ano, Total todos os tempos, Ticket médio
- Total do mês aparece também na tela de cliente (somado ao LTV) — regra: LTV cliente = soma de `plan_payments` + soma de `one_time_revenues` do cliente

### Aquisição & Unit Economics (`/aquisicao`)

Tabela mensal dos últimos 12 meses (+ total) com colunas:

| Mês | Ad Spend | Novos clientes | CAC | Receita no mês | ROAS | Ativos no início | Churned | Churn % |
|-----|----------|----------------|-----|----------------|------|------------------|---------|---------|

- **Ad Spend** — único campo editável (inline, click to edit). Valor padrão = 0
- **Novos clientes** — derivado de planos: cliente cujo primeiro plano (menor `start_date`) está no mês
- **CAC** — `ad_spend / novos_clientes` (null se novos = 0)
- **Receita no mês** — `sum(plan_payments.amount) + sum(one_time_revenues.amount)` com `payment_date` / `date` no mês (pagos)
- **ROAS** — `receita_no_mês / ad_spend` (null se ad_spend = 0)
- **Ativos no início** — clientes com ao menos 1 plano ativo no primeiro dia do mês (`start_date <= 1º` e `end_date IS NULL OR end_date >= 1º`)
- **Churned** — clientes cujo ÚLTIMO plano foi encerrado nesse mês (não teve plano novo iniciado depois)
- **Churn %** — `churned / ativos_no_início * 100`

Card lateral / superior:
- **LTV médio** (todos os clientes com ao menos 1 pagamento): `média(sum(plan_payments) + sum(one_time_revenues))` por cliente
- **LTV:CAC** — `LTV médio / CAC médio (últimos 12m)`
- **Payback (meses)** — `CAC médio / ticket médio mensal`

## Fórmulas e regras

- **Novo cliente em mês M**: primeiro plano do cliente tem `start_date` em M. Não depende de `movement_type` (que pode estar vazio ou ser "Upgrade" erroneamente para primeiro plano)
- **Churn em mês M**: cliente tinha plano(s) ativo(s) em M, e em M+0 seu último plano encerrou, e ele NÃO iniciou novo plano em M ou depois
- **Receita mensal inclui pagamentos com status ∈ {pago}** (pendente/inadimplente NÃO conta)
- **ROAS** é adimensional (múltiplo), exibir como "3.2x"
- **CAC** em R$, exibir BRL

## Decisões técnicas

- Tabela `marketing_monthly` tem campos `new_clients` e `churned_clients` que **NÃO usamos** — são dados derivados. Ficam na tabela por compatibilidade do schema mas são sempre ignorados em favor do cálculo ao vivo.
- Utility `src/lib/utils/unit-economics.ts` — funções puras para CAC, ROAS, churn rate, LTV, payback. Testáveis sem DB.
- Service `src/lib/services/revenues.ts` — CRUD de one_time_revenues.
- Service `src/lib/services/marketing.ts` — upsert de ad_spend por mês (reusa padrão de `settings.ts`).
- Query `src/lib/queries/unit-economics.ts` — agrega 12 meses com métricas.
- `updateRevenue` permite trocar `clientId` (vincular a cliente posteriormente).

## Testes prioritários

```ts
// unit-economics.test.ts
describe("calcularCAC", () => {
  it("ad_spend / novos_clientes", () => {
    expect(calcularCAC(1000, 4)).toBe(250);
  });
  it("retorna null se novos = 0", () => {
    expect(calcularCAC(1000, 0)).toBeNull();
  });
});

describe("calcularROAS", () => {
  it("receita / ad_spend", () => {
    expect(calcularROAS(3200, 1000)).toBe(3.2);
  });
  it("retorna null se ad_spend = 0", () => {
    expect(calcularROAS(1000, 0)).toBeNull();
  });
});

describe("calcularChurnRate", () => {
  it("churned / ativos_inicio", () => {
    expect(calcularChurnRate(2, 50)).toBe(0.04);
  });
  it("retorna null se ativos = 0", () => {
    expect(calcularChurnRate(0, 0)).toBeNull();
  });
});

describe("calcularLTV", () => {
  it("soma pagamentos recorrentes + avulsas do cliente", () => {
    expect(calcularLTV({ planPayments: [100, 200], oneTimeRevenues: [50] })).toBe(350);
  });
});
```

```ts
// revenues.test.ts — service
describe("createRevenue", () => {
  it("cria receita com cliente vinculado");
  it("cria receita sem cliente (prospect)");
  it("rejeita valor <= 0");
});
```

## Não-escopo (fica para depois)

- Integração com plataforma de ads (Meta, Google) para puxar ad_spend automático — operador lança manual por mês
- Atribuição de canal por cliente (qual campanha trouxe cada cliente) — `one_time_revenues` já tem `channel`/`campaign` mas não vamos construir relatório agora
- Segmentação por origem de contato no CAC (CAC por canal) — v2
