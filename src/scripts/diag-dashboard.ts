// Curadoria READ-ONLY dos dados que alimentam o Dashboard (nada é escrito).
// Verifica inconsistências que distorcem KPIs, MRR contratado, atrasados e
// próximos vencimentos. Rodar: npx tsx --env-file=.env src/scripts/diag-dashboard.ts

import * as schema from "../lib/db/schema";
import { normalizeClientName } from "../lib/services/reconciliation";

function brl(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];

async function main() {
  const { db } = await import("../lib/db/index");

  const plans = (await db.select().from(schema.subscriptionPlans).all()) as Array<{
    id: number;
    clientId: number;
    planType: string;
    planValue: number;
    billingCycleDays: number | null;
    billingCycleDays2: number | null;
    startDate: string;
    endDate: string | null;
    lastPaymentDate: string | null;
    nextPaymentDate: string | null;
    status: string;
  }>;
  const payments = (await db.select().from(schema.planPayments).all()) as Array<{
    id: number;
    planId: number;
    clientId: number;
    paymentDate: string;
    amount: number;
    status: string;
    skipped: boolean | number;
  }>;
  const clients = (await db.select().from(schema.clients).all()) as Array<{
    id: number;
    name: string;
  }>;
  const name = (id: number) => clients.find((c) => c.id === id)?.name ?? `cliente#${id}`;
  const planById = new Map(plans.map((p) => [p.id, p]));

  let issues = 0;
  const section = (t: string) => console.log(`\n═══ ${t} ═══`);
  const flag = (msg: string) => {
    issues++;
    console.log(`  ⚠ ${msg}`);
  };

  // ── 1. Planos: campos básicos ──────────────────────────────────────────────
  section("1. Planos — campos básicos");
  for (const p of plans) {
    if (p.planValue <= 0) flag(`plan${p.id} ${name(p.clientId)}: planValue ${brl(p.planValue)}`);
    if (p.endDate && p.endDate < p.startDate)
      flag(`plan${p.id} ${name(p.clientId)}: endDate ${p.endDate} < startDate ${p.startDate}`);
    if (!p.endDate && p.status === "cancelado")
      flag(`plan${p.id} ${name(p.clientId)}: status "cancelado" mas endDate NULL (ativo)`);
    if (p.endDate && p.status === "ativo")
      flag(`plan${p.id} ${name(p.clientId)}: status "ativo" mas endDate ${p.endDate} (encerrado)`);
    if (!p.endDate && !p.billingCycleDays)
      flag(`plan${p.id} ${name(p.clientId)}: ativo SEM billingCycleDays (fica fora de atrasados/próximos)`);
    if (!p.endDate && p.billingCycleDays && !p.nextPaymentDate)
      flag(`plan${p.id} ${name(p.clientId)}: ativo com ciclo mas nextPaymentDate NULL (fora de "próximos 7 dias")`);
  }
  if (issues === 0) console.log("  ok");

  // ── 2. Reajustes mal encadeados (dupla contagem no MRR contratado) ─────────
  // changePlan encerra o antigo (endDate=D) e cria o novo (startDate=D). O MRR
  // contratado desconta o sucessor SÓ quando startDate do novo == endDate do
  // antigo (mesmo cliente). Par "quase igual" (1-7 dias) conta os DOIS no mês.
  section("2. Reajustes — encadeamento antigo→novo (impacto direto no MRR contratado)");
  const before = issues;
  for (const oldP of plans.filter((p) => p.endDate)) {
    const successors = plans.filter(
      (n) =>
        n.clientId === oldP.clientId &&
        n.id !== oldP.id &&
        n.startDate >= oldP.endDate! &&
        // até 7 dias depois do encerramento = provável reajuste/renovação
        new Date(n.startDate).getTime() - new Date(oldP.endDate!).getTime() <= 7 * 86400000
    );
    for (const newP of successors) {
      if (newP.startDate !== oldP.endDate) {
        const sameMonth = newP.startDate.slice(0, 7) === oldP.endDate!.slice(0, 7);
        flag(
          `${name(oldP.clientId)}: plan${oldP.id} termina ${oldP.endDate} → plan${newP.id} começa ${newP.startDate}` +
            (sameMonth ? ` — DUPLA CONTAGEM no MRR de ${oldP.endDate!.slice(0, 7)} (${brl(oldP.planValue)} + ${brl(newP.planValue)})` : " (meses distintos, sem dupla contagem)")
        );
      }
    }
  }
  if (issues === before) console.log("  ok — todos os reajustes com datas exatamente encadeadas");

  // ── 3. Clientes duplicados (nome normalizado) ──────────────────────────────
  section("3. Clientes — duplicidade de cadastro");
  const b3 = issues;
  const byNorm = new Map<string, typeof clients>();
  for (const c of clients) {
    const k = normalizeClientName(c.name);
    byNorm.set(k, [...(byNorm.get(k) ?? []), c]);
  }
  for (const [, group] of byNorm) {
    if (group.length > 1)
      flag(`nomes equivalentes: ${group.map((c) => `#${c.id} "${c.name}"`).join(" vs ")}`);
  }
  if (issues === b3) console.log("  ok");

  // ── 4. Pagamentos — sanidade ───────────────────────────────────────────────
  section("4. Pagamentos — sanidade");
  const b4 = issues;
  for (const p of payments) {
    const plan = planById.get(p.planId);
    if (!plan) {
      flag(`pgto #${p.id}: planId ${p.planId} não existe`);
      continue;
    }
    if (p.skipped && p.amount !== 0)
      flag(`pgto #${p.id} ${name(p.clientId)}: skipped mas amount ${brl(p.amount)} (congela deveria ser 0)`);
    if (!["pago", "pendente", "inadimplente"].includes(p.status))
      flag(`pgto #${p.id} ${name(p.clientId)}: status desconhecido "${p.status}"`);
    if (p.paymentDate < plan.startDate)
      flag(`pgto #${p.id} ${name(p.clientId)}: data ${p.paymentDate} ANTES do início do plano (${plan.startDate})`);
    if (plan.endDate && p.paymentDate > plan.endDate)
      flag(`pgto #${p.id} ${name(p.clientId)}: data ${p.paymentDate} DEPOIS do fim do plano (${plan.endDate})`);
    if (p.clientId !== plan.clientId)
      flag(`pgto #${p.id}: clientId ${p.clientId} ≠ dono do plano (${plan.clientId})`);
  }
  if (issues === b4) console.log("  ok");

  // ── 5. Múltiplos planos ativos por cliente (revisão, não erro) ─────────────
  section("5. Clientes com 2+ planos ativos (conferir se é intencional)");
  const activeByClient = new Map<number, typeof plans>();
  for (const p of plans.filter((x) => !x.endDate)) {
    activeByClient.set(p.clientId, [...(activeByClient.get(p.clientId) ?? []), p]);
  }
  let multi = 0;
  for (const [cid, group] of activeByClient) {
    if (group.length > 1) {
      multi++;
      console.log(
        `  ${name(cid)}: ${group.map((p) => `plan${p.id} ${p.planType} ${brl(p.planValue)}`).join(" + ")}`
      );
    }
  }
  if (multi === 0) console.log("  nenhum");

  // ── 6. Série MRR contratado (como ficará) ──────────────────────────────────
  section("6. MRR contratado por mês (como o gráfico passará a mostrar)");
  for (const m of MONTHS) {
    const firstDay = `${m}-01`;
    const lastDay = `${m}-31`;
    const active = plans.filter(
      (p) => p.startDate <= lastDay && (p.endDate === null || p.endDate >= firstDay)
    );
    const successorKeys = new Set(
      active.filter((p) => p.endDate).map((p) => `${p.clientId}|${p.endDate}`)
    );
    const counted = active.filter((p) => !successorKeys.has(`${p.clientId}|${p.startDate}`));
    const value = counted.reduce((s, p) => s + p.planValue, 0);
    console.log(`  ${m}: ${brl(value)} (${counted.length} planos)`);
  }

  console.log(`\n${issues === 0 ? "✔ Nenhuma inconsistência" : `Total: ${issues} apontamento(s)`}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Erro na curadoria:", err);
  process.exit(1);
});
