import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import * as schema from "../lib/db/schema";
import {
  createExpense,
  createExpenseInstallments,
  type CreateExpenseInput,
} from "../lib/services/expenses";

/**
 * Seed das despesas planejadas pelo Pedro (lista enviada em 2026-04-29).
 *
 * Princípios:
 *   - Idempotente: antes de inserir uma despesa, checa se já existe
 *     uma com mesmo description + month. Pula se existir.
 *   - Categoria literal vai para `notes` (schema só aceita fixo|variavel).
 *   - Meses passados (jan-mar/26) marcados como pagos. Abril ainda em
 *     curso → também pago (já foi gasto). Maio em diante → pendente.
 *   - Parcelados usam createExpenseInstallments (groupId compartilhado).
 *   - Recorrentes: a entrada do PRIMEIRO mês fica com isRecurring=true
 *     e recurringUntil quando aplicável; demais meses já criados são
 *     entradas independentes (isRecurring=false) representando o
 *     histórico real de pagamentos.
 *
 * Uso:
 *   - Dry-run (default):   npx tsx src/scripts/seed-despesas-2026.ts
 *   - Aplicar no DB real:  npx tsx src/scripts/seed-despesas-2026.ts --apply
 */

const APPLY = process.argv.includes("--apply");

const PAID_MONTHS = new Set([
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
]);

interface PlannedSingle {
  kind: "single";
  month: string; // YYYY-MM
  description: string;
  categoria: "fixo" | "variavel";
  amount: number;
  isRecurring?: boolean;
  recurringUntil?: string | null;
  notesExtra: string;
}

interface PlannedInstallments {
  kind: "installments";
  startMonth: string;
  description: string;
  categoria: "fixo" | "variavel";
  amount: number;
  installmentsTotal: number;
  notesExtra: string;
}

type Planned = PlannedSingle | PlannedInstallments;

// ─── Plano de inserções ───────────────────────────────────────────────────────

const PLAN: Planned[] = [
  // ── Bibo (Designer) ──
  // Jan-Mar/26: R$ 1.700; Abr/26: R$ 2.000 (transição); Mai/26+: R$ 2.500
  {
    kind: "single",
    month: "2026-01",
    description: "Bibo",
    categoria: "fixo",
    amount: 1700,
    isRecurring: true,
    recurringUntil: "2026-03",
    notesExtra: "Categoria: Design. Designer da agência; valor de janeiro a março.",
  },
  {
    kind: "single",
    month: "2026-02",
    description: "Bibo",
    categoria: "fixo",
    amount: 1700,
    notesExtra: "Categoria: Design. Designer da agência (continuação)",
  },
  {
    kind: "single",
    month: "2026-03",
    description: "Bibo",
    categoria: "fixo",
    amount: 1700,
    notesExtra: "Categoria: Design. Designer da agência (último mês desta faixa)",
  },
  {
    kind: "single",
    month: "2026-04",
    description: "Bibo",
    categoria: "fixo",
    amount: 2000,
    notesExtra: "Categoria: Design. Valor reajustado em abril (transição)",
  },
  {
    kind: "single",
    month: "2026-05",
    description: "Bibo",
    categoria: "fixo",
    amount: 2500,
    isRecurring: true,
    recurringUntil: null,
    notesExtra: "Categoria: Design. Designer da agência; valor de maio em diante",
  },

  // ── Amanda (Videomaker) ──
  // Jan-Abr/26: R$ 600
  {
    kind: "single",
    month: "2026-01",
    description: "Amanda",
    categoria: "fixo",
    amount: 600,
    isRecurring: true,
    recurringUntil: "2026-04",
    notesExtra: "Categoria: Vídeo. Videomaker; média mensal de janeiro a abril.",
  },
  {
    kind: "single",
    month: "2026-02",
    description: "Amanda",
    categoria: "fixo",
    amount: 600,
    notesExtra: "Categoria: Vídeo. Videomaker (continuação)",
  },
  {
    kind: "single",
    month: "2026-03",
    description: "Amanda",
    categoria: "fixo",
    amount: 600,
    notesExtra: "Categoria: Vídeo. Videomaker (continuação)",
  },
  {
    kind: "single",
    month: "2026-04",
    description: "Amanda",
    categoria: "fixo",
    amount: 600,
    notesExtra: "Categoria: Vídeo. Videomaker (último mês desta faixa)",
  },

  // ── Photoshop ──
  // Jan/26+ recorrente sem fim
  {
    kind: "single",
    month: "2026-01",
    description: "Photoshop",
    categoria: "fixo",
    amount: 95,
    isRecurring: true,
    recurringUntil: null,
    notesExtra: "Categoria: Assinatura/Software. Recorrente mensal.",
  },
  {
    kind: "single",
    month: "2026-02",
    description: "Photoshop",
    categoria: "fixo",
    amount: 95,
    notesExtra: "Categoria: Assinatura/Software",
  },
  {
    kind: "single",
    month: "2026-03",
    description: "Photoshop",
    categoria: "fixo",
    amount: 95,
    notesExtra: "Categoria: Assinatura/Software",
  },
  {
    kind: "single",
    month: "2026-04",
    description: "Photoshop",
    categoria: "fixo",
    amount: 95,
    notesExtra: "Categoria: Assinatura/Software",
  },

  // ── ChatGPT ──
  // Jan/26+ recorrente sem fim
  {
    kind: "single",
    month: "2026-01",
    description: "ChatGPT",
    categoria: "fixo",
    amount: 100,
    isRecurring: true,
    recurringUntil: null,
    notesExtra: "Categoria: Assinatura/Software. Recorrente desde janeiro.",
  },
  {
    kind: "single",
    month: "2026-02",
    description: "ChatGPT",
    categoria: "fixo",
    amount: 100,
    notesExtra: "Categoria: Assinatura/Software",
  },
  {
    kind: "single",
    month: "2026-03",
    description: "ChatGPT",
    categoria: "fixo",
    amount: 100,
    notesExtra: "Categoria: Assinatura/Software",
  },
  {
    kind: "single",
    month: "2026-04",
    description: "ChatGPT",
    categoria: "fixo",
    amount: 100,
    notesExtra: "Categoria: Assinatura/Software",
  },

  // ── Capcut ──
  // Mar/26+ recorrente sem fim
  {
    kind: "single",
    month: "2026-03",
    description: "Capcut",
    categoria: "fixo",
    amount: 65,
    isRecurring: true,
    recurringUntil: null,
    notesExtra: "Categoria: Assinatura/Software. Recorrente a partir de março.",
  },
  {
    kind: "single",
    month: "2026-04",
    description: "Capcut",
    categoria: "fixo",
    amount: 65,
    notesExtra: "Categoria: Assinatura/Software",
  },

  // ── Tráfego Ads (gasto único) ──
  {
    kind: "single",
    month: "2026-03",
    description: "Tráfego Ads",
    categoria: "variavel",
    amount: 300,
    isRecurring: false,
    notesExtra: "Categoria: Marketing/Ads. Gasto único em março.",
  },

  // ── Claude Code ──
  // Mar/26: R$ 100 único; Abr/26+: R$ 550 recorrente
  {
    kind: "single",
    month: "2026-03",
    description: "Claude Code",
    categoria: "fixo",
    amount: 100,
    isRecurring: false,
    notesExtra: "Categoria: Assinatura/Software. Valor inicial em março.",
  },
  {
    kind: "single",
    month: "2026-04",
    description: "Claude Code",
    categoria: "fixo",
    amount: 550,
    isRecurring: true,
    recurringUntil: null,
    notesExtra: "Categoria: Assinatura/Software. Valor recorrente a partir de abril.",
  },

  // ── Parcelados (12x) ──
  {
    kind: "installments",
    startMonth: "2026-04",
    description: "Computador",
    categoria: "fixo",
    amount: 300,
    installmentsTotal: 12,
    notesExtra: "Categoria: Equipamento. Parcela 1/12 a partir de abril/26 até março/27.",
  },
  {
    kind: "installments",
    startMonth: "2026-04",
    description: "Curso Copywriter",
    categoria: "fixo",
    amount: 300,
    installmentsTotal: 12,
    notesExtra: "Categoria: Educação/Curso. Parcela 1/12 a partir de abril/26 até março/27.",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function existsExpense(description: string, month: string): Promise<boolean> {
  const found = await (db as any)
    .select({ id: schema.expenses.id })
    .from(schema.expenses)
    .where(
      and(
        eq(schema.expenses.description, description),
        eq(schema.expenses.month, month)
      )
    )
    .get();
  return !!found;
}

function shouldBePaid(month: string): boolean {
  return PAID_MONTHS.has(month);
}

function summarize(item: Planned): string {
  if (item.kind === "single") {
    return `${item.month} | ${item.description.padEnd(20)} | ${item.categoria.padEnd(8)} | R$ ${item.amount.toFixed(2).padStart(9)} | ${shouldBePaid(item.month) ? "PAGO" : "pend"} | ${item.isRecurring ? "↻" : " "} ${item.recurringUntil ? `(até ${item.recurringUntil})` : ""}`;
  }
  return `${item.startMonth} | ${item.description.padEnd(20)} | parc 1/${item.installmentsTotal.toString().padStart(2)} | R$ ${item.amount.toFixed(2).padStart(9)} (×${item.installmentsTotal} = R$ ${(item.amount * item.installmentsTotal).toFixed(2)})`;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n=== seed-despesas-2026 — ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

  let totalToCreate = 0;
  let totalSkipped = 0;
  let totalAmountPaid = 0;
  let totalAmountPending = 0;

  for (const item of PLAN) {
    console.log(summarize(item));

    if (item.kind === "single") {
      const exists = await existsExpense(item.description, item.month);
      if (exists) {
        console.log(`   → SKIP: já existe ${item.description} em ${item.month}`);
        totalSkipped++;
        continue;
      }
      totalToCreate++;
      if (shouldBePaid(item.month)) totalAmountPaid += item.amount;
      else totalAmountPending += item.amount;

      if (APPLY) {
        const input: CreateExpenseInput = {
          month: item.month,
          description: item.description,
          category: item.categoria,
          amount: item.amount,
          isPaid: shouldBePaid(item.month),
          isRecurring: item.isRecurring ?? false,
          recurringUntil: item.recurringUntil ?? null,
          notes: item.notesExtra,
        };
        await createExpense(db as any, input);
        console.log(`   ✓ inserido`);
      }
    } else {
      // installments — checa apenas a 1ª parcela (proxy de idempotência)
      const exists = await existsExpense(item.description, item.startMonth);
      if (exists) {
        console.log(`   → SKIP: já existe ${item.description} em ${item.startMonth}`);
        totalSkipped++;
        continue;
      }
      totalToCreate += item.installmentsTotal;
      // Apenas a 1ª parcela cai em mês "pago" (abr/26 — em curso, marcamos pendente)
      // Todas pendentes
      totalAmountPending += item.amount * item.installmentsTotal;

      if (APPLY) {
        await createExpenseInstallments(db as any, {
          month: item.startMonth,
          description: item.description,
          category: item.categoria,
          amount: item.amount,
          installmentsTotal: item.installmentsTotal,
          notes: item.notesExtra,
        });
        console.log(`   ✓ ${item.installmentsTotal} parcelas inseridas`);
      }
    }
  }

  console.log(`\n────────────────────────────────────────`);
  console.log(`Para criar:    ${totalToCreate} entradas`);
  console.log(`Pulado:        ${totalSkipped} (já existiam)`);
  console.log(`Total pago:    R$ ${totalAmountPaid.toFixed(2)}`);
  console.log(`Total pendente: R$ ${totalAmountPending.toFixed(2)}`);
  console.log(
    `\n${APPLY ? "✅ Aplicado no DB." : "⚠️  Dry-run. Re-execute com --apply para gravar."}`
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("ERRO:", err);
    process.exit(1);
  });
