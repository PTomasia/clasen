ALTER TABLE `expenses` ADD `installments_total` integer;--> statement-breakpoint
ALTER TABLE `expenses` ADD `installment_number` integer;--> statement-breakpoint
ALTER TABLE `expenses` ADD `installment_group_id` text;--> statement-breakpoint
ALTER TABLE `one_time_revenues` ADD `installments_total` integer;--> statement-breakpoint
ALTER TABLE `one_time_revenues` ADD `installment_number` integer;--> statement-breakpoint
ALTER TABLE `one_time_revenues` ADD `installment_group_id` text;