# FIX — Aplicação da conciliação idempotente (botão "Aplicar" 2x não duplica o lote)

## Problema observado

Em produção (16/09/2026), Pedro clicou **"Aplicar" duas vezes** em `/conciliacao/json` e o lote inteiro foi re-inserido: 14 pagamentos de plano, 8 receitas avulsas e **2 clientes duplicados** (a decisão "criar cliente" também re-executou). Incidente parecido já havia ocorrido em jul/2026. A limpeza foi manual (Turso).

Por que as defesas atuais não seguraram:

1. **UI**: o botão usa `isPending` de `useTransition`, mas `isPending` só vira `true` no re-render — dois cliques rápidos (antes do re-render) disparam duas requests. Pior: **após o sucesso o botão continua habilitado** com o mesmo preview e as mesmas `decisions` em memória — um segundo clique reenvia tudo.
2. **Servidor**: `applyBulkImportAction` re-resolve o preview (que até detecta `duplicate_warning` na segunda passada), **mas as `decisions` reenviadas têm `include: true`** para cada linha — e em `applyBulkImport` a decisão explícita prevalece sobre o status. A detecção de duplicatas por chave natural é atropelada pela própria decisão. "Criar cliente" não tem detecção nenhuma — re-executa sempre.

## Comportamento esperado

Defesa em duas camadas independentes:

### 1. UI (`json-import-client.tsx`)

- Clique em "Aplicar" trava **sincronamente** (ref guard) — segundo clique no mesmo frame é ignorado antes de qualquer request.
- Enquanto a action roda: botão desabilitado com feedback visual ("Aplicando…").
- **Após aplicação bem-sucedida o botão permanece desabilitado** ("Lote aplicado"). Para aplicar de novo (ex.: resolver linhas que ficaram de fora), Pedro precisa clicar **"Analisar JSON"** de novo — o que re-resolve o preview (agora com as duplicatas sinalizadas) e zera as decisões.
- Erro de aplicação (inclusive "lote já aplicado") aparece em banner próprio ("Não foi possível aplicar"), separado do erro de análise; o botão volta a habilitar para permitir retry legítimo.

### 2. Servidor (`lib/services/bulk-import.ts` + `lib/actions/bulk-import.ts`)

- **Chave de idempotência do lote**: `computeBulkImportKey(rawJson, decisions)` = `bulk_import_applied:` + SHA-256 do payload canônico (`rawJson` trimado + decisions normalizadas e ordenadas por index). Mesmo JSON + mesmas decisões ⇒ mesma chave; qualquer decisão diferente ⇒ chave nova (re-aplicar só as linhas restantes continua possível).
- A action calcula a chave e passa para `applyBulkImport(db, preview, decisions, today, idempotencyKey)`.
- `applyBulkImport` com chave:
  1. **Reivindica a chave ANTES de inserir** — `INSERT` em `agency_settings` (key é PRIMARY KEY ⇒ atômico; fecha a corrida de duas requests simultâneas, ex. duas abas). Se o INSERT falhar porque a chave já existe ⇒ lança `BulkImportAlreadyAppliedError` com mensagem amigável **"Este lote já foi aplicado…"** (com data e nº de linhas quando conhecidos) **sem inserir nada**.
  2. Aplica o lote normalmente.
  3. `applied > 0` ⇒ grava na chave o valor definitivo `{ appliedAt, applied, source }` (auditoria).
  4. `applied === 0` (todas as linhas com erro) ⇒ **remove a chave** — nada foi inserido, retry do mesmo lote deve ser possível após correção.
- Sem `idempotencyKey` (chamadas legadas/testes existentes): comportamento atual inalterado.
- A action devolve `{ ok: false, error: "Este lote já foi aplicado…" }` — a UI mostra o banner amigável.

## Não-objetivos

- Não criar tabela nova nem migration — `agency_settings` (key/value, já existente) guarda as chaves.
- Não mudar a detecção de duplicatas por chave natural (`duplicate_warning`) — continua como segunda linha de defesa no preview.
- Não criar "escape hatch" na UI para re-aplicar lote idêntico (se um dia for preciso, apaga-se a linha em `agency_settings`).
- Não limpar chaves antigas (volume: poucas por mês; valor serve de auditoria).

## Critérios de aceitação (testes)

### `computeBulkImportKey`

1. Determinística: mesmo `rawJson` + mesmas decisions ⇒ mesma chave, com prefixo `bulk_import_applied:`.
2. Ordem das decisions não altera a chave (canonicalização por index).
3. Decisions diferentes (ex.: `include` trocado) ⇒ chave diferente; `rawJson` diferente ⇒ chave diferente.

### `applyBulkImport` com idempotencyKey

4. Primeira aplicação: insere as linhas e registra a chave em `agency_settings` com `{ appliedAt, applied, source }`.
5. Segunda aplicação idêntica (replay do incidente: plan_payment + avulsa + `createClient`, preview re-resolvido): lança `BulkImportAlreadyAppliedError` com mensagem contendo "Este lote já foi aplicado" e **nenhuma** linha nova em `plan_payments` / `one_time_revenues` / `expenses` / `clients`.
6. Mensagem do erro inclui a data (dd/mm/aaaa) e o nº de linhas da aplicação original.
7. Chave já reivindicada com `status: "applying"` (request concorrente em voo) ⇒ segunda chamada bloqueia.
8. Aplicação onde tudo falha (`applied === 0`): chave é liberada; retry com a mesma chave (após corrigir os dados) aplica normalmente.
9. Sem `idempotencyKey`: nada é gravado em `agency_settings` e aplicações repetidas seguem possíveis (compat com chamadas existentes).
10. Chave diferente (decisions diferentes): segunda aplicação passa — fluxo legítimo de "aplicar o resto" preservado.

### UI (`json-import-client`)

11. Duplo clique síncrono em "Aplicar" (antes do re-render) chama `applyBulkImportAction` **uma vez** (ref guard).
12. Enquanto a action está pendente, o botão fica desabilitado com "Aplicando…".
13. Após sucesso, o botão vira "Lote aplicado" e fica desabilitado; novo clique não dispara nova request.
14. "Analisar JSON" de novo re-habilita o fluxo (preview novo, decisões zeradas).
15. `{ ok: false }` da action mostra banner "Não foi possível aplicar" com a mensagem e mantém o botão habilitado para retry.
