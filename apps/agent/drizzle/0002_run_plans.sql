CREATE TABLE `run_plans` (
	`plan_id` text NOT NULL,
	`version` integer NOT NULL,
	`case_id` text NOT NULL,
	`created_at` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY (`plan_id`, `version`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_plans_case_id_idx` ON `run_plans` (`case_id`);
