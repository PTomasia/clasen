CREATE TABLE `agency_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `client_since` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `birthday` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `whatsapp` text;