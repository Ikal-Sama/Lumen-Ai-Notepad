ALTER TABLE "notes" ADD COLUMN "content_ciphertext" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "content_iv" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "encryption_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE "user_encryption_key" (
	"user_id" text PRIMARY KEY NOT NULL,
	"kdf_salt" text NOT NULL,
	"kdf_iterations" integer NOT NULL,
	"wrapped_dek" text NOT NULL,
	"wrapped_dek_iv" text NOT NULL,
	"recovery_wrapped_dek" text NOT NULL,
	"recovery_wrapped_dek_iv" text NOT NULL,
	"verifier_ciphertext" text NOT NULL,
	"verifier_iv" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "user_encryption_key" ADD CONSTRAINT "user_encryption_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;