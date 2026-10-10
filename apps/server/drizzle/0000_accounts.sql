CREATE TABLE "account_weapons" (
	"account_id" text NOT NULL,
	"weapon_id" text NOT NULL,
	"source" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_weapons_account_id_weapon_id_pk" PRIMARY KEY("account_id","weapon_id"),
	CONSTRAINT "account_weapons_source_check" CHECK ("account_weapons"."source" in ('opened', 'bought'))
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"google_id" text,
	"display_name" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email"),
	CONSTRAINT "accounts_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
ALTER TABLE "account_weapons" ADD CONSTRAINT "account_weapons_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;