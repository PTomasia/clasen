import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const db = drizzle(client, { schema });

// Active plans extracted from "Clasen ADM.xlsx - historico_planos.csv"
// end_date = 08/04/2026 in the spreadsheet means "today" → NULL in our system
// next_payment = 30/01/1900 means no payment → NULL
interface ActivePlan {
  clientName: string;
  planType: string;
  planValue: number;
  billingCycleDays: number | null;
  postsCarrossel: number;
  postsReels: number;
  postsEstatico: number;
  postsTrafego: number;
  startDate: string;
  movementType: string | null;
  lastPaymentDate: string | null;
  nextPaymentDate: string | null;
  notes: string | null;
}

const activePlans: ActivePlan[] = [
  { clientName: "Michelle Menezes", planType: "Personalizado", planValue: 350, billingCycleDays: null, postsCarrossel: 1, postsReels: 3, postsEstatico: 0, postsTrafego: 0, startDate: "2026-03-01", movementType: "Downgrade", lastPaymentDate: "2026-01-13", nextPaymentDate: "2026-02-13", notes: "MAIO" },
  { clientName: "Luana Siqueira", planType: "Essential", planValue: 790, billingCycleDays: 30, postsCarrossel: 4, postsReels: 1, postsEstatico: 0, postsTrafego: 0, startDate: "2026-01-15", movementType: "New", lastPaymentDate: "2026-02-02", nextPaymentDate: "2026-03-02", notes: null },
  { clientName: "Dr Fernando", planType: "Personalizado", planValue: 380, billingCycleDays: 15, postsCarrossel: 3, postsReels: 1, postsEstatico: 0, postsTrafego: 0, startDate: "2025-07-01", movementType: null, lastPaymentDate: "2026-03-02", nextPaymentDate: "2026-04-02", notes: "NÃO ESTÁ POSTANDO" },
  { clientName: "Rhael", planType: "Personalizado", planValue: 530, billingCycleDays: 15, postsCarrossel: 4, postsReels: 0, postsEstatico: 0, postsTrafego: 0, startDate: "2025-08-01", movementType: null, lastPaymentDate: "2026-03-03", nextPaymentDate: "2026-04-03", notes: "AJUSTE JUNHO" },
  { clientName: "Isabela Godoy", planType: "Personalizado", planValue: 500, billingCycleDays: 5, postsCarrossel: 4, postsReels: 2, postsEstatico: 0, postsTrafego: 0, startDate: "2025-02-01", movementType: null, lastPaymentDate: "2026-03-04", nextPaymentDate: "2026-04-04", notes: "VAGA SOCIAL" },
  { clientName: "Natalia Veber", planType: "Personalizado", planValue: 590, billingCycleDays: 10, postsCarrossel: 4, postsReels: 1, postsEstatico: 0, postsTrafego: 0, startDate: "2026-02-01", movementType: null, lastPaymentDate: "2026-03-07", nextPaymentDate: "2026-04-07", notes: "650" },
  { clientName: "Maju Oliveira", planType: "Personalizado", planValue: 217, billingCycleDays: null, postsCarrossel: 2, postsReels: 1, postsEstatico: 0, postsTrafego: 0, startDate: "2026-03-01", movementType: "Downgrade", lastPaymentDate: "2026-03-09", nextPaymentDate: "2026-04-09", notes: "TRÁFEGO" },
  { clientName: "Jessica Ortega", planType: "Personalizado", planValue: 380, billingCycleDays: 15, postsCarrossel: 1, postsReels: 0, postsEstatico: 4, postsTrafego: 0, startDate: "2025-08-01", movementType: null, lastPaymentDate: "2026-03-09", nextPaymentDate: "2026-04-09", notes: "AJUSTE JUNHO" },
  { clientName: "Isabelle Taborda", planType: "Personalizado", planValue: 260, billingCycleDays: 15, postsCarrossel: 2, postsReels: 0, postsEstatico: 0, postsTrafego: 0, startDate: "2025-10-22", movementType: null, lastPaymentDate: "2026-03-09", nextPaymentDate: "2026-04-09", notes: null },
  { clientName: "Priscila de Souza", planType: "Personalizado", planValue: 265, billingCycleDays: 30, postsCarrossel: 1, postsReels: 2, postsEstatico: 0, postsTrafego: 0, startDate: "2025-08-01", movementType: null, lastPaymentDate: "2026-03-10", nextPaymentDate: "2026-04-10", notes: "390" },
  { clientName: "Rebeca", planType: "Personalizado", planValue: 1000, billingCycleDays: 30, postsCarrossel: 4, postsReels: 4, postsEstatico: 0, postsTrafego: 0, startDate: "2025-10-22", movementType: null, lastPaymentDate: "2026-03-10", nextPaymentDate: "2026-04-10", notes: null },
  { clientName: "Isabela Claro", planType: "Essential", planValue: 790, billingCycleDays: null, postsCarrossel: 4, postsReels: 1, postsEstatico: 0, postsTrafego: 0, startDate: "2026-01-15", movementType: "New", lastPaymentDate: "2026-03-10", nextPaymentDate: "2026-04-10", notes: null },
  { clientName: "Borba Gato", planType: "Personalizado", planValue: 900, billingCycleDays: 10, postsCarrossel: 4, postsReels: 0, postsEstatico: 6, postsTrafego: 0, startDate: "2024-04-01", movementType: null, lastPaymentDate: "2026-03-11", nextPaymentDate: "2026-04-11", notes: "1200" },
  { clientName: "Bia Gracher", planType: "Personalizado", planValue: 270, billingCycleDays: 30, postsCarrossel: 2, postsReels: 0, postsEstatico: 0, postsTrafego: 0, startDate: "2025-09-01", movementType: null, lastPaymentDate: "2026-03-11", nextPaymentDate: "2026-04-11", notes: "AJUSTE JUNHO" },
  { clientName: "Bárbara Brandao", planType: "Personalizado", planValue: 400, billingCycleDays: 30, postsCarrossel: 2, postsReels: 4, postsEstatico: 0, postsTrafego: 0, startDate: "2024-10-01", movementType: null, lastPaymentDate: "2026-03-13", nextPaymentDate: "2026-04-13", notes: "780" },
  { clientName: "Beatriz Viçoza", planType: "Personalizado", planValue: 350, billingCycleDays: 15, postsCarrossel: 1, postsReels: 2, postsEstatico: 0, postsTrafego: 0, startDate: "2026-02-01", movementType: null, lastPaymentDate: "2026-03-13", nextPaymentDate: "2026-04-13", notes: "390" },
  { clientName: "Gabriele Rousseau", planType: "Essential", planValue: 395, billingCycleDays: 15, postsCarrossel: 1, postsReels: 4, postsEstatico: 0, postsTrafego: 0, startDate: "2024-05-01", movementType: null, lastPaymentDate: "2026-03-15", nextPaymentDate: "2026-04-15", notes: "NÃO ESTÁ POSTANDO" },
  { clientName: "Thauane da Cunha", planType: "Personalizado", planValue: 350, billingCycleDays: null, postsCarrossel: 4, postsReels: 1, postsEstatico: 0, postsTrafego: 0, startDate: "2026-03-01", movementType: "Upgrade", lastPaymentDate: "2026-03-16", nextPaymentDate: "2026-04-16", notes: "ESTRATÉGICO" },
  { clientName: "Gabriela Alves", planType: "Personalizado", planValue: 600, billingCycleDays: 15, postsCarrossel: 4, postsReels: 1, postsEstatico: 0, postsTrafego: 0, startDate: "2025-07-01", movementType: null, lastPaymentDate: "2026-03-16", nextPaymentDate: "2026-04-16", notes: "AJUSTE JUNHO" },
  { clientName: "Fernanda Muniz", planType: "Personalizado", planValue: 1005, billingCycleDays: 15, postsCarrossel: 4, postsReels: 2, postsEstatico: 4, postsTrafego: 0, startDate: "2026-02-01", movementType: null, lastPaymentDate: "2026-03-16", nextPaymentDate: "2026-04-16", notes: null },
  { clientName: "Espaço Essenzia", planType: "Personalizado", planValue: 600, billingCycleDays: 15, postsCarrossel: 4, postsReels: 0, postsEstatico: 0, postsTrafego: 0, startDate: "2025-07-01", movementType: null, lastPaymentDate: "2026-03-17", nextPaymentDate: "2026-04-17", notes: null },
  { clientName: "Paula Lopes", planType: "Essential", planValue: 790, billingCycleDays: null, postsCarrossel: 4, postsReels: 1, postsEstatico: 0, postsTrafego: 0, startDate: "2026-03-12", movementType: "New", lastPaymentDate: "2026-03-24", nextPaymentDate: "2026-04-24", notes: null },
  { clientName: "Paulo Gomes", planType: "Personalizado", planValue: 480, billingCycleDays: 30, postsCarrossel: 3, postsReels: 2, postsEstatico: 0, postsTrafego: 0, startDate: "2025-09-01", movementType: null, lastPaymentDate: "2026-03-25", nextPaymentDate: "2026-04-25", notes: "MAIO" },
  { clientName: "Pedagobia Macedo", planType: "Personalizado", planValue: 670, billingCycleDays: 30, postsCarrossel: 4, postsReels: 2, postsEstatico: 4, postsTrafego: 0, startDate: "2025-10-01", movementType: null, lastPaymentDate: "2026-03-26", nextPaymentDate: "2026-04-26", notes: "MAIO" },
  { clientName: "Clínica Innera", planType: "Personalizado", planValue: 500, billingCycleDays: null, postsCarrossel: 3, postsReels: 1, postsEstatico: 0, postsTrafego: 0, startDate: "2026-03-27", movementType: null, lastPaymentDate: null, nextPaymentDate: null, notes: null },
  { clientName: "Karina Lima", planType: "Personalizado", planValue: 650, billingCycleDays: null, postsCarrossel: 4, postsReels: 0, postsEstatico: 2, postsTrafego: 0, startDate: "2026-03-27", movementType: null, lastPaymentDate: null, nextPaymentDate: null, notes: null },
  { clientName: "Kelly", planType: "Personalizado", planValue: 700, billingCycleDays: null, postsCarrossel: 2, postsReels: 2, postsEstatico: 0, postsTrafego: 0, startDate: "2026-03-18", movementType: "New", lastPaymentDate: null, nextPaymentDate: null, notes: null },
  { clientName: "Kelly Martins", planType: "Personalizado", planValue: 700, billingCycleDays: null, postsCarrossel: 2, postsReels: 2, postsEstatico: 0, postsTrafego: 0, startDate: "2026-04-01", movementType: "New", lastPaymentDate: null, nextPaymentDate: null, notes: null },
  { clientName: "Myllena Barbosa", planType: "Essential", planValue: 890, billingCycleDays: null, postsCarrossel: 4, postsReels: 1, postsEstatico: 0, postsTrafego: 0, startDate: "2026-04-01", movementType: "New", lastPaymentDate: null, nextPaymentDate: null, notes: null },
  { clientName: "Fernanda Muniz", planType: "Tráfego", planValue: 400, billingCycleDays: null, postsCarrossel: 0, postsReels: 0, postsEstatico: 0, postsTrafego: 1, startDate: "2026-04-01", movementType: "New", lastPaymentDate: null, nextPaymentDate: null, notes: null },
  { clientName: "Jessica Ortega", planType: "Tráfego", planValue: 300, billingCycleDays: null, postsCarrossel: 0, postsReels: 0, postsEstatico: 0, postsTrafego: 1, startDate: "2026-03-20", movementType: "New", lastPaymentDate: null, nextPaymentDate: null, notes: null },
];

async function seed() {
  console.log("Seeding active clients and plans to Turso...\n");

  for (const plan of activePlans) {
    // Reutilizar cliente existente se nome bate (case-insensitive + trim)
    const normalized = plan.clientName.trim().toLowerCase();
    const existing = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(sql`lower(trim(${schema.clients.name})) = ${normalized}`)
      .get();

    let insertedClient: { id: number };
    if (existing) {
      insertedClient = existing;
      console.log(`  Client #${existing.id}: ${plan.clientName} (reutilizado)`);
    } else {
      const [inserted] = await db
        .insert(schema.clients)
        .values({ name: plan.clientName })
        .returning({ id: schema.clients.id });
      insertedClient = inserted;
      console.log(`  Client #${inserted.id}: ${plan.clientName}`);
    }

    // Insert plan (end_date = NULL → active)
    await db.insert(schema.subscriptionPlans).values({
      clientId: insertedClient.id,
      planType: plan.planType,
      planValue: plan.planValue,
      billingCycleDays: plan.billingCycleDays,
      postsCarrossel: plan.postsCarrossel,
      postsReels: plan.postsReels,
      postsEstatico: plan.postsEstatico,
      postsTrafego: plan.postsTrafego,
      startDate: plan.startDate,
      endDate: null, // active plan
      movementType: plan.movementType,
      lastPaymentDate: plan.lastPaymentDate,
      nextPaymentDate: plan.nextPaymentDate,
      status: "ativo",
      notes: plan.notes,
    });

    console.log(`    → Plan: ${plan.planType} R$${plan.planValue}`);
  }

  console.log(`\nDone! ${activePlans.length} clients + plans inserted.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
