CREATE TABLE `access_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`grant_id` text,
	`client_admin` integer DEFAULT 0 NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`unlimited` integer DEFAULT 0 NOT NULL,
	`overrides` text DEFAULT '{}' NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grant_id`) REFERENCES `access_grants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "access_account_active" CHECK("access_accounts"."active" IN (0,1)),
	CONSTRAINT "access_account_client_admin" CHECK("access_accounts"."client_admin" IN (0,1)),
	CONSTRAINT "access_account_unlimited" CHECK("access_accounts"."unlimited" IN (0,1)),
	CONSTRAINT "access_account_expiry" CHECK(("access_accounts"."unlimited"=1 AND "access_accounts"."ends_at" IS NULL) OR ("access_accounts"."unlimited"=0 AND "access_accounts"."ends_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_accounts_username_unique` ON `access_accounts` (`username`);--> statement-breakpoint
CREATE TABLE `access_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text,
	`grant_id` text,
	`audience` text NOT NULL,
	`reason` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`outcome` text NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "access_audit_audience" CHECK("access_audit"."audience" IN ('owner','client'))
);
--> statement-breakpoint
CREATE INDEX `access_audit_grant` ON `access_audit` (`grant_id`,`at`);--> statement-breakpoint
CREATE TABLE `access_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset_id` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`unlimited` integer DEFAULT 0 NOT NULL,
	`project_ids` text NOT NULL,
	`warehouse_ids` text NOT NULL,
	`resource_ids` text NOT NULL,
	`ceiling` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "access_grant_active" CHECK("access_grants"."active" IN (0,1)),
	CONSTRAINT "access_grant_unlimited" CHECK("access_grants"."unlimited" IN (0,1)),
	CONSTRAINT "access_grant_expiry" CHECK(("access_grants"."unlimited"=1 AND "access_grants"."ends_at" IS NULL) OR ("access_grants"."unlimited"=0 AND "access_grants"."ends_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_grants_dataset_id_unique` ON `access_grants` (`dataset_id`);--> statement-breakpoint
CREATE TABLE `access_login_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `access_security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`event` text NOT NULL,
	`outcome` text NOT NULL,
	`user_id` text,
	`subject_hash` text
);
--> statement-breakpoint
CREATE INDEX `access_security_at` ON `access_security_events` (`at`);--> statement-breakpoint
CREATE TABLE `access_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`user_id` text NOT NULL,
	`account_revision` integer NOT NULL,
	`grant_revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `access_accounts`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_sessions_hash_unique` ON `access_sessions` (`hash`);--> statement-breakpoint
CREATE INDEX `access_sessions_user` ON `access_sessions` (`user_id`,`revoked_at`);