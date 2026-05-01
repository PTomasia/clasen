# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server (port 3000)
npm run test         # Run all tests (Vitest)
npm run test:watch   # Vitest watch mode
npm run test:e2e     # Playwright E2E tests
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run format       # Prettier

# Run a single test file
npm run test -- plans.test.ts

# Run tests matching a pattern
npm run test -- --grep "createPlan"

# Database
npm run db:generate  # Generate Drizzle migrations from schema changes
npm run db:push      # Push migrations to Turso
npm run db:studio    # Open Drizzle Studio
```

## Architecture

**Stack**: Next.js App Router (no API routes — Server Actions only) + Turso (SQLite cloud) + Drizzle ORM + Tailwind CSS v4 + shadcn/ui.

## Auth (Basic Auth via middleware)

A app está protegida por HTTP Basic Auth no `src/middleware.ts`. Credenciais são hardcoded no código — env vars do Vercel não chegavam ao runtime do middleware nesse projeto (descoberto via debug em maio/2026; histórico nos comentários do middleware).

### Como trocar a senha

1. Na pasta `clasen-adm/`:
   ```
   node scripts/generate-auth-hash.mjs
   ```
2. Digite a nova senha quando pedir (vai aparecer na tela).
3. O script imprime duas linhas:
   - `const AUTH_SALT_HEX = "..."`
   - `const AUTH_HASH_HEX = "..."`
4. Cole substituindo as constantes correspondentes em `src/middleware.ts`.
5. Limpe o terminal (`cls` no Windows) pra senha não ficar em scrollback.
6. Commit + push → Vercel deploya automático.

A senha nunca é versionada — só o hash PBKDF2-SHA256 (100k iterations) e o salt random ficam no código. Senha forte (24 chars random) + PBKDF2 = inviável de quebrar mesmo com repo público.

### Defesa contra brute force

**Sem rate limiting explícito** — testamos in-memory Map mas não funciona em serverless multi-instance do Vercel (cada instância tem seu próprio Map, atacante "pula" entre instâncias).

A defesa real vem de duas camadas combinadas:

1. **PBKDF2 100k iterations**: cada verificação de senha custa ~100ms de CPU server-side. Naturalmente limita atacante a ~10 tentativas/seg/instância.

2. **Senha forte (24 chars random, ~144 bits entropia)**: gerada via `crypto.randomBytes(18).toString('base64')`. Mesmo se atacante paralelizar em 1000 instâncias do Vercel (1 milhão tentativas/seg total), brute force levaria ~10^28 segundos (idade do universo é ~10^17 segundos).

Conclusão prática: senha é matematicamente inquebrável. Se um dia a app virar multiusuário, aí sim implementar rate limit via Upstash KV (compartilhado entre instâncias).

**Layer pattern** (strict, no skipping layers):
```
components (thin UI) → lib/actions/ (validation) → lib/services/ (business logic) → lib/queries/ (aggregation/reports) → lib/db/schema.ts
```

- `lib/actions/` — Server Actions, input validation, thin wrappers over services
- `lib/services/` — All writes and domain operations (create, update, delete, pay)
- `lib/queries/` — Read aggregations: `dashboard.ts`, `unit-economics.ts`, `profit-and-loss.ts`
- `lib/utils/` — Pure calculation functions ($/post, tenure, mediana, status derivation)
- `lib/constants.ts` — Shared enums: `PLAN_TYPES`, `ORIGINS`, `CATEGORIES`, etc.

## Database Schema

7 tables in `src/lib/db/schema.ts`:
- `clients` — profiles; **status is derived** (active = has plan with `end_date IS NULL`)
- `subscription_plans` — main recurring contracts; `billing_cycle_days` = due day of month (e.g. `10` = day 10), NOT an interval
- `plan_payments` — payment history per plan/month (enables MRR tracking)
- `agency_settings` — key/value global config
- `one_time_revenues` — one-off project revenue (nullable `clientId`)
- `marketing_monthly` — monthly acquisition metrics (CAC, ROAS) keyed by `YYYY-MM`
- `expenses` — monthly costs, `fixo` or `variavel` category

Migrations in `src/lib/db/migrations/`. After schema changes run `db:generate` then `db:push`.

## Testing

TDD is mandatory — write spec → write tests → write code. All business logic lives in `lib/services/` or `lib/utils/` and must have unit tests.

Test files live next to their source: `lib/services/__tests__/`, `lib/queries/__tests__/`, `lib/utils/__tests__/`.

Tests use an **in-memory SQLite database** (`better-sqlite3` with `:memory:`) with manually created tables — migrations are NOT loaded. Each test file defines its own `createTestDb()` helper.

CI runs: typecheck → lint → vitest → build.

## Business Logic Formulas

Critical formulas validated in `docs/formulas.md`:

- **$/post** = `monthly_value / (carrossels + reels + estaticos × 0.5)` — estaticos count half
- **Tenure (permanência)** = `floor(months between start_date and today/end_date)`
- **Payment status**: derived from `last_payment_date` vs `next_payment_date` vs today
- **Client active**: has at least one plan with `end_date IS NULL`
- **MRR**: sum of `plan_value` for all active plans; tracks upgrades/downgrades via `movement_type`

Full acquisition formulas (CAC, LTV, ROAS, churn) are in `docs/formulas.md`.

## Sprint Roadmap

Full specs in `docs/sprints/`. Status as of 2026-04-22:

| Sprint | Módulo | Status |
|--------|--------|--------|
| 1 | Planos (cadastro, pagamentos, $/post, ranking) | ✅ concluído |
| 2 | Clientes (lista, permanência, métricas) | ✅ concluído |
| 3 | Dashboard (KPIs, MRR, alertas pagamento) | ✅ concluído |
| A–E | Melhorias incrementais (histórico pgtos, ajustes) | ✅ concluído |
| 4 | Receitas Avulsas + Aquisição & Unit Economics (CAC, LTV, ROAS, churn) | 🔜 próximo |
| 5 | Despesas (P&L, resultado líquido mensal) | 🔜 planejado |

## Domain Language

UI, docs, variables, and comments are in **Portuguese**. Key terms:
- plano = subscription plan
- cliente = client (psychologists/therapists)
- receita = revenue; despesa = expense
- permanência = tenure; inadimplente = overdue
- avulso = one-time/standalone
- vencimento = due date
