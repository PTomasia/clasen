# Arquitetura — Clasen ADM

## Stack

| Camada | Tecnologia | Motivo |
|--------|------------|--------|
| Framework | Next.js 16 (App Router) | Full-stack, Server Actions, deploy na Vercel |
| Banco | Turso (SQLite cloud) + `@libsql/client` | SQLite-compatível, plano gratuito, funciona serverless |
| ORM | Drizzle ORM | TypeScript-first, SQL transparente, migrations simples |
| UI | Tailwind CSS + shadcn/ui | Componentes copiados (customizáveis), identidade visual Clasen |
| Testes | Vitest + React Testing Library + Playwright | Unit, integração, E2E |
| CI/CD | GitHub Actions → Vercel | Deploy automático a cada push |

## Infraestrutura

```
Cloudflare (DNS)  →  Vercel (App)  →  Turso (Banco)
adm.site.com.br      Next.js           SQLite cloud
```

## Padrões de Código

### Service Layer
Toda lógica de negócio vive em `lib/services/`. Server Actions são finos (validam + chamam service). Componentes são finos (exibem + disparam actions).

### Dados
- Moeda: `REAL` no banco, formatado com `Intl.NumberFormat` na exibição
- Datas: ISO 8601 (`'2024-01-15'`) como `TEXT` no SQLite
- IDs: auto-increment `INTEGER`
- Campos calculados ($/post, tenure, status) NUNCA armazenados — sempre calculados em query ou service

### Testes (TDD)
Spec → Testes (red) → Implementação (green) → Refactoring
