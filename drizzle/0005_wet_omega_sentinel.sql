CREATE TABLE `database_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`database` text NOT NULL,
	`user` text NOT NULL,
	`encrypted_password` text NOT NULL,
	`ssl_mode` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`test_ok` integer NOT NULL,
	`test_message` text NOT NULL,
	`writable` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `database_connection_attachment` (
	`application_id` text NOT NULL,
	`database_connection_id` text NOT NULL,
	PRIMARY KEY(`application_id`, `database_connection_id`),
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`database_connection_id`) REFERENCES `database_connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `database_connection_attachment_connection_idx` ON `database_connection_attachment` (`database_connection_id`);