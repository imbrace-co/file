CREATE TYPE "storage_type" AS ENUM('s3', 'local');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"filename" varchar(500) NOT NULL,
	"original_filename" varchar(500) NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"size" bigint NOT NULL,
	"storageType" "storage_type" NOT NULL,
	"storage_path" varchar(1000) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_files" (
	"id" varchar(36) PRIMARY KEY,
	"file_name" varchar(255) NOT NULL,
	"original_url" text NOT NULL,
	"updated_link" text,
	"organization_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "financial_files_org_idx" ON "financial_files" ("organization_id");