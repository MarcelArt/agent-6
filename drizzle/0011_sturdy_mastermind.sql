ALTER TABLE `conversation` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `conversation_activity_idx` ON `conversation` (`updated_at`,`id`);--> statement-breakpoint
ALTER TABLE `message` ADD `activity` text DEFAULT '[]' NOT NULL;