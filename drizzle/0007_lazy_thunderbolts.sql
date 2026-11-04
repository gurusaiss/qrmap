ALTER TABLE "reviews" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "replied_at" timestamp with time zone;