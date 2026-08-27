CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`phase` text NOT NULL,
	`command_id` text,
	`run_id` text,
	`obligation_id` text,
	`agent_id` text,
	`debug_event_id` text,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	`data` text,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_events_case_id_sequence_unique` ON `activity_events` (`case_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `activity_events_case_id_idx` ON `activity_events` (`case_id`);--> statement-breakpoint
CREATE INDEX `activity_events_run_id_idx` ON `activity_events` (`run_id`);--> statement-breakpoint
CREATE TABLE `case_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`command_id` text,
	`created_at` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_events_case_id_sequence_unique` ON `case_events` (`case_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `case_events_case_id_idx` ON `case_events` (`case_id`);--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`pack_id` text NOT NULL,
	`pack_version` text NOT NULL,
	`pack_compiled_hash` text NOT NULL,
	`pack_selected_by` text NOT NULL,
	`event_sequence` integer DEFAULT 0 NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`command_name` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idempotency_keys_case_id_idx` ON `idempotency_keys` (`case_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`obligation_id` text NOT NULL,
	`status` text NOT NULL,
	`trace_id` text,
	`session_id` text,
	`limits` text,
	`result` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `runs_case_id_idx` ON `runs` (`case_id`);--> statement-breakpoint
CREATE TABLE `runtime_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`case_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`phase` text NOT NULL,
	`level` text NOT NULL,
	`trace_id` text NOT NULL,
	`span_id` text,
	`parent_span_id` text,
	`session_id` text,
	`obligation_id` text,
	`agent_id` text,
	`duration_ms` integer,
	`summary` text NOT NULL,
	`created_at` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runtime_events_run_id_sequence_unique` ON `runtime_events` (`run_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `runtime_events_case_id_idx` ON `runtime_events` (`case_id`);--> statement-breakpoint
CREATE INDEX `runtime_events_run_id_idx` ON `runtime_events` (`run_id`);--> statement-breakpoint
CREATE TABLE `schema_migrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`applied_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schema_migrations_name_unique` ON `schema_migrations` (`name`);