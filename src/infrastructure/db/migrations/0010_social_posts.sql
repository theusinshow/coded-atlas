CREATE TABLE `social_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`title` text NOT NULL,
	`output_ids` text NOT NULL,
	`caption` text NOT NULL,
	`hashtags` text NOT NULL,
	`planned_for` text,
	`feed_order` integer NOT NULL,
	`posted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `social_posts_feed_idx` ON `social_posts` (`feed_order`);