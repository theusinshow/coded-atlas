CREATE TABLE `creative_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`head_revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `creative_documents_project_idx` ON `creative_documents` (`project_id`);--> statement-breakpoint
CREATE TABLE `document_revisions` (
	`document_id` text NOT NULL,
	`revision` integer NOT NULL,
	`content` text NOT NULL,
	`origin` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`document_id`, `revision`),
	FOREIGN KEY (`document_id`) REFERENCES `creative_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
