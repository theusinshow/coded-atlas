CREATE TABLE `composition_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`composition_id` text NOT NULL,
	`composition_version` integer NOT NULL,
	`variant` text NOT NULL,
	`format_id` text NOT NULL,
	`style_mode` text NOT NULL,
	`bindings` text NOT NULL,
	`overrides` text NOT NULL,
	`visual_profile_revision` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `composition_instances_project_idx` ON `composition_instances` (`project_id`);--> statement-breakpoint
ALTER TABLE `outputs` ADD `metadata` text DEFAULT '{}' NOT NULL;