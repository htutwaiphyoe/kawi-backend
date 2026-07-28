CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(255) NOT NULL,
	"email" varchar(255) UNIQUE,
	"phone" varchar(20),
	"bio" varchar(1000),
	"nationality" varchar(100),
	"birthDate" date,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" varchar(255) NOT NULL,
	"authorId" uuid NOT NULL,
	"isbn" varchar(20) UNIQUE,
	"description" varchar(1000),
	"price" numeric(10,2) NOT NULL,
	"publishedDate" date NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "books_price_non_negative" CHECK ("price" >= 0),
	CONSTRAINT "books_stock_non_negative" CHECK ("stock" >= 0)
);
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_authorId_authors_id_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE;