CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"userId" uuid NOT NULL,
	"bookId" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_user_book_key" UNIQUE("userId","bookId"),
	CONSTRAINT "cart_items_quantity_range" CHECK ("quantity" between 1 and 99)
);
--> statement-breakpoint
CREATE INDEX "cart_items_user_id_idx" ON "cart_items" ("userId");--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_bookId_books_id_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE;