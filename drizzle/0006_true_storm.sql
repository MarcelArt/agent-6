CREATE TABLE `log_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`auth_type` text NOT NULL,
	`auth_username` text DEFAULT '' NOT NULL,
	`encrypted_auth_secret` text,
	`tenant_id` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`test_ok` integer NOT NULL,
	`test_message` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `log_connection_attachment` (
	`application_id` text NOT NULL,
	`log_connection_id` text NOT NULL,
	`base_selector` text NOT NULL,
	PRIMARY KEY(`application_id`, `log_connection_id`),
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`log_connection_id`) REFERENCES `log_connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `log_connection_attachment_connection_idx` ON `log_connection_attachment` (`log_connection_id`);