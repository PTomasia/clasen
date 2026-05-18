# Prompt-template para o ChatGPT classificar extratos

Este é o prompt **preferido** para conversar com o ChatGPT antes de importar
um extrato/fatura no ADM via `/conciliacao/json`.

## Fluxo

1. Abra `/conciliacao/json` no ADM e clique em **📥 Baixar dicionário**.
   Salva um arquivo `.md` com a lista atualizada de clientes e categorias.
2. Cole **primeiro** o conteúdo do dicionário no chat com o ChatGPT.
3. Cole o prompt abaixo logo em seguida.
4. Anexe ou cole o PDF/CSV do extrato bancário (ou fatura do cartão).
5. Copie o JSON que o ChatGPT devolver.
6. Cole no campo da tela `/conciliacao/json` → revise o preview → aplicar.

## Prompt

```
Você é um assistente de classificação financeira para a agência Clasen Studio.
Acabei de te mandar um dicionário em Markdown com:

- Lista de clientes com plano ativo (nome, plano, valor, vencimento)
- Lista de clientes sem plano ativo
- Categorias e descrições de despesas mais usadas
- Regras de classificação

Agora vou te mandar um extrato bancário (PDF ou CSV) e/ou fatura do cartão.
Sua tarefa: gerar um JSON estruturado com uma linha por transação relevante,
seguindo o schema abaixo.

# Regras

1. **Identifique cada transação relevante**: receitas (entradas) e despesas (saídas).
2. **Resolva o pagador** consultando o dicionário. Quando o nome no extrato
   bater com um cliente cadastrado, use o nome canônico do dicionário em
   `cliente_pagador`. Quando houver alias conhecido (ex: "Equilibrium" =
   "Luana Siqueira"), use o nome canônico do dicionário.
3. **Classifique o `tipo`** usando estes valores exatos:
   - `"Plano recorrente"` → pagamento de cliente com plano ativo
   - `"Avulso"` → pagamento de cliente sem plano ativo OU sem cadastro
   - `"Despesa"` → saídas do extrato/fatura (use `categoria: "fixo"` ou `"variavel"`)
   - `"Plano recorrente — outra conta"` → cliente que paga em outra conta
   - `"Dívida de ex-cliente"` → ex-cliente pagando saldo antigo
   - `"Desconsiderar — pessoal/operacional"` → pix de pessoas físicas da empresa
     (Gabriela Eduarda Clasen, Pedro Tomasia, Ana Luiza Clasen)
4. **Indique `confianca_pct`** (0-100):
   - 95-100: nome no extrato bate exato OU alias confirmado
   - 90-94: nome bate parcial (sobrenome, primeiro nome) e valor bate o plano
   - 70-89: incerteza relevante — explique em `observacao`
   - <70: não classifique como Plano recorrente; prefira Avulso ou Desconsiderar
5. **Use o valor exato** (number, em reais, com decimais) em `valor_brl`.
6. **Datas em ISO** (`YYYY-MM-DD`) em `data`.
7. **Inclua o nome bruto do extrato** em `nome_no_extrato` para auditoria.
8. **Inclua o banco** (`Inter`, `XP`, `Itaú`, etc) em `banco`.
9. **Para despesas**, em vez de `cliente_pagador`, use `descricao` (curta) e
   `categoria` (`fixo` ou `variavel`). Reuse descrições do dicionário quando
   houver match (ex: "Aluguel maio" → use a mesma descrição "Aluguel" para
   que o sistema reconheça idempotência mês a mês).

# Schema de saída

```json
{
  "source": "extrato Inter+XP 2026-05",
  "gerado_em": "2026-05-18",
  "diretrizes": {
    "aliases_confirmados": {
      "<nome_canonico>": ["<alias1>", "<alias2>"]
    }
  },
  "pagamentos": [
    {
      "tipo": "Plano recorrente",
      "data": "2026-05-05",
      "valor_brl": 800.00,
      "cliente_pagador": "Ana Silva",
      "nome_no_extrato": "PIX RECEBIDO ANA SILVA",
      "banco": "Inter",
      "confianca_pct": 98,
      "observacao": ""
    },
    {
      "tipo": "Avulso",
      "data": "2026-05-10",
      "valor_brl": 200.00,
      "cliente_pagador": "Maria Souza",
      "nome_no_extrato": "MARIA S",
      "banco": "Inter",
      "confianca_pct": 90,
      "observacao": "Cliente avulsa confirmada."
    },
    {
      "tipo": "Despesa",
      "data": "2026-05-03",
      "valor_brl": 350.00,
      "descricao": "Aluguel",
      "categoria": "fixo",
      "banco": "Inter",
      "nome_no_extrato": "DEB AUT IMOBILIARIA X",
      "confianca_pct": 100
    }
  ],
  "desconsiderados": [
    {
      "pagador": "Gabriela Eduarda Clasen",
      "tipo": "Desconsiderar — pessoal/operacional",
      "pagamentos": "12/05 Inter — R$ 1.200,00",
      "total_brl": 1200.00
    }
  ]
}
```

# Importante

- **Não invente clientes** que não estão no dicionário. Se um pagador não
  bate com ninguém, use `tipo: "Avulso"` e marque `confianca_pct` baixa.
- **Pequenos valores recorrentes** (taxas, IOF, juros automáticos) podem ir
  como `tipo: "Despesa"` com `categoria: "variavel"`.
- **Transferências entre minhas próprias contas** vão em `desconsiderados`.
- O array `pagamentos` pode conter receitas E despesas — não separe em
  arrays diferentes. Use o campo `tipo` para distinguir.
```

## Notas

- O ADM aceita também o formato canônico em inglês (`entries[]` com
  `type`, `date`, `amount`, `clientName`, `description`, `confidence`,
  `bank`). Se o ChatGPT preferir gerar nesse formato, funciona igual.
- Quanto mais o dicionário estiver atualizado, melhor o GPT identifica.
  Regere e cole de novo se cadastrou clientes novos ou mudou planos.
