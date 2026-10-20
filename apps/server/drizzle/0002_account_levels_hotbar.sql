UPDATE "accounts" SET "level" = 20, "xp" = 0 WHERE "level" > 20;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "hotbar_order" text[];
