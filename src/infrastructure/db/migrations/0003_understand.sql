CREATE TABLE `visual_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`revision` integer NOT NULL,
	`palette` text NOT NULL,
	`fonts` text NOT NULL,
	`tech_stack` text NOT NULL,
	`traits` text NOT NULL,
	`og_image_url` text,
	`logo_asset_id` text,
	`source` text NOT NULL,
	`capture_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logo_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`capture_id`) REFERENCES `captures`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visual_profiles_project_revision` ON `visual_profiles` (`project_id`,`revision`);