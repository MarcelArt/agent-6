CREATE TABLE `ticket` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`repository_id` text,
	`repository` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`summary` text NOT NULL,
	`target_issue_number` integer,
	`possible_duplicate_of` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`decline_reason` text,
	`decided_by` text,
	`decided_at` integer,
	`last_error` text,
	`filing_until` integer,
	`filed_issue_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`possible_duplicate_of`) REFERENCES `ticket`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`filed_issue_id`) REFERENCES `filed_issue`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ticket_status_idx` ON `ticket` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `ticket_conversation_idx` ON `ticket` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `ticket_repository_idx` ON `ticket` (`repository_id`,`status`);