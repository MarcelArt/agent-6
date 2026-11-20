CREATE TABLE `api_key` (
	`id` text PRIMARY KEY NOT NULL,
	`service_account_id` text NOT NULL,
	`name` text NOT NULL,
	`lookup_id` text NOT NULL,
	`digest` text NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`all_applications` integer DEFAULT false NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`service_account_id`) REFERENCES `service_account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_lookup_id_unique` ON `api_key` (`lookup_id`);--> statement-breakpoint
CREATE INDEX `api_key_service_account_idx` ON `api_key` (`service_account_id`);--> statement-breakpoint
CREATE TABLE `api_key_application` (
	`api_key_id` text NOT NULL,
	`application_id` text NOT NULL,
	PRIMARY KEY(`api_key_id`, `application_id`),
	FOREIGN KEY (`api_key_id`) REFERENCES `api_key`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_key_application_application_idx` ON `api_key_application` (`application_id`);--> statement-breakpoint
CREATE TABLE `audit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_type` text NOT NULL,
	`user_id` text,
	`service_account_id` text,
	`api_key_id` text,
	`operation` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_event_service_account_idx` ON `audit_event` (`service_account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_event_created_idx` ON `audit_event` (`created_at`);--> statement-breakpoint
CREATE TABLE `service_account` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`disabled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`retry_until` integer NOT NULL,
	`lease_until` integer,
	`lease_token` text,
	`last_attempt_at` integer,
	`last_status` integer,
	`last_result` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `webhook_event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `webhook_subscription`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhook_delivery_due_idx` ON `webhook_delivery` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `webhook_delivery_subscription_idx` ON `webhook_delivery` (`subscription_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `webhook_delivery_event_idx` ON `webhook_delivery` (`event_id`);--> statement-breakpoint
CREATE TABLE `webhook_event` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`application_id` text,
	`ticket_id` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `webhook_event_created_idx` ON `webhook_event` (`created_at`);--> statement-breakpoint
CREATE TABLE `webhook_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`event_types` text DEFAULT '[]' NOT NULL,
	`all_applications` integer DEFAULT false NOT NULL,
	`encrypted_secret` text NOT NULL,
	`encrypted_previous_secret` text,
	`previous_secret_expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_subscription_application` (
	`subscription_id` text NOT NULL,
	`application_id` text NOT NULL,
	PRIMARY KEY(`subscription_id`, `application_id`),
	FOREIGN KEY (`subscription_id`) REFERENCES `webhook_subscription`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhook_subscription_application_application_idx` ON `webhook_subscription_application` (`application_id`);--> statement-breakpoint
ALTER TABLE `ticket` ADD `decided_by_service_account_id` text REFERENCES service_account(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `ticket` ADD `decided_by_api_key_id` text REFERENCES api_key(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `ticket` ADD `filing_claim` text;