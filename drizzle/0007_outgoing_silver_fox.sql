CREATE TABLE `filed_issue` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text NOT NULL,
	`repository` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`outcome` text NOT NULL,
	`issue_number` integer,
	`url` text,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `filed_issue_conversation_idx` ON `filed_issue` (`conversation_id`);