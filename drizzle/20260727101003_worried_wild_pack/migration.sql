CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"bookId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" varchar(1000),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_book_user_key" UNIQUE("bookId","userId"),
	CONSTRAINT "reviews_rating_range" CHECK ("rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "ratingsAverage" numeric(3,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "ratingsCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookId_books_id_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;