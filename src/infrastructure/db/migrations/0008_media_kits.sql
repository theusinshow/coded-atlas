CREATE TABLE `media_kits` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`preset_id` text NOT NULL,
	`direction` text NOT NULL,
	`direction_id` text,
	`items` text NOT NULL,
	`status` text NOT NULL,
	`last_render_job_id` text,
	`visual_profile_revision` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_kits_project_idx` ON `media_kits` (`project_id`);