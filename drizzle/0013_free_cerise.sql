PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_database_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`database` text NOT NULL,
	`user` text NOT NULL,
	`encrypted_password` text,
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
INSERT INTO `__new_database_connection`("id", "name", "host", "port", "database", "user", "encrypted_password", "ssl_mode", "tags", "description", "test_ok", "test_message", "writable", "created_at", "updated_at") SELECT "id", "name", "host", "port", "database", "user", "encrypted_password", "ssl_mode", "tags", "description", "test_ok", "test_message", "writable", "created_at", "updated_at" FROM `database_connection`;--> statement-breakpoint
DROP TABLE `database_connection`;--> statement-breakpoint
ALTER TABLE `__new_database_connection` RENAME TO `database_connection`;--> statement-breakpoint
PRAGMA foreign_keys=ON;