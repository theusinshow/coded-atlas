CREATE TABLE `creative_directions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`tone` text NOT NULL,
	`emphasis` text NOT NULL,
	`style_mode` text NOT NULL,
	`accent` text,
	`notes` text NOT NULL,
	`plan_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `creative_directions_project_idx` ON `creative_directions` (`project_id`);--> statement-breakpoint
CREATE TABLE `creative_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`project_id` text,
	`polarity` text NOT NULL,
	`subject` text NOT NULL,
	`value` text NOT NULL,
	`source` text NOT NULL,
	`weight` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `creative_memory_project_idx` ON `creative_memory` (`project_id`);