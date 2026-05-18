// ─── Dicionário para o ChatGPT ────────────────────────────────────────────────
//
// Gera Markdown com a fonte da verdade do ADM (clientes, planos, categorias,
// descrições de despesas frequentes). Pedro cola esse arquivo no ChatGPT
// ANTES de mandar o PDF/CSV da fatura — assim o GPT identifica corretamente
// pagadores e categoriza despesas usando a nomenclatura do sistema.
//
// Privacidade: NÃO inclui whatsapp, email, city, birthday — apenas nome,
// plano, vencimento. Despesas vêm agregadas (não linha-a-linha).

import { eq, isNull } from "drizzle-orm";
import { format } from "date-fns";
import * as schema from "../db/schema";

export interface DictionaryData {
  generatedAt: string;
  activePlans: Array<{
    clientName: string;
    planType: string;
    planValue: number;
    billingDay: number | null;
    billingDay2: number | null;
  }>;
  inactiveClients: string[];
  expenseCategoriesCounts: { fixo: number; variavel: number };
  topExpenseDescriptions: Array<{ description: string; uses: number }>;
}

export async function getDictionaryData(
  db: any,
  today: string = format(new Date(), "yyyy-MM-dd")
): Promise<DictionaryData> {
  // Clientes ativos: com plano sem end_date
  const activeRows = (await db
    .select({
      clientId: schema.subscriptionPlans.clientId,
      clientName: schema.clients.name,
      planType: schema.subscriptionPlans.planType,
      planValue: schema.subscriptionPlans.planValue,
      billingDay: schema.subscriptionPlans.billingCycleDays,
      billingDay2: schema.subscriptionPlans.billingCycleDays2,
    })
    .from(schema.subscriptionPlans)
    .innerJoin(schema.clients, eq(schema.subscriptionPlans.clientId, schema.clients.id))
    .where(isNull(schema.subscriptionPlans.endDate))
    .all()) as Array<{
    clientId: number;
    clientName: string;
    planType: string;
    planValue: number;
    billingDay: number | null;
    billingDay2: number | null;
  }>;

  // Ordenar por nome
  activeRows.sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR"));

  const activeClientIds = new Set(activeRows.map((r) => r.clientId));

  // Clientes sem plano ativo
  const allClients = (await db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .all()) as Array<{ id: number; name: string }>;

  const inactiveClients = allClients
    .filter((c) => !activeClientIds.has(c.id))
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  // Categorias de despesa
  const expenses = (await db.select({ category: schema.expenses.category, description: schema.expenses.description }).from(schema.expenses).all()) as Array<{
    category: string;
    description: string;
  }>;

  let fixoCount = 0;
  let variavelCount = 0;
  const descCounts = new Map<string, number>();
  for (const e of expenses) {
    if (e.category === "fixo") fixoCount++;
    else variavelCount++;
    const key = e.description.trim();
    descCounts.set(key, (descCounts.get(key) ?? 0) + 1);
  }
  const topExpenseDescriptions = Array.from(descCounts.entries())
    .map(([description, uses]) => ({ description, uses }))
    .sort((a, b) => b.uses - a.uses || a.description.localeCompare(b.description, "pt-BR"))
    .slice(0, 20);

  return {
    generatedAt: today,
    activePlans: activeRows.map((r) => ({
      clientName: r.clientName,
      planType: r.planType,
      planValue: r.planValue,
      billingDay: r.billingDay,
      billingDay2: r.billingDay2,
    })),
    inactiveClients,
    expenseCategoriesCounts: { fixo: fixoCount, variavel: variavelCount },
    topExpenseDescriptions,
  };
}

// ─── Formata para Markdown ────────────────────────────────────────────────────

export function formatDictionaryMarkdown(data: DictionaryData): string {
  const lines: string[] = [];

  lines.push(`# Dicionário ADM Clasen — gerado em ${data.generatedAt}`);
  lines.push("");
  lines.push("## Como usar");
  lines.push("");
  lines.push("Cole este arquivo no início da conversa com o ChatGPT, ANTES de");
  lines.push("mandar o PDF/CSV da fatura. O GPT vai usar essa lista como fonte");
  lines.push("da verdade para identificar pagadores e categorizar despesas.");
  lines.push("");

  // Clientes ativos
  lines.push(`## Clientes com plano ativo (${data.activePlans.length})`);
  lines.push("");
  if (data.activePlans.length === 0) {
    lines.push("_Nenhum cliente com plano ativo._");
  } else {
    lines.push("| Nome cadastrado | Plano | Valor | Vence dia |");
    lines.push("|---|---|---|---|");
    for (const p of data.activePlans) {
      const valor = `R$ ${p.planValue.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}`;
      const venc =
        p.billingDay && p.billingDay2
          ? `${p.billingDay} e ${p.billingDay2}`
          : p.billingDay
          ? String(p.billingDay)
          : "—";
      lines.push(`| ${p.clientName} | ${p.planType} | ${valor} | ${venc} |`);
    }
  }
  lines.push("");

  // Clientes inativos
  lines.push(`## Clientes sem plano ativo (${data.inactiveClients.length})`);
  lines.push("");
  lines.push("> Podem aparecer pagando saldos antigos ou avulsos.");
  lines.push("");
  if (data.inactiveClients.length === 0) {
    lines.push("_Nenhum cliente inativo._");
  } else {
    for (const name of data.inactiveClients) {
      lines.push(`- ${name}`);
    }
  }
  lines.push("");

  // Categorias de despesa
  lines.push("## Categorias de despesa");
  lines.push("");
  lines.push(`- **fixo** — despesas recorrentes mensais (${data.expenseCategoriesCounts.fixo} cadastradas)`);
  lines.push(`- **variavel** — despesas pontuais ou que mudam de valor (${data.expenseCategoriesCounts.variavel} cadastradas)`);
  lines.push("");

  // Top descrições
  lines.push(`## Descrições de despesa mais usadas (top ${data.topExpenseDescriptions.length})`);
  lines.push("");
  lines.push("Reuse essas descrições para que o sistema reconheça idempotência:");
  lines.push("");
  if (data.topExpenseDescriptions.length === 0) {
    lines.push("_Nenhuma despesa cadastrada ainda._");
  } else {
    for (const d of data.topExpenseDescriptions) {
      lines.push(`- ${d.description} (${d.uses}×)`);
    }
  }
  lines.push("");

  // Regras
  lines.push("## Regras de classificação (use esses `tipo` no JSON de saída)");
  lines.push("");
  lines.push("- Pagamentos de **clientes ativos** → `tipo: \"Plano recorrente\"`");
  lines.push("- Pagamentos de clientes **sem plano ativo** → `tipo: \"Avulso\"`");
  lines.push("- Saldos de ex-cliente → `tipo: \"Dívida de ex-cliente\"` (não importa por enquanto)");
  lines.push("- Pix de pessoas físicas da empresa (Gabriela Eduarda Clasen, Pedro Tomasia, Ana Luiza Clasen) → `tipo: \"Desconsiderar — pessoal/operacional\"`");
  lines.push("- **Saídas** do extrato → `tipo: \"Despesa\"` com `categoria: \"fixo\"` ou `\"variavel\"`");
  lines.push("");

  // Formato JSON esperado
  lines.push("## Formato JSON esperado");
  lines.push("");
  lines.push("Retorne um objeto com `source` + `pagamentos[]` (ou `entries[]`). Exemplo:");
  lines.push("");
  lines.push("```json");
  lines.push("{");
  lines.push("  \"source\": \"extrato Inter 2026-05\",");
  lines.push("  \"pagamentos\": [");
  lines.push("    {");
  lines.push("      \"tipo\": \"Plano recorrente\",");
  lines.push("      \"data\": \"2026-05-05\",");
  lines.push("      \"valor_brl\": 800.00,");
  lines.push("      \"cliente_pagador\": \"Ana Silva\",");
  lines.push("      \"nome_no_extrato\": \"PIX RECEBIDO ANA SILVA\",");
  lines.push("      \"banco\": \"Inter\",");
  lines.push("      \"confianca_pct\": 98");
  lines.push("    },");
  lines.push("    {");
  lines.push("      \"tipo\": \"Despesa\",");
  lines.push("      \"data\": \"2026-05-03\",");
  lines.push("      \"valor_brl\": 350.00,");
  lines.push("      \"descricao\": \"Aluguel maio\",");
  lines.push("      \"categoria\": \"fixo\"");
  lines.push("    }");
  lines.push("  ]");
  lines.push("}");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

export async function buildDictionary(db: any, today?: string): Promise<string> {
  const data = await getDictionaryData(db, today);
  return formatDictionaryMarkdown(data);
}
