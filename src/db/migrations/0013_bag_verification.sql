CREATE TABLE "delivery_verifications" (
	"project_id" text NOT NULL,
	"delivery_id" text PRIMARY KEY NOT NULL,
	"verified_by" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text NOT NULL,
	"bag_code_count" integer NOT NULL,
	"verified_qty" numeric(14, 3) NOT NULL,
	CONSTRAINT "delivery_verification_scope" UNIQUE("project_id","delivery_id"),
	CONSTRAINT "delivery_verification_count" CHECK ("delivery_verifications"."bag_code_count" between 0 and 5000),
	CONSTRAINT "delivery_verification_qty" CHECK ("delivery_verifications"."verified_qty" > 0 and ("delivery_verifications"."bag_code_count" = 0 or "delivery_verifications"."bag_code_count" = "delivery_verifications"."verified_qty"))
);
--> statement-breakpoint
CREATE TABLE "material_bag_codes" (
	"project_id" text NOT NULL,
	"code" text NOT NULL,
	"delivery_id" text NOT NULL,
	"material_id" text NOT NULL,
	"consumed_by" text,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "material_bag_codes_project_id_code_pk" PRIMARY KEY("project_id","code"),
	CONSTRAINT "bag_code_consumption_pair" CHECK (("material_bag_codes"."consumed_by" is null) = ("material_bag_codes"."consumed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "tracks_bags" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_verifications" ADD CONSTRAINT "delivery_verification_movement" FOREIGN KEY ("project_id","delivery_id") REFERENCES "public"."stock_movements"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_verifications" ADD CONSTRAINT "delivery_verification_actor" FOREIGN KEY ("project_id","verified_by") REFERENCES "public"."project_members"("project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_bag_codes" ADD CONSTRAINT "bag_code_delivery_scope" FOREIGN KEY ("project_id","delivery_id") REFERENCES "public"."delivery_verifications"("project_id","delivery_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_bag_codes" ADD CONSTRAINT "bag_code_material_scope" FOREIGN KEY ("project_id","material_id") REFERENCES "public"."materials"("project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_bag_codes" ADD CONSTRAINT "bag_code_usage_scope" FOREIGN KEY ("project_id","consumed_by") REFERENCES "public"."stock_movements"("project_id","id") ON DELETE no action ON UPDATE no action;