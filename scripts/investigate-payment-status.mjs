import "dotenv/config";
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log("=== FIX-1.1 INVESTIGAÇÃO ===\n");

console.log("1. Innera / Dara — estado atual dos planos:");
const innera = await client.execute({
  sql: `SELECT c.name, sp.id as plan_id, sp.plan_type, sp.billing_cycle_days,
               sp.last_payment_date, sp.next_payment_date, sp.status,
               (SELECT COUNT(*) FROM plan_payments WHERE plan_id = sp.id) as pagamentos_count,
               (SELECT MAX(payment_date) FROM plan_payments WHERE plan_id = sp.id) as ultimo_pgto_real
        FROM clients c
        JOIN subscription_plans sp ON sp.client_id = c.id
        WHERE LOWER(c.name) LIKE '%innera%' OR LOWER(c.name) LIKE '%dara%'
        ORDER BY c.name, sp.id`,
  args: [],
});
console.table(innera.rows);

console.log("\n2. Borba Gato — estado atual:");
const borba = await client.execute({
  sql: `SELECT c.name, sp.id as plan_id, sp.plan_type, sp.billing_cycle_days,
               sp.last_payment_date, sp.next_payment_date, sp.status,
               (SELECT COUNT(*) FROM plan_payments WHERE plan_id = sp.id) as pagamentos_count,
               (SELECT MAX(payment_date) FROM plan_payments WHERE plan_id = sp.id) as ultimo_pgto_real
        FROM clients c
        JOIN subscription_plans sp ON sp.client_id = c.id
        WHERE LOWER(c.name) LIKE '%borba%gato%' OR LOWER(c.name) LIKE '%borba_gato%' OR LOWER(c.name) LIKE '%borbagato%'
        ORDER BY sp.id`,
  args: [],
});
console.table(borba.rows);

console.log("\n3. Todos os planos ATIVOS com inconsistência (tem pagamento real mas next_payment_date NULL):");
const inconsistentes = await client.execute({
  sql: `SELECT c.name, sp.id as plan_id, sp.last_payment_date, sp.next_payment_date,
               sp.billing_cycle_days,
               (SELECT COUNT(*) FROM plan_payments WHERE plan_id = sp.id) as pagamentos_count,
               (SELECT MAX(payment_date) FROM plan_payments WHERE plan_id = sp.id) as ultimo_pgto_real
        FROM clients c
        JOIN subscription_plans sp ON sp.client_id = c.id
        WHERE sp.status = 'ativo'
          AND sp.next_payment_date IS NULL
          AND ((SELECT COUNT(*) FROM plan_payments WHERE plan_id = sp.id) > 0
               OR sp.last_payment_date IS NOT NULL)
        ORDER BY c.name`,
  args: [],
});
console.table(inconsistentes.rows);
console.log(`\n→ ${inconsistentes.rows.length} planos com inconsistência`);

console.log("\n4. Planos atrasados hoje (next_payment_date < hoje):");
const today = new Date().toISOString().split("T")[0];
console.log(`   (hoje = ${today})`);
const atrasados = await client.execute({
  sql: `SELECT c.name, sp.id as plan_id, sp.billing_cycle_days, sp.last_payment_date, sp.next_payment_date,
               julianday('now') - julianday(sp.next_payment_date) as dias_atraso
        FROM clients c
        JOIN subscription_plans sp ON sp.client_id = c.id
        WHERE sp.status = 'ativo'
          AND sp.next_payment_date IS NOT NULL
          AND sp.next_payment_date < date('now')
        ORDER BY sp.next_payment_date ASC`,
  args: [],
});
console.table(atrasados.rows);

console.log("\n5. Total de planos ativos por status de pagamento:");
const resumo = await client.execute({
  sql: `SELECT
          CASE
            WHEN next_payment_date IS NULL THEN 'sem_pagamento'
            WHEN next_payment_date >= date('now') THEN 'em_dia'
            ELSE 'atrasado'
          END as status_pgto,
          COUNT(*) as total
        FROM subscription_plans
        WHERE status = 'ativo'
        GROUP BY status_pgto`,
  args: [],
});
console.table(resumo.rows);

await client.close();
