CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
