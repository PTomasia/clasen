CREATE TABLE `standalone_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer,
	`valor` real NOT NULL,
	`data_pagamento` text NOT NULL,
	`tipo` text NOT NULL,
	`banco` text,
	`status` text DEFAULT 'confirmado' NOT NULL,
	`observacao` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
