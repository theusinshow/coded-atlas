CREATE TABLE `asset_relations` (
	`from_asset_id` text NOT NULL,
	`to_asset_id` text NOT NULL,
	`type` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`from_asset_id`, `to_asset_id`, `type`),
	FOREIGN KEY (`from_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asset_relations_to_idx` ON `asset_relations` (`to_asset_id`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`sha256` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`parent_asset_id` text,
	`capture_id` text,
	`label` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`capture_id`) REFERENCES `captures`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `assets_project_idx` ON `assets` (`project_id`);--> statement-breakpoint
CREATE INDEX `assets_sha256_idx` ON `assets` (`project_id`,`sha256`);--> statement-breakpoint
CREATE INDEX `assets_capture_idx` ON `assets` (`capture_id`);--> statement-breakpoint
CREATE TABLE `captures` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_id` text NOT NULL,
	`job_id` text,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`params` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `captures_project_idx` ON `captures` (`project_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`progress` integer NOT NULL,
	`message` text,
	`payload` text NOT NULL,
	`result` text,
	`error` text,
	`attempts` integer NOT NULL,
	`cancel_requested_at` text,
	`locked_by` text,
	`locked_at` text,
	`heartbeat_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_project_idx` ON `jobs` (`project_id`);--> statement-breakpoint
CREATE TABLE `outputs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text,
	`format` text NOT NULL,
	`mime_type` text NOT NULL,
	`storage_key` text NOT NULL,
	`sha256` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`source_asset_ids` text NOT NULL,
	`label` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `outputs_project_idx` ON `outputs` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`client` text,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`cover_asset_id` text,
	`schema_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`locator` text NOT NULL,
	`label` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sources_project_idx` ON `sources` (`project_id`);