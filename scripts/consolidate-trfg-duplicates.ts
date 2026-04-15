import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, sql, like } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

/**
 * Consolida clientes duplicados que foram importados com prefixo "Trfg - ".
 *
 * Regra: se existe cliente "Trfg - X" E cliente "X" (ou outro match por nome),
 * move os planos + pagamentos do "Trfg - X" para o cliente principal e deleta
 * o duplicado.
 *
 * Mapeamento manual (nomes do prefixo → nome canônico):
 *   "Trfg - Feh Muniz"  → "Fernanda Muniz"
 *   "Trfg - Jessica"    → "Jessica Ortega"
 *
 * Idempotente: pode ser rodado várias vezes sem efeito colateral.
 */

const MANUAL_MAP: Record<string, string> = {
  "Trfg - Feh Muniz": "Fernanda Muniz",
  "Trfg - Jessica": "Jessica Ortega",
};

const libsql = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const db = drizzle(libsql, { schema });

async function findByName(name: string) {
  return await db
    .select()
    .from(schema.clients)
    .where(sql`lower(trim(${schema.clients.name})) = ${name.trim().toLowerCase()}`)
    .get();
}

async function consolidate() {
  console.log("Consolidando clientes duplicados com prefixo 'Trfg - '...\n");

  // Buscar todos os clientes com prefixo Trfg
  const trfgClients = await db
    .select()
    .from(schema.clients)
    .where(like(schema.clients.name, "Trfg -%"))
    .all();

  if (trfgClients.length === 0) {
    console.log("Nenhum cliente com prefixo 'Trfg -' encontrado. Nada a fazer.");
    return;
  }

  console.log(`Encontrados ${trfgClients.length} clientes com prefixo 'Trfg -':`);
  for (const c of trfgClients) console.log(`  #${c.id} ${c.name}`);
  console.log();

  let consolidated = 0;
  let skipped = 0;

  for (const trfg of trfgClients) {
    const canonicalName = MANUAL_MAP[trfg.name];
    if (!canonicalName) {
      console.log(`  ⚠ #${trfg.id} "${trfg.name}" — sem mapeamento manual, pulando`);
      skipped++;
      continue;
    }

    const canonical = await findByName(canonicalName);
    if (!canonical) {
      console.log(`  ⚠ #${trfg.id} "${trfg.name}" — cliente canônico "${canonicalName}" não existe; pulando`);
      skipped++;
      continue;
    }

    if (canonical.id === trfg.id) {
      // Já é o mesmo (nome já foi renomeado em execução anterior)
      skipped++;
      continue;
    }

    // Migrar planos do trfg → canonical
    const plansMoved = await db
      .update(schema.subscriptionPlans)
      .set({ clientId: canonical.id })
      .where(eq(schema.subscriptionPlans.clientId, trfg.id))
      .run();

    // Migrar pagamentos do trfg → canonical
    const paymentsMoved = await db
      .update(schema.planPayments)
      .set({ clientId: canonical.id })
      .where(eq(schema.planPayments.clientId, trfg.id))
      .run();

    // Deletar cliente duplicado
    await db
      .delete(schema.clients)
      .where(eq(schema.clients.id, trfg.id))
      .run();

    console.log(
      `  ✓ #${trfg.id} "${trfg.name}" → #${canonical.id} "${canonical.name}" ` +
      `(planos: ${plansMoved.rowsAffected}, pagamentos: ${paymentsMoved.rowsAffected})`
    );
    consolidated++;
  }

  console.log(`\nConsolidados: ${consolidated}. Pulados: ${skipped}.`);
  process.exit(0);
}

consolidate().catch((err) => {
  console.error("Consolidação falhou:", err);
  process.exit(1);
});
