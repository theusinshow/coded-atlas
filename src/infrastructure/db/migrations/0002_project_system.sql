CREATE TABLE `legacy_imports` (
	`slug` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`status` text NOT NULL,
	`catalog_created_at` text,
	`error` text,
	`imported_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `assets` ADD `metadata` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `description` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `origin` text DEFAULT 'atlas' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `search_text` text DEFAULT '' NOT NULL;