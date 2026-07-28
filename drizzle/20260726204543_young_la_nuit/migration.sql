ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'publisher';--> statement-breakpoint
ALTER TABLE "authors" ADD COLUMN "createdBy" uuid;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "createdBy" uuid;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_createdBy_users_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_createdBy_users_id_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id");