import "dotenv/config";
import { createClient } from "@libsql/client";
import { addMonths, format, getDaysInMonth, parseISO } from "date-fns";
import { pathToFileURL } from "node:url";

const APPLY = process.argv.includes("--apply");

export const PAYMENT_TARGETS = [
  { clientName: "Bárbara Brandao", paidUntil: "13/03/2026", billingDay: 30, amount: 400 },
  { clientName: "Beatriz Viçoza", paidUntil: "13/03/2026", billingDay: 15, amount: 350 },
  { clientName: "Bia Gracher", paidUntil: "11/03/2026", billingDay: 30, amount: 270 },
  { clientName: "Borba Gato", paidUntil: "11/03/2026", billingDay: 10, amount: 900, inactiveOnly: true, allowAmountMismatch: true },
  { clientName: "Dr Fernando", paidUntil: "02/03/2026", billingDay: 15, amount: 380 },
  { clientName: "Espaço Essenzia", paidUntil: "17/03/2026", billingDay: 15, amount: 600 },
  { clientName: "Fernanda Muniz", paidUntil: "16/03/2026", billingDay: 15, amount: 1005 },
  { clientName: "Gabriela Alves", paidUntil: "16/03/2026", billingDay: 15, amount: 600 },
  { clientName: "Gabriele Rousseau", paidUntil: "15/03/2026", billingDay: 15, amount: 395 },
  { clientName: "Isabela Claro", paidUntil: "10/03/2026", billingDay: 15, amount: 790 },
  { clientName: "Isabela Godoy", paidUntil: "04/03/2026", billingDay: 5, amount: 500 },
  { clientName: "Isabelle Taborda", paidUntil: "09/03/2026", billingDay: 15, amount: 260 },
  { clientName: "Jessica Ortega", paidUntil: "09/03/2026", billingDay: 15, amount: 380 },
  { clientName: "Luana Siqueira", paidUntil: "02/02/2026", billingDay: 30, amount: 790 },
  { clientName: "Maju Oliveira", paidUntil: "09/03/2026", billingDay: null, amount: 217 },
  { clientName: "Michelle Menezes", paidUntil: "13/01/2026", billingDay: null, amount: 350 },
  { clientName: "Natalia Veber", paidUntil: "07/03/2026", billingDay: 10, amount: 590 },
  { clientName: "Paula Lopes", paidUntil: "24/03/2026", billingDay: null, amount: 790 },
  { clientName: "Paulo Gomes", paidUntil: "25/03/2026", billingDay: 30, amount: 480 },
  { clientName: "Pedagobia Macedo", paidUntil: "26/03/2026", billingDay: 30, amount: 670 },
  { clientName: "Priscila de Souza", paidUntil: "10/03/2026", billingDay: 30, amount: 265 },
  { clientName: "Rebeca", paidUntil: "10/03/2026", billingDay: 30, amount: 1000 },
  { clientName: "Rhael", paidUntil: "03/03/2026", billingDay: 15, amount: 530 },
  { clientName: "Thauane da Cunha", paidUntil: "16/03/2026", billingDay: null, amount: 350 },
];

export function normalizeName(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function toIsoDate(brDate) {
  const [day, month, year] = brDate.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function monthKey(isoDate) {
  return isoDate.slice(0, 7);
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

function effectiveBillingDay(plan, target) {
  return target.billingDay ?? plan.billing_cycle_days ?? Number(toIsoDate(target.paidUntil).slice(8, 10));
}

function paymentDateForMonth(monthDate, billingDay, paidUntilIso) {
  const month = format(monthDate, "yyyy-MM");
  if (month === monthKey(paidUntilIso)) return paidUntilIso;

  const maxDay = getDaysInMonth(monthDate);
  const actualDay = Math.min(billingDay, maxDay);
  return `${month}-${String(actualDay).padStart(2, "0")}`;
}

export function calcularProximoVencimento(fromDate, billingDay1, billingDay2) {
  const base = parseISO(fromDate);
  const fromDay = base.getDate();

  if (billingDay2) {
    const [earlier, later] =
      billingDay1 < billingDay2 ? [billingDay1, billingDay2] : [billingDay2, billingDay1];

    if (fromDay < later) {
      const maxDay = getDaysInMonth(base);
      const actualDay = Math.min(later, maxDay);
      return format(new Date(base.getFullYear(), base.getMonth(), actualDay), "yyyy-MM-dd");
    }

    const nextMonth = addMonths(base, 1);
    const maxDay = getDaysInMonth(nextMonth);
    const actualDay = Math.min(earlier, maxDay);
    return format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), actualDay), "yyyy-MM-dd");
  }

  const nextMonth = addMonths(base, 1);
  const maxDay = getDaysInMonth(nextMonth);
  const actualDay = Math.min(billingDay1, maxDay);
  return format(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), actualDay), "yyyy-MM-dd");
}

export function resolvePlan(plans, target) {
  const warnings = [];
  let candidates = target.inactiveOnly
    ? plans.filter((plan) => plan.status !== "ativo" || Boolean(plan.end_date))
    : [...plans];

  if (candidates.length === 0) {
    return { status: "blocked", reason: "nenhum plano compatível com o status esperado", warnings };
  }

  const sameAmount = candidates.filter((plan) => cents(plan.plan_value) === cents(target.amount));
  if (sameAmount.length > 0) candidates = sameAmount;
  else if (target.allowAmountMismatch) {
    warnings.push(`valor do plano diverge do informado (${target.amount})`);
  }
  else {
    return {
      status: "blocked",
      reason: `nenhum plano com valor informado (${target.amount})`,
      warnings,
    };
  }

  if (target.billingDay != null) {
    const sameBilling = candidates.filter((plan) => Number(plan.billing_cycle_days) === target.billingDay);
    if (sameBilling.length > 0) candidates = sameBilling;
    else warnings.push(`vencimento do plano diverge do informado (${target.billingDay})`);
  }

  const activeCandidates = candidates.filter((plan) => plan.status === "ativo" && !plan.end_date);
  if (!target.inactiveOnly && activeCandidates.length === 1) candidates = activeCandidates;

  if (candidates.length !== 1) {
    return {
      status: "blocked",
      reason: `seleção ambígua (${candidates.length} planos candidatos)`,
      warnings,
    };
  }

  if (!target.inactiveOnly && (candidates[0].status !== "ativo" || candidates[0].end_date)) {
    warnings.push("plano selecionado está inativo/cancelado");
  }

  return { status: "ok", plan: candidates[0], warnings };
}

export function buildPaymentBackfill(plan, target, existingPayments) {
  const paidUntilIso = toIsoDate(target.paidUntil);
  const billingDay = effectiveBillingDay(plan, target);
  const existingMonths = new Set(existingPayments.map((payment) => monthKey(payment.payment_date)));
  const payments = [];

  let cursor = addMonths(parseISO(plan.start_date), 1);
  const stopMonth = monthKey(paidUntilIso);

  while (format(cursor, "yyyy-MM") <= stopMonth) {
    const currentMonth = format(cursor, "yyyy-MM");
    if (!existingMonths.has(currentMonth)) {
      payments.push({
        planId: plan.id,
        clientId: plan.client_id,
        month: currentMonth,
        paymentDate: paymentDateForMonth(cursor, billingDay, paidUntilIso),
        amount: target.amount,
        status: "pago",
        skipped: false,
        notes: "Backfill histórico de pagamentos",
      });
    }
    cursor = addMonths(cursor, 1);
  }

  const nextPaymentDate = calcularProximoVencimento(paidUntilIso, billingDay, plan.billing_cycle_days_2);

  return {
    payments,
    paidUntilIso,
    nextPaymentDate,
    billingDay,
  };
}

function shouldUpdatePlanDates(plan, backfill) {
  return !plan.last_payment_date || plan.last_payment_date <= backfill.paidUntilIso;
}

async function loadPlansByTarget(client) {
  const names = PAYMENT_TARGETS.map((target) => normalizeName(target.clientName));
  const result = await client.execute({
    sql: `SELECT c.name, sp.*
          FROM subscription_plans sp
          JOIN clients c ON c.id = sp.client_id
          ORDER BY c.name, sp.id`,
    args: [],
  });

  const byName = new Map(names.map((name) => [name, []]));
  for (const row of result.rows) {
    const normalized = normalizeName(String(row.name));
    if (byName.has(normalized)) byName.get(normalized).push(row);
  }
  return byName;
}

async function loadPayments(client, planId) {
  const result = await client.execute({
    sql: `SELECT id, payment_date, amount, skipped
          FROM plan_payments
          WHERE plan_id = ?
          ORDER BY payment_date`,
    args: [planId],
  });
  return result.rows;
}

export async function createBackfillReport(client) {
  const plansByName = await loadPlansByTarget(client);
  const rows = [];
  const blocked = [];

  for (const target of PAYMENT_TARGETS) {
    const normalized = normalizeName(target.clientName);
    const plans = plansByName.get(normalized) ?? [];

    if (plans.length === 0) {
      blocked.push({ cliente: target.clientName, motivo: "cliente/plano não encontrado" });
      continue;
    }

    const resolved = resolvePlan(plans, target);
    if (resolved.status !== "ok") {
      blocked.push({
        cliente: target.clientName,
        motivo: resolved.reason,
        avisos: resolved.warnings.join("; "),
      });
      continue;
    }

    const existingPayments = await loadPayments(client, resolved.plan.id);
    const backfill = buildPaymentBackfill(resolved.plan, target, existingPayments);
    const inactive = resolved.plan.status !== "ativo" || Boolean(resolved.plan.end_date);
    const updatePlanDates = shouldUpdatePlanDates(resolved.plan, backfill);

    rows.push({
      target,
      plan: resolved.plan,
      backfill,
      updatePlanDates,
      warnings: resolved.warnings,
      summary: {
        cliente: target.clientName,
        plan_id: resolved.plan.id,
        status_plano: resolved.plan.status,
        inicio: resolved.plan.start_date,
        pago_ate: backfill.paidUntilIso,
        pagamentos_existentes: existingPayments.length,
        pagamentos_a_inserir: backfill.payments.length,
        primeiro_pgto: backfill.payments[0]?.paymentDate ?? "-",
        ultimo_pgto: backfill.payments.at(-1)?.paymentDate ?? "-",
        next_payment_date: !updatePlanDates
          ? "(preservar: data atual mais recente)"
          : inactive
            ? "(preservar: plano inativo)"
            : backfill.nextPaymentDate,
        avisos: resolved.warnings.join("; ") || "-",
      },
    });
  }

  return { rows, blocked };
}

async function applyBackfill(client, report) {
  let inserted = 0;
  let updatedPlans = 0;

  for (const row of report.rows) {
    for (const payment of row.backfill.payments) {
      const result = await client.execute({
        sql: `INSERT INTO plan_payments
                (plan_id, client_id, payment_date, amount, status, skipped, notes)
              SELECT ?, ?, ?, ?, ?, ?, ?
              WHERE NOT EXISTS (
                SELECT 1 FROM plan_payments
                WHERE plan_id = ? AND substr(payment_date, 1, 7) = ?
              )`,
        args: [
          payment.planId,
          payment.clientId,
          payment.paymentDate,
          payment.amount,
          payment.status,
          payment.skipped ? 1 : 0,
          payment.notes,
          payment.planId,
          payment.month,
        ],
      });
      inserted += Number(result.rowsAffected ?? 0);
    }

    if (!row.updatePlanDates) continue;

    const inactive = row.plan.status !== "ativo" || Boolean(row.plan.end_date);
    const updateArgs = inactive
      ? [row.backfill.paidUntilIso, row.plan.id]
      : [row.backfill.paidUntilIso, row.backfill.nextPaymentDate, row.plan.id];
    const updateSql = inactive
      ? `UPDATE subscription_plans
         SET last_payment_date = ?, updated_at = datetime('now')
         WHERE id = ?`
      : `UPDATE subscription_plans
         SET last_payment_date = ?, next_payment_date = ?, updated_at = datetime('now')
         WHERE id = ?`;

    const result = await client.execute({ sql: updateSql, args: updateArgs });
    updatedPlans += Number(result.rowsAffected ?? 0);
  }

  return { inserted, updatedPlans };
}

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL ?? "file:./database/dev.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  console.log(`=== Backfill histórico de pagamentos — modo: ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

  const report = await createBackfillReport(client);
  console.table(report.rows.map((row) => row.summary));

  if (report.blocked.length > 0) {
    console.log("\nBloqueios encontrados. Nada será aplicado até resolver:");
    console.table(report.blocked);
  }

  const totalToInsert = report.rows.reduce((sum, row) => sum + row.backfill.payments.length, 0);
  console.log(`\nTotal planejado: ${totalToInsert} pagamento(s) em ${report.rows.length} plano(s).`);

  if (!APPLY || report.blocked.length > 0) {
    console.log("\nDry-run. Para aplicar sem bloqueios: node scripts/backfill-payment-history.mjs --apply");
    await client.close();
    return;
  }

  const result = await applyBackfill(client, report);
  console.log(`\nAplicado: ${result.inserted} pagamento(s) inserido(s), ${result.updatedPlans} plano(s) atualizado(s).`);

  await client.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("Erro no backfill:", err);
    process.exit(1);
  });
}
