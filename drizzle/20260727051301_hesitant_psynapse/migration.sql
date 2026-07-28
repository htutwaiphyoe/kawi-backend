ALTER TABLE "users" ADD COLUMN "passwordResetTokenHash" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "passwordResetExpiresAt" timestamp;