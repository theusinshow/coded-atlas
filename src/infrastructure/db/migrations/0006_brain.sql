CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`task` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`effort` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`cached_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`estimated_cost_usd` real,
	`latency_ms` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_usage_created_idx` ON `ai_usage` (`created_at`);--> statement-breakpoint
CREATE TABLE `creative_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parent_id` text,
	`request` text NOT NULL,
	`summary` text NOT NULL,
	`direction` text NOT NULL,
	`asset_ranking` text NOT NULL,
	`items` text NOT NULL,
	`source` text NOT NULL,
	`model` text,
	`warnings` text NOT NULL,
	`status` text NOT NULL,
	`applied_instance_ids` text NOT NULL,
	`visual_profile_revision` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `creative_plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `creative_plans_project_idx` ON `creative_plans` (`project_id`);