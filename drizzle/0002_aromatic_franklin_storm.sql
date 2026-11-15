CREATE TABLE `repository` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`tracked_branch` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`sync_started_at` integer,
	`last_synced_at` integer,
	`last_synced_commit` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repository_full_name_unique` ON `repository` (`full_name`);