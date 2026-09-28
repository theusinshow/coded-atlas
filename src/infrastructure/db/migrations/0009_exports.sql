CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`destination` text NOT NULL,
	`output_ids` text NOT NULL,
	`status` text NOT NULL,
	`result` text NOT NULL,
	`job_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exports_project_idx` ON `exports` (`project_id`);