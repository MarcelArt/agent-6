CREATE TABLE `upload` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`message_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`model_type` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_message_idx` ON `upload` (`message_id`);--> statement-breakpoint
CREATE INDEX `upload_user_idx` ON `upload` (`user_id`);--> statement-breakpoint
ALTER TABLE `message` ADD `images_unread` integer DEFAULT false NOT NULL;