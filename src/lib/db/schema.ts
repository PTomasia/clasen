import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Clients ───────────────────────────────────────────────────────────────────
// Clientes são criados inline ao criar planos — não existe CRUD separado.
// Status (ativo/inativo) é DERIVADO: ativo se tem ao menos 1 plano com end_date IS NULL.
export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  contactOrigin: text("contact_origin"), // Instagram, Indicação, Google, etc.
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Subscription Plans ────────────────────────────────────────────────────────
// Tabela principal do sistema. Um cliente pode ter múltiplas linhas (histórico).
export const subscriptionPlans = sqliteTable("subscription_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),

  // Tipo e valor
  planType: text("plan_type").notNull(), // Essential, Personalizado, Tráfego, Site
  planValue: real("plan_value").notNull(),
  billingCycleDays: integer("billing_cycle_days"), // 5, 10, 15, 20, 30

  // Composição de posts
  postsCarrossel: integer("posts_carrossel").notNull().default(0),
  postsReels: integer("posts_reels").notNull().default(0),
  postsEstatico: integer("posts_estatico").notNull().default(0),
  postsTrafego: integer("posts_trafego").notNull().default(0),

  // Datas
  startDate: text("start_date").notNull(), // ISO 8601: '2024-01-15'
  endDate: text("end_date"), // NULL = plano ativo
  lastAdjustmentDate: text("last_adjustment_date"),

  // Movimentação e pagamento
  movementType: text("movement_type"), // New, Upgrade, Downgrade
  lastPaymentDate: text("last_payment_date"),
  nextPaymentDate: text("next_payment_date"),

  // Meta
  status: text("status").notNull().default("ativo"), // ativo, cancelado
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Plan Payments ─────────────────────────────────────────────────────────────
// Um registro por pagamento mensal. Habilita MRR histórico preciso.
export const planPayments = sqliteTable("plan_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id")
    .notNull()
    .references(() => subscriptionPlans.id, { onDelete: "cascade" }),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id), // denormalizado para conveniência
  paymentDate: text("payment_date").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pago"), // pago, pendente, inadimplente
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── One-Time Revenues (Sprint 4) ─────────────────────────────────────────────
export const oneTimeRevenues = sqliteTable("one_time_revenues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  date: text("date").notNull(),
  amount: real("amount").notNull(),
  product: text("product").notNull(), // Carrossel, PDF, Arte p/ trafego, etc.
  channel: text("channel"), // WhatsApp, Instagram, etc.
  campaign: text("campaign"),
  isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Marketing Monthly (Sprint 4) ─────────────────────────────────────────────
export const marketingMonthly = sqliteTable("marketing_monthly", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull().unique(), // YYYY-MM
  adSpend: real("ad_spend").notNull().default(0),
  newClients: integer("new_clients").notNull().default(0),
  churnedClients: integer("churned_clients").notNull().default(0),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Expenses (Sprint 5) ──────────────────────────────────────────────────────
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull(), // YYYY-MM
  description: text("description").notNull(),
  category: text("category").notNull().default("variavel"), // fixo, variavel
  amount: real("amount").notNull(),
  isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
