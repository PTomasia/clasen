CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`contact_origin` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`description` text NOT NULL,
	`category` text DEFAULT 'variavel' NOT NULL,
	`amount` real NOT NULL,
	`is_paid` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `marketing_monthly` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`ad_spend` real DEFAULT 0 NOT NULL,
	`new_clients` integer DEFAULT 0 NOT NULL,
	`churned_clients` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_monthly_month_unique` ON `marketing_monthly` (`month`);--> statement-breakpoint
CREATE TABLE `one_time_revenues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`product` text NOT NULL,
	`channel` text,
	`campaign` text,
	`is_paid` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `plan_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`client_id` integer NOT NULL,
	`payment_date` text NOT NULL,
	`amount` real NOT NULL,
	`status` text DEFAULT 'pago' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`plan_type` text NOT NULL,
	`plan_value` real NOT NULL,
	`billing_cycle_days` integer,
	`billing_cycle_days_2` integer,
	`posts_carrossel` integer DEFAULT 0 NOT NULL,
	`posts_reels` integer DEFAULT 0 NOT NULL,
	`posts_estatico` integer DEFAULT 0 NOT NULL,
	`posts_trafego` integer DEFAULT 0 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`last_adjustment_date` text,
	`movement_type` text,
	`last_payment_date` text,
	`next_payment_date` text,
	`status` text DEFAULT 'ativo' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict
);
