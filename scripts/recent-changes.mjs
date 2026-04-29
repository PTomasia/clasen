import "dotenv/config";
import { createClient } from "@libsql/client";

const c = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const minutes = Number(process.argv[2] ?? 60);
console.log(`=== Mudanças nos últimos ${minutes} minutos ===\n`);

// Planos tocados (updated_at recente) — captura updates via updatePayment/deletePayment
console.log("1. Planos com updated_at recente (= alguém editou/excluiu pagamento ou editou plano):");
const plans = await c.execute({
  sql: `SELECT sp.id, c.name, sp.last_payment_date, sp.next_payment_date,
               sp.updated_at,
               (SELECT MAX(payment_date) FROM plan_payments
                WHERE plan_id = sp.id AND skipped = 0) as actual_last
        FROM subscription_plans sp
        JOIN clients c ON c.id = sp.client_id
        WHERE sp.updated_at >= datetime('now', '-' || ? || ' minutes')
        ORDER BY sp.updated_at DESC`,
  args: [minutes],
});
console.table(plans.rows);

// Pagamentos criados recentemente (inserções via "Pagar" ou inserção direta)
console.log("\n2. Pagamentos criados recentemente:");
const payments = await c.execute({
  sql: `SELECT pp.id, c.name, pp.payment_date, pp.amount, pp.status, pp.skipped,
               pp.notes, pp.created_at
        FROM plan_payments pp
        JOIN clients c ON c.id = pp.client_id
        WHERE pp.created_at >= datetime('now', '-' || ? || ' minutes')
        ORDER BY pp.created_at DESC`,
  args: [minutes],
});
console.table(payments.rows);

// Verificar inconsistências (plano com last_payment_date != actual MAX)
console.log("\n3. Sanity check — planos com last_payment_date dessincronizado de plan_payments:");
const incons = await c.execute({
  sql: `SELECT c.name, sp.id, sp.last_payment_date, sp.next_payment_date,
               (SELECT MAX(payment_date) FROM plan_payments
                WHERE plan_id = sp.id AND skipped = 0) as actual_last
        FROM subscription_plans sp
        JOIN clients c ON c.id = sp.client_id
        WHERE sp.status = 'ativo'
          AND ((SELECT MAX(payment_date) FROM plan_payments
                WHERE plan_id = sp.id AND skipped = 0) != sp.last_payment_date
            OR (sp.last_payment_date IS NULL
                AND (SELECT COUNT(*) FROM plan_payments
                     WHERE plan_id = sp.id AND skipped = 0) > 0))
        ORDER BY c.name`,
  args: [],
});
console.table(incons.rows);
console.log(incons.rows.length === 0 ? "✓ Tudo sincronizado" : `⚠ ${incons.rows.length} planos com inconsistência`);

await c.close();
