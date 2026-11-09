CREATE TYPE "public"."admission_status" AS ENUM('submitted', 'under_review', 'waitlisted', 'approved', 'rejected', 'converted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."attendance_source" AS ENUM('manual', 'biometric', 'imported', 'derived_from_leave');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'leave');--> statement-breakpoint
CREATE TYPE "public"."audit_result" AS ENUM('success', 'failure', 'denied');--> statement-breakpoint
CREATE TYPE "public"."biometric_event_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."biometric_scan_kind" AS ENUM('check_in', 'check_out', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."biometric_verification" AS ENUM('verified', 'unknown_person', 'duplicate', 'out_of_window', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('open', 'under_review', 'resolved', 'dismissed', 'escalated');--> statement-breakpoint
CREATE TYPE "public"."diary_status" AS ENUM('draft', 'assigned', 'closed');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('pending_verification', 'verified', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('b_form', 'birth_certificate', 'transfer_certificate', 'previous_result_card', 'national_id', 'photo', 'medical_certificate', 'other');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sending', 'sent', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'on_leave', 'resigned', 'terminated', 'retired');--> statement-breakpoint
CREATE TYPE "public"."employee_type" AS ENUM('teacher', 'accountant', 'floor_incharge', 'hr', 'admin', 'other_staff');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('full_time', 'part_time', 'contract', 'visiting');--> statement-breakpoint
CREATE TYPE "public"."examination_type" AS ENUM('daily_test', 'monthly_test', 'grand_test', 'midterm', 'annual', 'quiz', 'assignment');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('salary', 'utilities', 'maintenance', 'supplies', 'transport', 'events', 'marketing', 'tax', 'other');--> statement-breakpoint
CREATE TYPE "public"."extra_period_reason" AS ENUM('replacement', 'substitution', 'additional_class', 'exam_duty', 'invigilation', 'other');--> statement-breakpoint
CREATE TYPE "public"."fee_frequency" AS ENUM('one_time', 'monthly', 'quarterly', 'annual', 'term');--> statement-breakpoint
CREATE TYPE "public"."fee_status" AS ENUM('pending', 'partial', 'paid', 'overdue', 'deferred', 'waived', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other', 'undisclosed');--> statement-breakpoint
CREATE TYPE "public"."guardian_contact_type" AS ENUM('primary', 'secondary', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."guardian_relationship" AS ENUM('father', 'mother', 'grandparent', 'sibling', 'uncle_aunt', 'legal_guardian', 'foster_guardian', 'other');--> statement-breakpoint
CREATE TYPE "public"."institution_kind" AS ENUM('school', 'college');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."leave_requested_by" AS ENUM('guardian', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('sick', 'family_emergency', 'academic', 'travel', 'sports', 'other');--> statement-breakpoint
CREATE TYPE "public"."notification_audience" AS ENUM('user', 'role', 'department', 'class', 'section', 'student', 'guardian', 'teacher', 'everyone');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email', 'both');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('pending', 'delivered', 'read', 'failed', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank_transfer', 'cheque', 'online_gateway', 'card', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'completed', 'failed', 'reversed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payroll_status" AS ENUM('draft', 'calculated', 'approved', 'paid', 'locked');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'published', 'locked');--> statement-breakpoint
CREATE TYPE "public"."replacement_resolution" AS ENUM('replacement_teacher', 'alternative_activity', 'test', 'self_study', 'period_cancelled');--> statement-breakpoint
CREATE TYPE "public"."salary_structure" AS ENUM('fixed', 'unit_based');--> statement-breakpoint
CREATE TYPE "public"."schedule_kind" AS ENUM('lesson', 'free', 'extra', 'exam');--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('draft', 'published', 'locked');--> statement-breakpoint
CREATE TYPE "public"."setting_value_type" AS ENUM('string', 'number', 'boolean', 'json', 'date');--> statement-breakpoint
CREATE TYPE "public"."student_lifecycle" AS ENUM('admitted', 'active', 'promoted', 'graduated', 'transferred', 'withdrawn', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."subject_kind" AS ENUM('theory', 'practical', 'both');--> statement-breakpoint
CREATE TYPE "public"."transaction_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."transaction_kind" AS ENUM('fee_collection', 'salary_payment', 'refund', 'expense', 'income', 'adjustment', 'opening_balance');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'inactive', 'suspended', 'revoked');--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" varchar(32) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"consumed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" varchar(512),
	CONSTRAINT "security_events_kind_check" CHECK ("security_events"."kind" in ('email_verification', 'password_reset', 'email_change', 'two_factor_setup'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"user_agent" varchar(512),
	"ip_address" varchar(45),
	"issued_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"revoked_reason" varchar(64),
	"correlation_id" varchar(64),
	CONSTRAINT "sessions_expiry_after_issue" CHECK ("sessions"."expires_at" > "sessions"."issued_at")
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text,
	"algorithm" varchar(64),
	"parameters" jsonb,
	"rotated_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_credentials_hash_algorithm_pair" CHECK (("user_credentials"."password_hash" is null and "user_credentials"."algorithm" is null) or ("user_credentials"."password_hash" is not null and "user_credentials"."algorithm" is not null))
);
--> statement-breakpoint
CREATE TABLE "user_institutions" (
	"user_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"affiliation" varchar(32) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_institutions_user_id_institution_id_pk" PRIMARY KEY("user_id","institution_id"),
	CONSTRAINT "user_institutions_affiliation_check" CHECK ("user_institutions"."affiliation" in ('staff', 'guardian', 'student', 'management'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(32),
	"image_url" varchar(2048),
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"last_login_at" timestamp (3) with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "permission_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid,
	"user_id" uuid,
	"permission_id" uuid NOT NULL,
	"scope_type" varchar(32) NOT NULL,
	"scope_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"conditions" jsonb,
	CONSTRAINT "permission_scopes_single_owner_check" CHECK (num_nonnulls("permission_scopes"."role_id", "permission_scopes"."user_id") = 1),
	CONSTRAINT "permission_scopes_scope_type_check" CHECK ("permission_scopes"."scope_type" in ('institution', 'department', 'class', 'group', 'section', 'subject'))
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"describe" text NOT NULL,
	"institution_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_check" CHECK ("permissions"."key" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"name" varchar(160) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"description" text,
	"is_system_role" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"effect" varchar(8) NOT NULL,
	"institution_id" uuid,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid,
	"reason" text,
	"revoked_at" timestamp (3) with time zone,
	"revoked_by_user_id" uuid,
	CONSTRAINT "user_permissions_effect_check" CHECK ("user_permissions"."effect" in ('grant', 'deny')),
	CONSTRAINT "user_permissions_deny_requires_reason" CHECK ("user_permissions"."effect" <> 'deny' or "user_permissions"."reason" is not null),
	CONSTRAINT "user_permissions_revocation_pair" CHECK (num_nonnulls("user_permissions"."revoked_at", "user_permissions"."revoked_by_user_id") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"institution_id" uuid,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid,
	"revoked_at" timestamp (3) with time zone,
	"revoked_by_user_id" uuid,
	CONSTRAINT "user_roles_revocation_pair" CHECK (num_nonnulls("user_roles"."revoked_at", "user_roles"."revoked_by_user_id") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "academic_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "academic_sessions_date_order_check" CHECK ("academic_sessions"."end_date" >= "academic_sessions"."start_date")
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"name" varchar(160) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"address" varchar(500),
	"phone" varchar(32),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"description" text,
	"head_user_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "designations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"department_id" uuid,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"building_id" uuid,
	"name" varchar(160) NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"code" varchar(32),
	"kind" "institution_kind" DEFAULT 'school' NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(32),
	"address" varchar(500),
	"website" varchar(2048),
	"logo_url" varchar(2048),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "institutions_slug_check" CHECK ("institutions"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "class_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"class_id" uuid,
	"group_id" uuid,
	"section_id" uuid,
	"periods_per_week" integer,
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	CONSTRAINT "class_subjects_single_scope_check" CHECK (num_nonnulls("class_subjects"."class_id", "class_subjects"."group_id", "class_subjects"."section_id") = 1),
	CONSTRAINT "class_subjects_periods_positive_check" CHECK ("class_subjects"."periods_per_week" is null or "class_subjects"."periods_per_week" > 0)
);
--> statement-breakpoint
CREATE TABLE "class_teacher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"subject_id" uuid,
	"class_id" uuid,
	"group_id" uuid,
	"section_id" uuid,
	"academic_session_id" uuid NOT NULL,
	"is_class_teacher" boolean DEFAULT false NOT NULL,
	"assigned_from" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"assigned_until" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_teacher_assignments_single_scope_check" CHECK (num_nonnulls("class_teacher_assignments"."class_id", "class_teacher_assignments"."group_id", "class_teacher_assignments"."section_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"grade_level" integer NOT NULL,
	"department_id" uuid,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floor_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"floor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_from" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"assigned_until" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_change_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"reason" varchar(500),
	"created_by_user_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"previous_state" jsonb
);
--> statement-breakpoint
CREATE TABLE "schedule_publish_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"from_status" "schedule_status" NOT NULL,
	"to_status" "schedule_status" NOT NULL,
	"published_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"published_by_user_id" uuid,
	"reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid,
	"teacher_id" uuid,
	"time_slot_id" uuid NOT NULL,
	"floor_id" uuid,
	"kind" "schedule_kind" DEFAULT 'lesson' NOT NULL,
	"status" "schedule_status" DEFAULT 'draft' NOT NULL,
	"replacement_assignment_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"capacity" integer,
	"floor_id" uuid,
	"campus_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sections_capacity_positive_check" CHECK ("sections"."capacity" is null or "sections"."capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"code" varchar(32) NOT NULL,
	"kind" "subject_kind" DEFAULT 'theory' NOT NULL,
	"department_id" uuid,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid,
	"name" varchar(160) NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"sequence" integer NOT NULL,
	"is_break" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "time_slots_time_order_check" CHECK ("time_slots"."end_time" > "time_slots"."start_time"),
	CONSTRAINT "time_slots_sequence_positive_check" CHECK ("time_slots"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "student_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"document_type" varchar(32) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"original_file_name" varchar(255),
	"status" varchar(32) DEFAULT 'pending_verification' NOT NULL,
	"verified_by_user_id" uuid,
	"verified_at" timestamp (3) with time zone,
	"rejection_reason" varchar(500),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_documents_type_check" CHECK ("student_documents"."document_type" in ('b_form', 'birth_certificate', 'transfer_certificate', 'previous_result_card', 'national_id', 'photo', 'medical_certificate', 'other')),
	CONSTRAINT "student_documents_status_check" CHECK ("student_documents"."status" in ('pending_verification', 'verified', 'rejected', 'expired')),
	CONSTRAINT "student_documents_verification_pair" CHECK ("student_documents"."status" <> 'verified' or "student_documents"."verified_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "student_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"academic_year" varchar(32) NOT NULL,
	"grade_level" integer,
	"department_id" uuid,
	"enrolled_on" date NOT NULL,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_guardian_visible" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_placements" (
	"student_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"placed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"placement_reason" varchar(32),
	"created_by_user_id" uuid,
	CONSTRAINT "student_placements_student_id_academic_session_id_pk" PRIMARY KEY("student_id","academic_session_id"),
	CONSTRAINT "student_placements_reason_check" CHECK ("student_placements"."placement_reason" is null or "student_placements"."placement_reason" in ('admission', 'promotion', 'transfer', 're_admission'))
);
--> statement-breakpoint
CREATE TABLE "student_previous_schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"address" varchar(500),
	"phone" varchar(32),
	"class_attended" varchar(64),
	"tc_number" varchar(64),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"admission_number" varchar(64) NOT NULL,
	"first_name" varchar(120) NOT NULL,
	"middle_name" varchar(120),
	"last_name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"date_of_birth" date,
	"gender" "gender",
	"email" varchar(320) NOT NULL,
	"phone" varchar(32),
	"address" varchar(500),
	"photo_url" varchar(512),
	"roll_number" varchar(32),
	"lifecycle" "student_lifecycle" DEFAULT 'admitted' NOT NULL,
	"admitted_at" timestamp (3) with time zone,
	"graduated_at" timestamp (3) with time zone,
	"withdrawn_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emergency_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_user_id" uuid,
	"name" varchar(160) NOT NULL,
	"phone" varchar(32),
	"priority" integer DEFAULT 1 NOT NULL,
	"relation" varchar(64),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emergency_contacts_priority_check" CHECK ("emergency_contacts"."priority" > 0),
	CONSTRAINT "emergency_contacts_phone_required" CHECK ("emergency_contacts"."phone" is not null or "emergency_contacts"."guardian_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "guardian_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"scope" varchar(64) NOT NULL,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone,
	"granted_by_user_id" uuid NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"revoked_by_user_id" uuid,
	"notes" text,
	CONSTRAINT "guardian_authorizations_expiry_check" CHECK ("guardian_authorizations"."expires_at" is null or "guardian_authorizations"."expires_at" > "guardian_authorizations"."granted_at")
);
--> statement-breakpoint
CREATE TABLE "guardian_links" (
	"guardian_user_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"relationship" "guardian_relationship" NOT NULL,
	"contact_type" "guardian_contact_type",
	"is_fee_payer" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"receives_notifications" boolean DEFAULT true NOT NULL,
	"linked_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"linked_by_user_id" uuid,
	"unlinked_at" timestamp (3) with time zone,
	"unlinked_by_user_id" uuid,
	"unlink_reason" varchar(500),
	CONSTRAINT "guardian_links_guardian_user_id_student_id_pk" PRIMARY KEY("guardian_user_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_name" varchar(120) NOT NULL,
	"last_name" varchar(120) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(32),
	"occupation" varchar(120),
	"address" varchar(500),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_guardian_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"report_type" varchar(32) NOT NULL,
	"period_start" varchar(32),
	"period_end" varchar(32),
	"sent_at" timestamp (3) with time zone,
	"notification_id" uuid,
	"idempotency_key" varchar(160) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admission_checklist_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_id" uuid NOT NULL,
	"checklist_id" uuid NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"missing_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"completed_by_user_id" uuid,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_checklist_completions_pair" CHECK ("admission_checklist_completions"."is_complete" = false or ("admission_checklist_completions"."completed_at" is not null and "admission_checklist_completions"."completed_by_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "admission_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"items" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admission_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"original_file_name" varchar(255),
	"status" "document_status" DEFAULT 'pending_verification' NOT NULL,
	"verified_by_user_id" uuid,
	"verified_at" timestamp (3) with time zone,
	"rejection_reason" varchar(500),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_documents_verification_pair" CHECK ("admission_documents"."status" <> 'verified' or "admission_documents"."verified_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "admission_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_id" uuid NOT NULL,
	"from_status" "admission_status",
	"to_status" "admission_status" NOT NULL,
	"changed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"changed_by_user_id" uuid NOT NULL,
	"notes" text,
	CONSTRAINT "admission_status_history_no_self_transition" CHECK ("admission_status_history"."from_status" is null or "admission_status_history"."from_status" <> "admission_status_history"."to_status")
);
--> statement-breakpoint
CREATE TABLE "admission_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"class_id" uuid,
	"group_id" uuid,
	"opens_on" date NOT NULL,
	"closes_on" date NOT NULL,
	"capacity" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "admission_windows_date_order_check" CHECK ("admission_windows"."closes_on" >= "admission_windows"."opens_on"),
	CONSTRAINT "admission_windows_capacity_check" CHECK ("admission_windows"."capacity" is null or "admission_windows"."capacity" > 0),
	CONSTRAINT "admission_windows_single_scope_check" CHECK (num_nonnulls("admission_windows"."class_id", "admission_windows"."group_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "admissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"application_number" varchar(64) NOT NULL,
	"first_name" varchar(120) NOT NULL,
	"middle_name" varchar(120),
	"last_name" varchar(120) NOT NULL,
	"date_of_birth" date,
	"gender" "gender",
	"email" varchar(320) NOT NULL,
	"phone" varchar(32),
	"address" varchar(500),
	"slug" varchar(120) NOT NULL,
	"academic_session_id" uuid,
	"applied_class_id" uuid,
	"applied_group_id" uuid,
	"applied_grade_level" varchar(64),
	"status" "admission_status" DEFAULT 'submitted' NOT NULL,
	"student_id" uuid,
	"converted_at" timestamp (3) with time zone,
	"decided_at" timestamp (3) with time zone,
	"decided_by_user_id" uuid,
	"decision_notes" text,
	"rejection_reason" varchar(500),
	"test_score" numeric(8, 2),
	"interview_score" numeric(8, 2),
	"submitted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "admissions_scope_present_check" CHECK (num_nonnulls("admissions"."applied_class_id", "admissions"."applied_group_id", "admissions"."applied_grade_level") >= 1),
	CONSTRAINT "admissions_converted_pair" CHECK (("admissions"."status" = 'converted' and "admissions"."student_id" is not null and "admissions"."converted_at" is not null) or ("admissions"."status" <> 'converted' and "admissions"."student_id" is null)),
	CONSTRAINT "admissions_rejection_reason_check" CHECK ("admissions"."status" <> 'rejected' or "admissions"."rejection_reason" is not null),
	CONSTRAINT "admissions_score_range_check" CHECK (("admissions"."test_score" is null or "admissions"."test_score" >= 0) and ("admissions"."interview_score" is null or "admissions"."interview_score" >= 0))
);
--> statement-breakpoint
CREATE TABLE "employee_attendance" (
	"employee_id" uuid NOT NULL,
	"attendance_date" date NOT NULL,
	"check_in_at" timestamp (3) with time zone,
	"check_out_at" timestamp (3) with time zone,
	"status" varchar(16) DEFAULT 'present' NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"leave_request_id" uuid,
	"marked_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "employee_attendance_employee_id_attendance_date_pk" PRIMARY KEY("employee_id","attendance_date"),
	CONSTRAINT "employee_attendance_status_check" CHECK ("employee_attendance"."status" in ('present', 'absent', 'late', 'leave')),
	CONSTRAINT "employee_attendance_source_check" CHECK ("employee_attendance"."source" in ('manual', 'biometric')),
	CONSTRAINT "employee_attendance_leave_pair" CHECK ("employee_attendance"."status" <> 'leave' or "employee_attendance"."leave_request_id" is not null),
	CONSTRAINT "employee_attendance_ordering_check" CHECK ("employee_attendance"."check_out_at" is null or "employee_attendance"."check_in_at" is null or "employee_attendance"."check_out_at" >= "employee_attendance"."check_in_at")
);
--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"original_file_name" varchar(255),
	"status" "document_status" DEFAULT 'pending_verification' NOT NULL,
	"expires_on" date,
	"verified_by_user_id" uuid,
	"verified_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_documents_verification_pair" CHECK ("employee_documents"."status" <> 'verified' or "employee_documents"."verified_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "employee_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"from_status" "employee_status",
	"to_status" "employee_status" NOT NULL,
	"changed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"changed_by_user_id" uuid NOT NULL,
	"notes" text,
	CONSTRAINT "employee_status_history_no_self_transition" CHECK ("employee_status_history"."from_status" is null or "employee_status_history"."from_status" <> "employee_status_history"."to_status")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"employee_code" varchar(64) NOT NULL,
	"employee_type" "employee_type" NOT NULL,
	"employment_type" "employment_type" DEFAULT 'full_time' NOT NULL,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"department_id" uuid,
	"designation_id" uuid,
	"joining_date" date NOT NULL,
	"leaving_date" date,
	"bank_account_iban" varchar(64),
	"emergency_contact_name" varchar(160),
	"phone" varchar(32),
	"notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "employees_leaving_date_check" CHECK ("employees"."leaving_date" is null or "employees"."leaving_date" >= "employees"."joining_date"),
	CONSTRAINT "employees_status_leaving_pair" CHECK (("employees"."leaving_date" is null) = ("employees"."status" in ('active', 'on_leave')))
);
--> statement-breakpoint
CREATE TABLE "hr_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" jsonb NOT NULL,
	"audience" varchar(64) DEFAULT 'all' NOT NULL,
	"published_at" timestamp (3) with time zone,
	"retracted_at" timestamp (3) with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"leave_request_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"original_file_name" varchar(255),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid,
	"employee_id" uuid,
	"leave_type_id" uuid NOT NULL,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"total_days" integer NOT NULL,
	"count_partial_days" boolean DEFAULT true NOT NULL,
	"reason" text NOT NULL,
	"requested_by" "leave_requested_by" DEFAULT 'guardian' NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"requested_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp (3) with time zone,
	"decision_notes" text,
	"applied_to_attendance_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "leave_requests_date_order_check" CHECK ("leave_requests"."to_date" >= "leave_requests"."from_date"),
	CONSTRAINT "leave_requests_total_days_check" CHECK ("leave_requests"."total_days" > 0),
	CONSTRAINT "leave_requests_single_subject_check" CHECK (num_nonnulls("leave_requests"."student_id", "leave_requests"."employee_id") = 1),
	CONSTRAINT "leave_requests_decision_pair" CHECK ("leave_requests"."status" in ('pending') or ("leave_requests"."decided_by_user_id" is not null and "leave_requests"."decided_at" is not null)),
	CONSTRAINT "leave_requests_rejection_notes_check" CHECK ("leave_requests"."status" <> 'rejected' or "leave_requests"."decision_notes" is not null)
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(32) NOT NULL,
	"type" "leave_type" NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"deducts_from_salary" boolean DEFAULT false NOT NULL,
	"max_consecutive_days" integer,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "leave_types_max_days_check" CHECK ("leave_types"."max_consecutive_days" is null or "leave_types"."max_consecutive_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "salary_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"salary_structure_id" uuid,
	"amount" numeric(18, 2),
	"currency" varchar(3) NOT NULL,
	"overrides_structure" boolean DEFAULT false NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"approved_by_user_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_assignments_effective_order_check" CHECK ("salary_assignments"."effective_to" is null or "salary_assignments"."effective_to" > "salary_assignments"."effective_from"),
	CONSTRAINT "salary_assignments_override_requires_amount" CHECK ("salary_assignments"."overrides_structure" = false or "salary_assignments"."amount" is not null)
);
--> statement-breakpoint
CREATE TABLE "salary_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"structure" "salary_structure" NOT NULL,
	"designation_id" uuid,
	"department_id" uuid,
	"employee_type" "employee_type",
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"unit_rate" numeric(18, 2),
	"periods_per_day" integer,
	"working_days_per_month" integer,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "salary_structures_currency_check" CHECK ("salary_structures"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "salary_structures_effective_order_check" CHECK ("salary_structures"."effective_to" is null or "salary_structures"."effective_to" > "salary_structures"."effective_from"),
	CONSTRAINT "salary_structures_unit_based_denominators_check" CHECK ("salary_structures"."structure" <> 'unit_based' or ("salary_structures"."unit_rate" is not null and "salary_structures"."periods_per_day" is not null and "salary_structures"."working_days_per_month" is not null)),
	CONSTRAINT "salary_structures_unit_rate_non_negative" CHECK ("salary_structures"."unit_rate" is null or "salary_structures"."unit_rate" >= 0),
	CONSTRAINT "salary_structures_positive_amount" CHECK ("salary_structures"."amount" >= 0),
	CONSTRAINT "salary_structures_has_dimension_check" CHECK (num_nonnulls("salary_structures"."designation_id", "salary_structures"."department_id", "salary_structures"."employee_type") >= 1)
);
--> statement-breakpoint
CREATE TABLE "teacher_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"original_file_name" varchar(255),
	"status" "document_status" DEFAULT 'pending_verification' NOT NULL,
	"expires_on" date,
	"verified_by_user_id" uuid,
	"verified_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_documents_verification_pair" CHECK ("teacher_documents"."status" <> 'verified' or "teacher_documents"."verified_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "teacher_leave_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"days_entitled" integer NOT NULL,
	"days_used" integer DEFAULT 0 NOT NULL,
	"days_carried_over" integer DEFAULT 0 NOT NULL,
	"calculated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_leave_balances_entitled_check" CHECK ("teacher_leave_balances"."days_entitled" >= 0),
	CONSTRAINT "teacher_leave_balances_used_check" CHECK ("teacher_leave_balances"."days_used" >= 0),
	CONSTRAINT "teacher_leave_balances_carried_check" CHECK ("teacher_leave_balances"."days_carried_over" >= 0)
);
--> statement-breakpoint
CREATE TABLE "teacher_qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"qualification_type" varchar(32) NOT NULL,
	"name" varchar(200) NOT NULL,
	"field_of_study" varchar(160),
	"issuing_body" varchar(200),
	"obtained_on" date,
	"expires_on" date,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_qualifications_expiry_check" CHECK ("teacher_qualifications"."expires_on" is null or "teacher_qualifications"."obtained_on" is null or "teacher_qualifications"."expires_on" > "teacher_qualifications"."obtained_on")
);
--> statement-breakpoint
CREATE TABLE "teacher_subjects" (
	"teacher_user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_by_user_id" uuid,
	"verified_at" timestamp (3) with time zone,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_subjects_teacher_user_id_subject_id_pk" PRIMARY KEY("teacher_user_id","subject_id"),
	CONSTRAINT "teacher_subjects_verification_pair" CHECK ("teacher_subjects"."is_verified" = false or ("teacher_subjects"."verified_by_user_id" is not null and "teacher_subjects"."verified_at" is not null)),
	CONSTRAINT "teacher_subjects_effective_order_check" CHECK ("teacher_subjects"."effective_to" is null or "teacher_subjects"."effective_to" > "teacher_subjects"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "teacher_workload_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"periods_taught" integer DEFAULT 0 NOT NULL,
	"extra_periods_taught" integer DEFAULT 0 NOT NULL,
	"sections_taught" integer DEFAULT 0 NOT NULL,
	"calculated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_workload_history_periods_check" CHECK ("teacher_workload_history"."periods_taught" >= 0),
	CONSTRAINT "teacher_workload_history_extra_check" CHECK ("teacher_workload_history"."extra_periods_taught" >= 0),
	CONSTRAINT "teacher_workload_history_sections_check" CHECK ("teacher_workload_history"."sections_taught" >= 0)
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"institution_id" uuid NOT NULL,
	"employee_code" varchar(64),
	"first_name" varchar(120) NOT NULL,
	"last_name" varchar(120) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(32),
	"department_id" uuid,
	"subject_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"registration_number" varchar(64),
	"qualification" varchar(160),
	"max_periods_per_day" integer,
	"bio" text,
	"photo_url" varchar(512),
	"hired_on" date,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "teachers_max_periods_check" CHECK ("teachers"."max_periods_per_day" is null or "teachers"."max_periods_per_day" > 0)
);
--> statement-breakpoint
CREATE TABLE "attendance_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"attendance_date" date NOT NULL,
	"time_slot_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"before_status" varchar(16) NOT NULL,
	"after_status" "attendance_status" NOT NULL,
	"reason" text NOT NULL,
	"corrected_by_user_id" uuid NOT NULL,
	"corrected_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"guardian_disputed_at" timestamp (3) with time zone,
	CONSTRAINT "attendance_corrections_change_check" CHECK ("attendance_corrections"."before_status" <> "attendance_corrections"."after_status"::text)
);
--> statement-breakpoint
CREATE TABLE "attendance_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"attendance_date" date,
	"section_id" uuid,
	"device_id" uuid,
	"expected_count" integer,
	"observed_count" integer,
	"detail" text,
	"resolved_at" timestamp (3) with time zone,
	"resolved_by_user_id" uuid,
	"resolution_notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_exceptions_resolution_pair" CHECK ("attendance_exceptions"."resolved_at" is null or "attendance_exceptions"."resolved_by_user_id" is not null),
	CONSTRAINT "attendance_exceptions_kind_check" CHECK ("attendance_exceptions"."kind" in ('gate_count_mismatch', 'unknown_scan', 'duplicate_scan', 'unmarked_period', 'orphan_mark'))
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"section_id" uuid NOT NULL,
	"attendance_date" date NOT NULL,
	"time_slot_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"source" "attendance_source" DEFAULT 'manual' NOT NULL,
	"leave_request_id" uuid,
	"biometric_transaction_id" uuid,
	"minutes_late" integer,
	"marked_by_user_id" uuid,
	"marked_at" timestamp (3) with time zone,
	"remarks" varchar(255),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "attendance_records_section_id_attendance_date_time_slot_id_student_id_pk" PRIMARY KEY("section_id","attendance_date","time_slot_id","student_id"),
	CONSTRAINT "attendance_records_leave_pair" CHECK (("attendance_records"."status" = 'leave' and "attendance_records"."leave_request_id" is not null) or ("attendance_records"."status" <> 'leave' and "attendance_records"."leave_request_id" is null)),
	CONSTRAINT "attendance_records_biometric_pair" CHECK ("attendance_records"."source" <> 'biometric' or "attendance_records"."biometric_transaction_id" is not null),
	CONSTRAINT "attendance_records_leave_source_check" CHECK ("attendance_records"."status" <> 'leave' or "attendance_records"."source" = 'derived_from_leave'),
	CONSTRAINT "attendance_records_late_minutes_check" CHECK (("attendance_records"."status" = 'late' and "attendance_records"."minutes_late" is not null and "attendance_records"."minutes_late" > 0) or ("attendance_records"."status" <> 'late' and "attendance_records"."minutes_late" is null)),
	CONSTRAINT "attendance_records_manual_marked_by_check" CHECK ("attendance_records"."source" <> 'manual' or "attendance_records"."marked_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"attendance_date" date NOT NULL,
	"time_slot_id" uuid NOT NULL,
	"schedule_id" uuid,
	"status" varchar(16) DEFAULT 'in_progress' NOT NULL,
	"total_students" integer NOT NULL,
	"marked_count" integer DEFAULT 0 NOT NULL,
	"opened_by_user_id" uuid NOT NULL,
	"opened_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "attendance_sessions_status_check" CHECK ("attendance_sessions"."status" in ('in_progress', 'submitted')),
	CONSTRAINT "attendance_sessions_total_check" CHECK ("attendance_sessions"."total_students" >= 0),
	CONSTRAINT "attendance_sessions_marked_check" CHECK ("attendance_sessions"."marked_count" >= 0 and "attendance_sessions"."marked_count" <= "attendance_sessions"."total_students"),
	CONSTRAINT "attendance_sessions_submit_pair" CHECK ("attendance_sessions"."status" <> 'submitted' or ("attendance_sessions"."submitted_by_user_id" is not null and "attendance_sessions"."submitted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "daily_attendance_summaries" (
	"student_id" uuid NOT NULL,
	"month" varchar(7) NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"marked_periods" integer DEFAULT 0 NOT NULL,
	"present_count" integer DEFAULT 0 NOT NULL,
	"absent_count" integer DEFAULT 0 NOT NULL,
	"late_count" integer DEFAULT 0 NOT NULL,
	"leave_count" integer DEFAULT 0 NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"calculated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_attendance_summaries_student_id_month_pk" PRIMARY KEY("student_id","month"),
	CONSTRAINT "daily_attendance_summaries_counts_check" CHECK ("daily_attendance_summaries"."present_count" + "daily_attendance_summaries"."absent_count" + "daily_attendance_summaries"."late_count" + "daily_attendance_summaries"."leave_count" = "daily_attendance_summaries"."marked_periods"),
	CONSTRAINT "daily_attendance_summaries_month_format" CHECK ("daily_attendance_summaries"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "biometric_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"device_key" varchar(128) NOT NULL,
	"name" varchar(120) NOT NULL,
	"floor_id" uuid,
	"campus_id" uuid,
	"firmware_version" varchar(64),
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp (3) with time zone,
	"installed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "biometric_devices_status_check" CHECK ("biometric_devices"."status" in ('active', 'maintenance', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "biometric_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"person_kind" varchar(16) NOT NULL,
	"student_id" uuid,
	"employee_id" uuid,
	"template_ref" varchar(256) NOT NULL,
	"finger_label" varchar(32),
	"enrolled_by_user_id" uuid NOT NULL,
	"enrolled_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"revoked_by_user_id" uuid,
	"revocation_reason" varchar(500),
	CONSTRAINT "biometric_enrollments_person_kind_check" CHECK ("biometric_enrollments"."person_kind" in ('student', 'employee')),
	CONSTRAINT "biometric_enrollments_single_person_check" CHECK (("biometric_enrollments"."person_kind" = 'student' and "biometric_enrollments"."student_id" is not null and "biometric_enrollments"."employee_id" is null) or ("biometric_enrollments"."person_kind" = 'employee' and "biometric_enrollments"."employee_id" is not null and "biometric_enrollments"."student_id" is null))
);
--> statement-breakpoint
CREATE TABLE "biometric_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"device_event_id" varchar(128) NOT NULL,
	"enrolled_template_ref" varchar(256) NOT NULL,
	"student_id" uuid,
	"employee_id" uuid,
	"scan_kind" varchar(16) DEFAULT 'unknown' NOT NULL,
	"direction" varchar(8),
	"device_time" timestamp (3) with time zone NOT NULL,
	"received_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"verification" varchar(24) DEFAULT 'unknown_person' NOT NULL,
	"match_score" numeric(5, 2),
	"resolved_time_slot_id" uuid,
	"resolved_attendance_student_id" uuid,
	"raw_payload" text,
	"processed_at" timestamp (3) with time zone,
	CONSTRAINT "biometric_transactions_scan_kind_check" CHECK ("biometric_transactions"."scan_kind" in ('check_in', 'check_out', 'unknown')),
	CONSTRAINT "biometric_transactions_direction_check" CHECK ("biometric_transactions"."direction" is null or "biometric_transactions"."direction" in ('in', 'out')),
	CONSTRAINT "biometric_transactions_verification_check" CHECK ("biometric_transactions"."verification" in ('verified', 'unknown_person', 'duplicate', 'out_of_window', 'rejected')),
	CONSTRAINT "biometric_transactions_verified_person_check" CHECK ("biometric_transactions"."verification" <> 'verified' or num_nonnulls("biometric_transactions"."student_id", "biometric_transactions"."employee_id") = 1),
	CONSTRAINT "biometric_transactions_out_of_window_check" CHECK ("biometric_transactions"."verification" <> 'out_of_window' or "biometric_transactions"."resolved_time_slot_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "extra_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"replaces_schedule_id" uuid,
	"teacher_id" uuid,
	"section_id" uuid,
	"time_slot_id" uuid NOT NULL,
	"extra_date" date NOT NULL,
	"reason" "extra_period_reason" NOT NULL,
	"resolution" "replacement_resolution",
	"is_payable" boolean DEFAULT false NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp (3) with time zone,
	"absence_id" uuid,
	"consumed_by_pay_line_id" uuid,
	"notes" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "extra_periods_payable_approval_pair" CHECK ("extra_periods"."is_payable" = false or ("extra_periods"."approved_by_user_id" is not null and "extra_periods"."approved_at" is not null)),
	CONSTRAINT "extra_periods_replacement_requires_schedule" CHECK ("extra_periods"."reason" not in ('replacement', 'substitution') or "extra_periods"."replaces_schedule_id" is not null),
	CONSTRAINT "extra_periods_resolution_teacher_pair" CHECK ("extra_periods"."resolution" is null or "extra_periods"."resolution" in ('test', 'self_study', 'alternative_activity', 'period_cancelled') or "extra_periods"."teacher_id" is not null),
	CONSTRAINT "extra_periods_payable_teacher_check" CHECK ("extra_periods"."is_payable" = false or "extra_periods"."teacher_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "floor_incident_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"floor_id" uuid,
	"section_id" uuid,
	"reported_by_user_id" uuid NOT NULL,
	"severity" varchar(16) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"description" text NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"reported_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"escalated_at" timestamp (3) with time zone,
	"escalated_to_user_id" uuid,
	"resolved_at" timestamp (3) with time zone,
	"resolved_by_user_id" uuid,
	"resolution_notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floor_incident_reports_severity_check" CHECK ("floor_incident_reports"."severity" in ('low', 'medium', 'high', 'critical')),
	CONSTRAINT "floor_incident_reports_resolution_pair" CHECK ("floor_incident_reports"."resolved_at" is null or ("floor_incident_reports"."resolved_by_user_id" is not null and "floor_incident_reports"."resolution_notes" is not null)),
	CONSTRAINT "floor_incident_reports_escalation_pair" CHECK ("floor_incident_reports"."escalated_at" is null or "floor_incident_reports"."escalated_to_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "floor_live_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"floor_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"attendance_date" date NOT NULL,
	"time_slot_id" uuid NOT NULL,
	"section_id" uuid,
	"subject_id" uuid,
	"teacher_id" uuid,
	"substitute_teacher_id" uuid,
	"status" varchar(16) NOT NULL,
	"attendance_submitted" boolean,
	"as_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "floor_live_snapshots_status_check" CHECK ("floor_live_snapshots"."status" in ('as_scheduled', 'substitute', 'free', 'unmarked', 'cancelled')),
	CONSTRAINT "floor_live_snapshots_substitute_pair" CHECK ("floor_live_snapshots"."status" <> 'substitute' or "floor_live_snapshots"."substitute_teacher_id" is not null),
	CONSTRAINT "floor_live_snapshots_attendance_pair" CHECK ("floor_live_snapshots"."attendance_submitted" is null or "floor_live_snapshots"."status" not in ('free', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "teacher_absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"absence_date" date NOT NULL,
	"scope" varchar(16) DEFAULT 'day' NOT NULL,
	"start_time_slot_id" uuid,
	"end_time_slot_id" uuid,
	"reason" text,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"leave_request_id" uuid,
	"reported_by_user_id" uuid,
	"reported_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_absences_scope_check" CHECK ("teacher_absences"."scope" in ('day', 'period', 'partial')),
	CONSTRAINT "teacher_absences_source_check" CHECK ("teacher_absences"."source" in ('manual', 'biometric', 'leave_request')),
	CONSTRAINT "teacher_absences_day_scope_check" CHECK ("teacher_absences"."scope" <> 'day' or ("teacher_absences"."start_time_slot_id" is null and "teacher_absences"."end_time_slot_id" is null)),
	CONSTRAINT "teacher_absences_period_scope_check" CHECK ("teacher_absences"."scope" <> 'period' or ("teacher_absences"."start_time_slot_id" is not null and "teacher_absences"."end_time_slot_id" is not null)),
	CONSTRAINT "teacher_absences_partial_scope_check" CHECK ("teacher_absences"."scope" <> 'partial' or "teacher_absences"."start_time_slot_id" is not null),
	CONSTRAINT "teacher_absences_leave_pair" CHECK ("teacher_absences"."source" <> 'leave_request' or "teacher_absences"."leave_request_id" is not null),
	CONSTRAINT "teacher_absences_reporter_pair" CHECK ("teacher_absences"."source" = 'biometric' or "teacher_absences"."reported_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "exam_marks_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"examination_mark_id" uuid NOT NULL,
	"previous_marks" numeric(8, 2),
	"corrected_marks" numeric(8, 2) NOT NULL,
	"reason" text NOT NULL,
	"corrected_by_user_id" uuid NOT NULL,
	"corrected_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp (3) with time zone,
	CONSTRAINT "exam_marks_corrections_change_check" CHECK ("exam_marks_corrections"."previous_marks" is null or "exam_marks_corrections"."previous_marks" <> "exam_marks_corrections"."corrected_marks"),
	CONSTRAINT "exam_marks_corrections_corrected_range_check" CHECK ("exam_marks_corrections"."corrected_marks" >= 0),
	CONSTRAINT "exam_marks_corrections_approval_pair" CHECK (num_nonnulls("exam_marks_corrections"."approved_by_user_id", "exam_marks_corrections"."approved_at") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "examination_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"examination_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"class_id" uuid,
	"section_id" uuid,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"obtained_marks" numeric(8, 2),
	"total_marks" numeric(8, 2) NOT NULL,
	"entered_by_user_id" uuid,
	"entered_at" timestamp (3) with time zone,
	"script_storage_key" varchar(512),
	"status_reason" text,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "examination_marks_total_positive" CHECK ("examination_marks"."total_marks" > 0),
	CONSTRAINT "examination_marks_range_check" CHECK ("examination_marks"."obtained_marks" is null or ("examination_marks"."obtained_marks" >= 0 and "examination_marks"."obtained_marks" <= "examination_marks"."total_marks")),
	CONSTRAINT "examination_marks_status_check" CHECK ("examination_marks"."status" in ('pending', 'absent', 'submitted', 'malpractice', 'withheld')),
	CONSTRAINT "examination_marks_marks_status_pair" CHECK (("examination_marks"."status" = 'submitted' and "examination_marks"."obtained_marks" is not null) or ("examination_marks"."status" <> 'submitted' and "examination_marks"."obtained_marks" is null)),
	CONSTRAINT "examination_marks_reason_required" CHECK ("examination_marks"."status" not in ('malpractice', 'withheld') or "examination_marks"."status_reason" is not null),
	CONSTRAINT "examination_marks_entry_pair" CHECK ("examination_marks"."obtained_marks" is null or "examination_marks"."entered_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "examination_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"examination_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'registered' NOT NULL,
	"seat_number" varchar(16),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"withdrawn_by_user_id" uuid,
	"withdrawal_reason" text,
	CONSTRAINT "examination_registrations_status_check" CHECK ("examination_registrations"."status" in ('registered', 'withdrawn', 'debarred', 'absent', 'submitted')),
	CONSTRAINT "examination_registrations_withdrawal_pair" CHECK ("examination_registrations"."status" not in ('withdrawn', 'debarred') or "examination_registrations"."withdrawal_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "examinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"examination_type" "examination_type" NOT NULL,
	"class_id" uuid,
	"section_id" uuid,
	"total_marks" numeric(8, 2) NOT NULL,
	"pass_marks" numeric(8, 2),
	"time_slot_id" uuid,
	"exam_date" date NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp (3) with time zone,
	"locked_at" timestamp (3) with time zone,
	"set_by_teacher_user_id" uuid,
	"question_paper_storage_key" varchar(512),
	"submission_deadline" timestamp (3) with time zone,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "examinations_total_marks_positive" CHECK ("examinations"."total_marks" > 0),
	CONSTRAINT "examinations_scope_check" CHECK ("examinations"."class_id" is not null or "examinations"."section_id" is not null),
	CONSTRAINT "examinations_pass_marks_check" CHECK ("examinations"."pass_marks" is null or ("examinations"."pass_marks" >= 0 and "examinations"."pass_marks" <= "examinations"."total_marks")),
	CONSTRAINT "examinations_publication_pair" CHECK ("examinations"."status" = 'draft' or "examinations"."published_at" is not null),
	CONSTRAINT "examinations_lock_pair" CHECK ("examinations"."status" <> 'locked' or "examinations"."locked_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "grading_bands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grading_scheme_id" uuid NOT NULL,
	"grade" varchar(16) NOT NULL,
	"min_percentage" numeric(5, 2),
	"min_marks" numeric(8, 2),
	"grade_point" numeric(4, 2),
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_pass" boolean DEFAULT false NOT NULL,
	CONSTRAINT "grading_bands_basis_match_check" CHECK (num_nonnulls("grading_bands"."min_percentage", "grading_bands"."min_marks") = 1),
	CONSTRAINT "grading_bands_percentage_range_check" CHECK ("grading_bands"."min_percentage" is null or ("grading_bands"."min_percentage" >= 0 and "grading_bands"."min_percentage" <= 100)),
	CONSTRAINT "grading_bands_marks_range_check" CHECK ("grading_bands"."min_marks" is null or "grading_bands"."min_marks" >= 0)
);
--> statement-breakpoint
CREATE TABLE "grading_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"academic_session_id" uuid,
	"subject_id" uuid,
	"basis" varchar(16) DEFAULT 'percentage' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "grading_schemes_basis_check" CHECK ("grading_schemes"."basis" in ('percentage', 'absolute'))
);
--> statement-breakpoint
CREATE TABLE "result_publication_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_result_id" uuid NOT NULL,
	"channel" varchar(16) NOT NULL,
	"published_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"published_by_user_id" uuid,
	"resend_reason" text,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"failure_reason" text,
	CONSTRAINT "result_publication_log_status_check" CHECK ("result_publication_log"."status" in ('queued', 'sent', 'delivered', 'failed')),
	CONSTRAINT "result_publication_log_failure_check" CHECK ("result_publication_log"."status" <> 'failed' or "result_publication_log"."failure_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "student_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"class_id" uuid,
	"section_id" uuid,
	"grading_scheme_id" uuid,
	"total_obtained_marks" numeric(12, 2),
	"total_maximum_marks" numeric(12, 2),
	"percentage" numeric(5, 2),
	"grade" varchar(16),
	"grade_point" numeric(4, 2),
	"result_status" varchar(16) NOT NULL,
	"subjects_passed" integer,
	"subjects_considered" integer,
	"subject_breakdown" jsonb,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp (3) with time zone,
	"computed_from" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "student_results_status_check" CHECK ("student_results"."result_status" in ('pass', 'fail', 'compartment', 'withheld')),
	CONSTRAINT "student_results_percentage_check" CHECK ("student_results"."percentage" is null or ("student_results"."percentage" >= 0 and "student_results"."percentage" <= 100)),
	CONSTRAINT "student_results_marks_pair" CHECK (num_nonnulls("student_results"."total_obtained_marks", "student_results"."total_maximum_marks") in (0, 2)),
	CONSTRAINT "student_results_marks_range_check" CHECK ("student_results"."total_obtained_marks" is null or ("student_results"."total_obtained_marks" >= 0 and "student_results"."total_obtained_marks" <= "student_results"."total_maximum_marks")),
	CONSTRAINT "student_results_subjects_pair" CHECK (num_nonnulls("student_results"."subjects_passed", "student_results"."subjects_considered") in (0, 2)),
	CONSTRAINT "student_results_publication_pair" CHECK ("student_results"."status" = 'draft' or "student_results"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "daily_test_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_test_evaluation_id" uuid NOT NULL,
	"previous_marks" numeric(8, 2),
	"corrected_marks" numeric(8, 2),
	"reason" text NOT NULL,
	"corrected_by_user_id" uuid NOT NULL,
	"corrected_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_test_corrections_change_check" CHECK ("daily_test_corrections"."previous_marks" is null or "daily_test_corrections"."previous_marks" <> "daily_test_corrections"."corrected_marks"),
	CONSTRAINT "daily_test_corrections_corrected_range_check" CHECK ("daily_test_corrections"."corrected_marks" >= 0)
);
--> statement-breakpoint
CREATE TABLE "daily_test_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_test_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid,
	"section_id" uuid,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"obtained_marks" numeric(8, 2),
	"percentage" numeric(5, 2),
	"entered_by_user_id" uuid,
	"entered_at" timestamp (3) with time zone,
	"status_reason" text,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "daily_test_evaluations_status_check" CHECK ("daily_test_evaluations"."status" in ('pending', 'present', 'absent', 'excused', 'malpractice')),
	CONSTRAINT "daily_test_evaluations_marks_pair" CHECK (("daily_test_evaluations"."status" = 'present' and "daily_test_evaluations"."obtained_marks" is not null) or ("daily_test_evaluations"."status" <> 'present' and "daily_test_evaluations"."obtained_marks" is null)),
	CONSTRAINT "daily_test_evaluations_marks_range_check" CHECK ("daily_test_evaluations"."obtained_marks" is null or "daily_test_evaluations"."obtained_marks" >= 0),
	CONSTRAINT "daily_test_evaluations_percentage_range_check" CHECK ("daily_test_evaluations"."percentage" is null or ("daily_test_evaluations"."percentage" >= 0 and "daily_test_evaluations"."percentage" <= 100)),
	CONSTRAINT "daily_test_evaluations_reason_required" CHECK ("daily_test_evaluations"."status" not in ('excused', 'malpractice') or "daily_test_evaluations"."status_reason" is not null),
	CONSTRAINT "daily_test_evaluations_entry_pair" CHECK ("daily_test_evaluations"."obtained_marks" is null or "daily_test_evaluations"."entered_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "daily_test_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_test_id" uuid NOT NULL,
	"channel" varchar(24) NOT NULL,
	"published_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"published_by_user_id" uuid,
	CONSTRAINT "daily_test_publications_channel_check" CHECK ("daily_test_publications"."channel" in ('student_portal', 'guardian_portal', 'print', 'export'))
);
--> statement-breakpoint
CREATE TABLE "daily_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"test_date" date NOT NULL,
	"total_marks" numeric(8, 2) NOT NULL,
	"class_id" uuid,
	"section_id" uuid,
	"created_by_teacher_user_id" uuid NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp (3) with time zone,
	"locked_at" timestamp (3) with time zone,
	"paper_storage_key" varchar(512),
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "daily_tests_total_marks_positive" CHECK ("daily_tests"."total_marks" > 0),
	CONSTRAINT "daily_tests_scope_check" CHECK ("daily_tests"."class_id" is not null or "daily_tests"."section_id" is not null),
	CONSTRAINT "daily_tests_publication_pair" CHECK ("daily_tests"."status" = 'draft' or "daily_tests"."published_at" is not null),
	CONSTRAINT "daily_tests_lock_pair" CHECK ("daily_tests"."status" <> 'locked' or "daily_tests"."locked_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "monthly_test_report_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monthly_test_report_id" uuid NOT NULL,
	"daily_test_id" uuid NOT NULL,
	"daily_test_evaluation_id" uuid NOT NULL,
	"used_percentage" numeric(5, 2),
	"weight" numeric(8, 2),
	CONSTRAINT "monthly_test_report_items_percentage_range_check" CHECK ("monthly_test_report_items"."used_percentage" is null or ("monthly_test_report_items"."used_percentage" >= 0 and "monthly_test_report_items"."used_percentage" <= 100)),
	CONSTRAINT "monthly_test_report_items_weight_check" CHECK ("monthly_test_report_items"."weight" is null or "monthly_test_report_items"."weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "monthly_test_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"tests_counted" integer NOT NULL,
	"average_percentage" numeric(5, 2),
	"class_id" uuid,
	"section_id" uuid,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp (3) with time zone,
	"email_sent_at" timestamp (3) with time zone,
	"email_idempotency_key" varchar(128),
	"superseded_by_report_id" uuid,
	"test_breakdown" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "monthly_test_reports_period_check" CHECK ("monthly_test_reports"."period_end" >= "monthly_test_reports"."period_start"),
	CONSTRAINT "monthly_test_reports_tests_counted_check" CHECK ("monthly_test_reports"."tests_counted" > 0),
	CONSTRAINT "monthly_test_reports_average_range_check" CHECK ("monthly_test_reports"."average_percentage" is null or ("monthly_test_reports"."average_percentage" >= 0 and "monthly_test_reports"."average_percentage" <= 100)),
	CONSTRAINT "monthly_test_reports_publication_pair" CHECK ("monthly_test_reports"."status" = 'draft' or "monthly_test_reports"."published_at" is not null),
	CONSTRAINT "monthly_test_reports_email_requires_publication" CHECK ("monthly_test_reports"."email_sent_at" is null or ("monthly_test_reports"."status" <> 'draft' and "monthly_test_reports"."published_at" is not null)),
	CONSTRAINT "monthly_test_reports_no_self_supersession" CHECK ("monthly_test_reports"."superseded_by_report_id" is null or "monthly_test_reports"."superseded_by_report_id" <> "monthly_test_reports"."id")
);
--> statement-breakpoint
CREATE TABLE "diaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"diary_date" date NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"class_id" uuid,
	"section_id" uuid,
	"status" "diary_status" DEFAULT 'draft' NOT NULL,
	"assigned_at" timestamp (3) with time zone,
	"assigned_by_teacher_user_id" uuid,
	"closed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "diaries_scope_check" CHECK ("diaries"."class_id" is not null or "diaries"."section_id" is not null),
	CONSTRAINT "diaries_assignment_pair" CHECK ("diaries"."status" = 'draft' or ("diaries"."assigned_at" is not null and "diaries"."assigned_by_teacher_user_id" is not null)),
	CONSTRAINT "diaries_closed_pair" CHECK ("diaries"."status" <> 'closed' or "diaries"."closed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "diary_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diary_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid,
	"section_id" uuid,
	"assigned_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"guardian_user_id" uuid,
	"acknowledged_at" timestamp (3) with time zone,
	"acknowledged_by_user_id" uuid,
	CONSTRAINT "diary_assignments_guardian_pair" CHECK (num_nonnulls("diary_assignments"."guardian_user_id", "diary_assignments"."student_id") = 2),
	CONSTRAINT "diary_assignments_acknowledgement_pair" CHECK (num_nonnulls("diary_assignments"."acknowledged_at", "diary_assignments"."acknowledged_by_user_id") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "diary_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diary_id" uuid NOT NULL,
	"label" varchar(200) NOT NULL,
	"attachment_type" varchar(16) NOT NULL,
	"storage_key" varchar(512),
	"external_url" varchar(2048),
	"content_type" varchar(120),
	"size_bytes" integer,
	"uploaded_by_user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diary_attachments_type_check" CHECK ("diary_attachments"."attachment_type" in ('worksheet', 'handout', 'link', 'image', 'other')),
	CONSTRAINT "diary_attachments_source_check" CHECK (num_nonnulls("diary_attachments"."storage_key", "diary_attachments"."external_url") = 1),
	CONSTRAINT "diary_attachments_link_type_check" CHECK ("diary_attachments"."attachment_type" <> 'link' or "diary_attachments"."external_url" is not null),
	CONSTRAINT "diary_attachments_file_type_check" CHECK ("diary_attachments"."attachment_type" = 'link' or "diary_attachments"."storage_key" is not null),
	CONSTRAINT "diary_attachments_size_check" CHECK ("diary_attachments"."size_bytes" is null or "diary_attachments"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "diary_notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"subject_id" uuid,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"diary_frequency" varchar(8) DEFAULT 'daily' NOT NULL,
	"quiet_hours_start" varchar(5),
	"quiet_hours_end" varchar(5),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "diary_notification_preferences_frequency_check" CHECK ("diary_notification_preferences"."diary_frequency" in ('daily', 'weekly', 'off')),
	CONSTRAINT "diary_notification_preferences_quiet_hours_check" CHECK (num_nonnulls("diary_notification_preferences"."quiet_hours_start", "diary_notification_preferences"."quiet_hours_end") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "diary_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diary_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"diary_assignment_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp (3) with time zone,
	"sent_at" timestamp (3) with time zone,
	"delivered_at" timestamp (3) with time zone,
	"failure_reason" text,
	"subject_line" varchar(300),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diary_notifications_status_check" CHECK ("diary_notifications"."status" in ('pending', 'queued', 'sent', 'delivered', 'failed', 'suppressed')),
	CONSTRAINT "diary_notifications_attempt_count_check" CHECK ("diary_notifications"."attempt_count" >= 0),
	CONSTRAINT "diary_notifications_sent_pair" CHECK ("diary_notifications"."status" not in ('sent', 'delivered') or "diary_notifications"."sent_at" is not null),
	CONSTRAINT "diary_notifications_delivery_pair" CHECK ("diary_notifications"."status" <> 'delivered' or "diary_notifications"."sent_at" is not null),
	CONSTRAINT "diary_notifications_failure_check" CHECK ("diary_notifications"."status" <> 'failed' or "diary_notifications"."failure_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "diary_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diary_id" uuid NOT NULL,
	"viewer_kind" varchar(12) NOT NULL,
	"viewer_id" uuid NOT NULL,
	"read_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"via" varchar(16) DEFAULT 'portal' NOT NULL,
	CONSTRAINT "diary_reads_viewer_kind_check" CHECK ("diary_reads"."viewer_kind" in ('student', 'guardian')),
	CONSTRAINT "diary_reads_via_check" CHECK ("diary_reads"."via" in ('portal', 'email_link', 'mobile_app'))
);
--> statement-breakpoint
CREATE TABLE "fee_concessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"invoice_id" uuid,
	"fee_structure_id" uuid,
	"kind" varchar(24) NOT NULL,
	"percentage" integer,
	"amount" numeric(18, 2),
	"currency" varchar(3) NOT NULL,
	"reason" text NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"revoked_by_user_id" uuid,
	"revocation_reason" varchar(500),
	CONSTRAINT "fee_concessions_percentage_range" CHECK ("fee_concessions"."percentage" is null or ("fee_concessions"."percentage" >= 0 and "fee_concessions"."percentage" <= 100)),
	CONSTRAINT "fee_concessions_percentage_only" CHECK ("fee_concessions"."percentage" is null or "fee_concessions"."percentage" >= 0),
	CONSTRAINT "fee_concessions_one_basis_check" CHECK (num_nonnulls("fee_concessions"."percentage", "fee_concessions"."amount") >= 1),
	CONSTRAINT "fee_concessions_revocation_pair" CHECK ("fee_concessions"."revoked_at" is null or "fee_concessions"."revoked_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "fee_deferrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"requested_by_guardian_user_id" uuid,
	"reason" text NOT NULL,
	"requested_from" date NOT NULL,
	"requested_until" date NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp (3) with time zone,
	"decision_notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_deferrals_window_check" CHECK ("fee_deferrals"."requested_until" > "fee_deferrals"."requested_from"),
	CONSTRAINT "fee_deferrals_approval_pair" CHECK ("fee_deferrals"."is_approved" = false or ("fee_deferrals"."approved_by_user_id" is not null and "fee_deferrals"."approved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "fee_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_plan_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"due_on" date NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"paid_by_payment_id" uuid,
	"paid_at" timestamp (3) with time zone,
	CONSTRAINT "fee_installments_sequence_check" CHECK ("fee_installments"."sequence" > 0),
	CONSTRAINT "fee_installments_amount_positive" CHECK ("fee_installments"."amount" > 0),
	CONSTRAINT "fee_installments_payment_pair" CHECK ("fee_installments"."paid_at" is null or "fee_installments"."paid_by_payment_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "fee_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"fee_structure_item_id" uuid,
	"name" varchar(160) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"category" varchar(32) DEFAULT 'other' NOT NULL,
	"is_taxable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_invoice_lines_amount_positive" CHECK ("fee_invoice_lines"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fee_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" "fee_status" DEFAULT 'pending' NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date,
	"deferred_until" date,
	"waiver_reason" varchar(500),
	"kind" varchar(24) DEFAULT 'regular' NOT NULL,
	"notes" text,
	"issued_by_user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "fee_invoices_currency_check" CHECK ("fee_invoices"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "fee_invoices_total_positive" CHECK ("fee_invoices"."total_amount" >= 0),
	CONSTRAINT "fee_invoices_due_check" CHECK ("fee_invoices"."due_on" is null or "fee_invoices"."due_on" >= "fee_invoices"."issued_on"),
	CONSTRAINT "fee_invoices_deferral_pair" CHECK ("fee_invoices"."status" <> 'deferred' or "fee_invoices"."deferred_until" is not null),
	CONSTRAINT "fee_invoices_waiver_reason_check" CHECK ("fee_invoices"."status" <> 'waived' or "fee_invoices"."waiver_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "fee_payment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"installment_amount" numeric(18, 2) NOT NULL,
	"installment_count" integer NOT NULL,
	"status" varchar(16) DEFAULT 'proposed' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "fee_payment_plans_currency_check" CHECK ("fee_payment_plans"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "fee_payment_plans_count_check" CHECK ("fee_payment_plans"."installment_count" > 0),
	CONSTRAINT "fee_payment_plans_amount_positive" CHECK ("fee_payment_plans"."total_amount" >= 0 and "fee_payment_plans"."installment_amount" > 0),
	CONSTRAINT "fee_payment_plans_approval_pair" CHECK ("fee_payment_plans"."status" not in ('approved', 'active') or "fee_payment_plans"."approved_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "fee_structure_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fee_structure_id" uuid NOT NULL,
	"action" varchar(32) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_by_user_id" uuid NOT NULL,
	"changed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"reason" varchar(500),
	CONSTRAINT "fee_structure_audit_action_check" CHECK ("fee_structure_audit"."action" in ('created', 'updated', 'deactivated', 'effective_window_changed'))
);
--> statement-breakpoint
CREATE TABLE "fee_structure_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fee_structure_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"discount_amount" numeric(18, 2),
	"frequency" "fee_frequency" DEFAULT 'one_time' NOT NULL,
	"installment_count" integer,
	"category" varchar(32) DEFAULT 'other' NOT NULL,
	"override_amount" numeric(18, 2),
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_structure_items_amount_positive" CHECK ("fee_structure_items"."amount" >= 0),
	CONSTRAINT "fee_structure_items_discount_check" CHECK ("fee_structure_items"."discount_amount" is null or ("fee_structure_items"."discount_amount" >= 0 and "fee_structure_items"."discount_amount" <= "fee_structure_items"."amount")),
	CONSTRAINT "fee_structure_items_override_check" CHECK ("fee_structure_items"."override_amount" is null or "fee_structure_items"."override_amount" >= 0),
	CONSTRAINT "fee_structure_items_installment_check" CHECK ("fee_structure_items"."frequency" = 'one_time' or ("fee_structure_items"."installment_count" is not null and "fee_structure_items"."installment_count" > 0))
);
--> statement-breakpoint
CREATE TABLE "fee_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"applies_to" varchar(16) DEFAULT 'all' NOT NULL,
	"class_id" uuid,
	"group_id" uuid,
	"section_id" uuid,
	"academic_session_id" uuid,
	"currency" varchar(3) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "fee_structures_currency_check" CHECK ("fee_structures"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "fee_structures_effective_order_check" CHECK ("fee_structures"."effective_to" is null or "fee_structures"."effective_to" > "fee_structures"."effective_from"),
	CONSTRAINT "fee_structures_scope_consistency_check" CHECK ((
        "fee_structures"."applies_to" = 'all' and num_nonnulls("fee_structures"."class_id", "fee_structures"."group_id", "fee_structures"."section_id") = 0
      ) or (
        "fee_structures"."applies_to" = 'class' and "fee_structures"."class_id" is not null
      ) or (
        "fee_structures"."applies_to" = 'group' and "fee_structures"."group_id" is not null
      ) or (
        "fee_structures"."applies_to" = 'section' and "fee_structures"."section_id" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"allocated_amount" numeric(18, 2) NOT NULL,
	"allocated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"allocated_by_user_id" uuid NOT NULL,
	CONSTRAINT "payment_allocations_payment_id_invoice_id_pk" PRIMARY KEY("payment_id","invoice_id"),
	CONSTRAINT "payment_allocations_positive" CHECK ("payment_allocations"."allocated_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"payment_number" varchar(64) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"overpayment_amount" numeric(18, 2),
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'completed' NOT NULL,
	"reference_number" varchar(128),
	"deposited_to_account_id" uuid,
	"received_on" date NOT NULL,
	"received_by_user_id" uuid NOT NULL,
	"reverses_payment_id" uuid,
	"notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "payments_currency_check" CHECK ("payments"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_reference_check" CHECK ("payments"."method" = 'cash' or "payments"."reference_number" is not null),
	CONSTRAINT "payments_reversal_check" CHECK ("payments"."status" <> 'reversed' or "payments"."reverses_payment_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"receipt_number" varchar(64) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"issued_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"issued_by_user_id" uuid NOT NULL,
	"superseded_by_id" uuid,
	"document_storage_key" varchar(512),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_currency_check" CHECK ("receipts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "receipts_amount_positive" CHECK ("receipts"."amount" > 0),
	CONSTRAINT "receipts_no_self_supersession" CHECK ("receipts"."superseded_by_id" is null or "receipts"."superseded_by_id" <> "receipts"."id")
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reconciliation_id" uuid NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"statement_line_reference" varchar(128),
	"status" varchar(24) DEFAULT 'matched' NOT NULL,
	"notes" varchar(500),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_reconciliation_items_status_check" CHECK ("bank_reconciliation_items"."status" in ('matched', 'unmatched', 'bank_charge', 'missing_from_bank')),
	CONSTRAINT "bank_reconciliation_items_reference_required" CHECK ("bank_reconciliation_items"."status" <> 'matched' or "bank_reconciliation_items"."statement_line_reference" is not null)
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"statement_balance" numeric(18, 2),
	"ledger_balance" numeric(18, 2),
	"difference" numeric(18, 2),
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"reconciled_by_user_id" uuid,
	"reconciled_at" timestamp (3) with time zone,
	"notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "bank_reconciliations_period_check" CHECK ("bank_reconciliations"."period_end" >= "bank_reconciliations"."period_start"),
	CONSTRAINT "bank_reconciliations_status_check" CHECK ("bank_reconciliations"."status" in ('draft', 'in_progress', 'reconciled', 'disputed')),
	CONSTRAINT "bank_reconciliations_reconciler_pair" CHECK ("bank_reconciliations"."status" <> 'reconciled' or ("bank_reconciliations"."reconciled_by_user_id" is not null and "bank_reconciliations"."reconciled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"expense_head_id" uuid NOT NULL,
	"department_id" uuid,
	"period" varchar(16) NOT NULL,
	"budgeted_amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"actual_amount" numeric(18, 2),
	"is_recomputed_at" timestamp (3) with time zone,
	"approved_by_user_id" uuid,
	"approved_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "budgets_currency_check" CHECK ("budgets"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "budgets_budgeted_positive" CHECK ("budgets"."budgeted_amount" >= 0),
	CONSTRAINT "budgets_actual_pair" CHECK ("budgets"."actual_amount" is null or "budgets"."is_recomputed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "expense_heads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"category" "expense_category" NOT NULL,
	"parent_head_id" uuid,
	"ledger_account_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "expense_heads_not_self_parent" CHECK ("expense_heads"."parent_head_id" is null or "expense_heads"."parent_head_id" <> "expense_heads"."id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"expense_head_id" uuid NOT NULL,
	"department_id" uuid,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"description" text NOT NULL,
	"incurred_on" date NOT NULL,
	"method" "payment_method" DEFAULT 'cash' NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp (3) with time zone,
	"journal_transaction_id" uuid,
	"receipt_storage_key" varchar(512),
	"requested_by_user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "expenses_currency_check" CHECK ("expenses"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount" > 0),
	CONSTRAINT "expenses_status_check" CHECK ("expenses"."status" in ('draft', 'submitted', 'approved', 'paid', 'rejected')),
	CONSTRAINT "expenses_approval_pair" CHECK ("expenses"."status" not in ('approved', 'paid') or ("expenses"."approved_by_user_id" is not null and "expenses"."approved_at" is not null)),
	CONSTRAINT "expenses_journal_required" CHECK ("expenses"."status" <> 'paid' or "expenses"."journal_transaction_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"account_type" varchar(24) NOT NULL,
	"bank_name" varchar(160),
	"account_number" varchar(64),
	"iban" varchar(64),
	"currency" varchar(3) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"opened_on" date,
	"closed_on" date,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp (3) with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "financial_accounts_currency_check" CHECK ("financial_accounts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "financial_accounts_close_check" CHECK ("financial_accounts"."closed_on" is null or "financial_accounts"."opened_on" is null or "financial_accounts"."closed_on" >= "financial_accounts"."opened_on"),
	CONSTRAINT "financial_accounts_bank_detail_check" CHECK ("financial_accounts"."account_type" <> 'bank' or "financial_accounts"."bank_name" is not null)
);
--> statement-breakpoint
CREATE TABLE "financial_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(16) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"closed_at" timestamp (3) with time zone,
	"closed_by_user_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "financial_periods_range_check" CHECK ("financial_periods"."ends_on" >= "financial_periods"."starts_on"),
	CONSTRAINT "financial_periods_close_pair" CHECK ("financial_periods"."closed_at" is null or "financial_periods"."closed_by_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "journal_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"transaction_kind" "transaction_kind" NOT NULL,
	"reference_number" varchar(64) NOT NULL,
	"description" text,
	"payment_id" uuid,
	"payroll_run_id" uuid,
	"transaction_on" date NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"posted_at" timestamp (3) with time zone,
	"posted_by_user_id" uuid,
	"reversed_at" timestamp (3) with time zone,
	"reversed_by_user_id" uuid,
	"reverses_transaction_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_transactions_status_check" CHECK ("journal_transactions"."status" in ('draft', 'posted', 'reversed')),
	CONSTRAINT "journal_transactions_post_pair" CHECK ("journal_transactions"."status" = 'draft' or ("journal_transactions"."posted_at" is not null and "journal_transactions"."posted_by_user_id" is not null)),
	CONSTRAINT "journal_transactions_reverse_pair" CHECK ("journal_transactions"."status" <> 'reversed' or "journal_transactions"."reversed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" "transaction_direction" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"category" "expense_category",
	"fee_category" varchar(32),
	"description" varchar(500),
	"tags" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_positive" CHECK ("ledger_entries"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"method" varchar(24) NOT NULL,
	"is_incoming" boolean DEFAULT true NOT NULL,
	"is_outgoing" boolean DEFAULT true NOT NULL,
	"ledger_account_id" uuid,
	"handling_fee" numeric(18, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "payment_methods_direction_check" CHECK ("payment_methods"."is_incoming" = true or "payment_methods"."is_outgoing" = true),
	CONSTRAINT "payment_methods_account_required" CHECK ("payment_methods"."is_active" = false or "payment_methods"."ledger_account_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "payroll_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_item_id" uuid NOT NULL,
	"adjustment_type" varchar(16) NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"reason" text NOT NULL,
	"corrects_record_type" varchar(32),
	"corrects_record_id" uuid,
	"previous_net_amount" numeric(18, 2),
	"applied_by_user_id" uuid NOT NULL,
	"applied_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp (3) with time zone,
	"reversed_by_user_id" uuid,
	"reversed_at" timestamp (3) with time zone,
	"reversal_reason" text,
	CONSTRAINT "payroll_adjustments_type_check" CHECK ("payroll_adjustments"."adjustment_type" in ('bonus', 'deduction', 'overtime', 'correction', 'allowance', 'clawback')),
	CONSTRAINT "payroll_adjustments_amount_nonzero" CHECK ("payroll_adjustments"."amount" <> 0),
	CONSTRAINT "payroll_adjustments_approval_pair" CHECK (num_nonnulls("payroll_adjustments"."approved_by_user_id", "payroll_adjustments"."approved_at") in (0, 2)),
	CONSTRAINT "payroll_adjustments_reversal_pair" CHECK (num_nonnulls("payroll_adjustments"."reversed_by_user_id", "payroll_adjustments"."reversed_at", "payroll_adjustments"."reversal_reason") in (0, 3)),
	CONSTRAINT "payroll_adjustments_correction_target_check" CHECK ("payroll_adjustments"."adjustment_type" <> 'correction' or num_nonnulls("payroll_adjustments"."corrects_record_type", "payroll_adjustments"."corrects_record_id") = 2)
);
--> statement-breakpoint
CREATE TABLE "payroll_calculation_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_item_id" uuid NOT NULL,
	"source_type" varchar(24) NOT NULL,
	"source_record_id" uuid NOT NULL,
	"quantity" varchar(64),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_calculation_sources_type_check" CHECK ("payroll_calculation_sources"."source_type" in ('attendance', 'leave', 'schedule', 'extra_period', 'salary_assignment'))
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"teacher_id" uuid,
	"salary_assignment_id" uuid,
	"currency" varchar(3) NOT NULL,
	"base_amount" numeric(18, 2) NOT NULL,
	"unit_count" integer,
	"unit_rate" numeric(18, 2),
	"extra_period_count" integer DEFAULT 0 NOT NULL,
	"extra_period_amount" numeric(18, 2),
	"absence_days" integer DEFAULT 0 NOT NULL,
	"attendance_deduction" numeric(18, 2),
	"unpaid_leave_days" integer DEFAULT 0 NOT NULL,
	"leave_deduction" numeric(18, 2),
	"adjustment_amount" numeric(18, 2),
	"net_amount" numeric(18, 2) NOT NULL,
	"calculation_breakdown" jsonb,
	"is_excluded" boolean DEFAULT false NOT NULL,
	"exclusion_reason" varchar(300),
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "payroll_items_currency_check" CHECK ("payroll_items"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payroll_items_unit_count_check" CHECK ("payroll_items"."unit_count" is null or "payroll_items"."unit_count" >= 0),
	CONSTRAINT "payroll_items_extra_period_count_check" CHECK ("payroll_items"."extra_period_count" >= 0),
	CONSTRAINT "payroll_items_absence_days_check" CHECK ("payroll_items"."absence_days" >= 0),
	CONSTRAINT "payroll_items_leave_days_check" CHECK ("payroll_items"."unpaid_leave_days" >= 0),
	CONSTRAINT "payroll_items_unit_pair_check" CHECK (num_nonnulls("payroll_items"."unit_count", "payroll_items"."unit_rate") in (0, 2)),
	CONSTRAINT "payroll_items_base_amount_check" CHECK ("payroll_items"."base_amount" >= 0),
	CONSTRAINT "payroll_items_deduction_check" CHECK (coalesce("payroll_items"."attendance_deduction", 0) >= 0 and coalesce("payroll_items"."leave_deduction", 0) >= 0),
	CONSTRAINT "payroll_items_extra_period_check" CHECK ("payroll_items"."extra_period_count" = 0 or "payroll_items"."extra_period_amount" is not null),
	CONSTRAINT "payroll_items_exclusion_reason_check" CHECK ("payroll_items"."is_excluded" = false or "payroll_items"."exclusion_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "payroll_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"payment_reference" varchar(128),
	"paid_at" timestamp (3) with time zone,
	"processed_by_user_id" uuid,
	"failure_reason" text,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "payroll_payments_currency_check" CHECK ("payroll_payments"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payroll_payments_amount_positive" CHECK ("payroll_payments"."amount" > 0),
	CONSTRAINT "payroll_payments_status_check" CHECK ("payroll_payments"."status" in ('pending', 'processing', 'completed', 'failed', 'reversed')),
	CONSTRAINT "payroll_payments_completion_pair" CHECK ("payroll_payments"."status" <> 'completed' or "payroll_payments"."paid_at" is not null),
	CONSTRAINT "payroll_payments_failure_reason_check" CHECK ("payroll_payments"."status" <> 'failed' or "payroll_payments"."failure_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "payroll_payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_item_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"slip_number" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"storage_key" varchar(512),
	"generated_at" timestamp (3) with time zone,
	"shared_at" timestamp (3) with time zone,
	"shared_by_user_id" uuid,
	"superseded_by_slip_id" uuid,
	"printed_breakdown" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_payslips_status_check" CHECK ("payroll_payslips"."status" in ('draft', 'generated', 'shared', 'superseded')),
	CONSTRAINT "payroll_payslips_storage_required" CHECK ("payroll_payslips"."status" = 'draft' or ("payroll_payslips"."storage_key" is not null and "payroll_payslips"."generated_at" is not null)),
	CONSTRAINT "payroll_payslips_no_self_supersession" CHECK ("payroll_payslips"."superseded_by_slip_id" is null or "payroll_payslips"."superseded_by_slip_id" <> "payroll_payslips"."id")
);
--> statement-breakpoint
CREATE TABLE "payroll_period_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"locked_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"locked_by_user_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_period_locks_period_check" CHECK ("payroll_period_locks"."period_end" >= "payroll_period_locks"."period_start")
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"period_label" varchar(64) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" "payroll_status" DEFAULT 'draft' NOT NULL,
	"calculated_at" timestamp (3) with time zone,
	"calculated_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"approved_at" timestamp (3) with time zone,
	"paid_at" timestamp (3) with time zone,
	"journal_transaction_id" uuid,
	"locked_at" timestamp (3) with time zone,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "payroll_runs_currency_check" CHECK ("payroll_runs"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payroll_runs_period_check" CHECK ("payroll_runs"."period_end" >= "payroll_runs"."period_start"),
	CONSTRAINT "payroll_runs_approval_pair" CHECK ("payroll_runs"."status" not in ('approved', 'paid', 'locked') or ("payroll_runs"."approved_by_user_id" is not null and "payroll_runs"."approved_at" is not null)),
	CONSTRAINT "payroll_runs_calculation_pair" CHECK ("payroll_runs"."status" = 'draft' or ("payroll_runs"."calculated_at" is not null and "payroll_runs"."calculated_by_user_id" is not null)),
	CONSTRAINT "payroll_runs_journal_required" CHECK ("payroll_runs"."status" <> 'paid' or "payroll_runs"."journal_transaction_id" is not null),
	CONSTRAINT "payroll_runs_lock_pair" CHECK ("payroll_runs"."status" <> 'locked' or "payroll_runs"."locked_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "complaint_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" uuid NOT NULL,
	"action_type" varchar(24) NOT NULL,
	"from_status" "complaint_status",
	"to_status" "complaint_status",
	"actor_user_id" uuid,
	"details" text,
	"is_visible_to_student" boolean DEFAULT true NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaint_actions_type_check" CHECK ("complaint_actions"."action_type" in ('created', 'status_change', 'assigned', 'reassigned', 'note_added', 'evidence_attached', 'student_notified', 'guardian_notified', 'escalated')),
	CONSTRAINT "complaint_actions_status_pair" CHECK ("complaint_actions"."action_type" <> 'status_change' or ("complaint_actions"."to_status" is not null and "complaint_actions"."to_status" <> "complaint_actions"."from_status")),
	CONSTRAINT "complaint_actions_status_columns_check" CHECK ("complaint_actions"."action_type" = 'status_change' or ("complaint_actions"."from_status" is null and "complaint_actions"."to_status" is null)),
	CONSTRAINT "complaint_actions_note_check" CHECK ("complaint_actions"."action_type" <> 'note_added' or nullif(btrim("complaint_actions"."details"), '') is not null),
	CONSTRAINT "complaint_actions_assignment_check" CHECK ("complaint_actions"."action_type" not in ('assigned', 'reassigned') or "complaint_actions"."actor_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "complaint_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" uuid NOT NULL,
	"attachment_type" varchar(16) NOT NULL,
	"label" varchar(200) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"content_type" varchar(120),
	"size_bytes" integer,
	"checksum_sha256" varchar(64),
	"uploaded_by_user_id" uuid NOT NULL,
	"uploaded_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"supersedes_attachment_id" uuid,
	"is_current" boolean DEFAULT true NOT NULL,
	"withdrawn_at" timestamp (3) with time zone,
	"withdrawn_by_user_id" uuid,
	"withdrawal_reason" text,
	CONSTRAINT "complaint_attachments_type_check" CHECK ("complaint_attachments"."attachment_type" in ('photo', 'video', 'audio', 'document', 'statement', 'other')),
	CONSTRAINT "complaint_attachments_size_check" CHECK ("complaint_attachments"."size_bytes" is null or "complaint_attachments"."size_bytes" > 0),
	CONSTRAINT "complaint_attachments_checksum_check" CHECK ("complaint_attachments"."checksum_sha256" is null or "complaint_attachments"."checksum_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "complaint_attachments_self_reference_check" CHECK ("complaint_attachments"."supersedes_attachment_id" is null or "complaint_attachments"."supersedes_attachment_id" <> "complaint_attachments"."id"),
	CONSTRAINT "complaint_attachments_current_check" CHECK (not ("complaint_attachments"."is_current" and "complaint_attachments"."withdrawn_at" is not null)),
	CONSTRAINT "complaint_attachments_withdrawal_pair" CHECK (num_nonnulls("complaint_attachments"."withdrawn_at", "complaint_attachments"."withdrawn_by_user_id") in (0, 2)),
	CONSTRAINT "complaint_attachments_withdrawal_reason_check" CHECK ("complaint_attachments"."withdrawn_at" is null or nullif(btrim("complaint_attachments"."withdrawal_reason"), '') is not null)
);
--> statement-breakpoint
CREATE TABLE "complaint_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp (3) with time zone,
	"edited_by_user_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaint_comments_body_check" CHECK (nullif(btrim("complaint_comments"."body"), '') is not null),
	CONSTRAINT "complaint_comments_self_reference_check" CHECK ("complaint_comments"."parent_comment_id" is null or "complaint_comments"."parent_comment_id" <> "complaint_comments"."id"),
	CONSTRAINT "complaint_comments_edit_pair" CHECK (num_nonnulls("complaint_comments"."edited_at", "complaint_comments"."edited_by_user_id") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "complaint_visibility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"access_level" varchar(8) DEFAULT 'summary' NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"revoked_by_user_id" uuid,
	"reason" varchar(300),
	CONSTRAINT "complaint_visibility_level_check" CHECK ("complaint_visibility"."access_level" in ('summary', 'full')),
	CONSTRAINT "complaint_visibility_expiry_check" CHECK ("complaint_visibility"."expires_at" is null or "complaint_visibility"."expires_at" > "complaint_visibility"."granted_at"),
	CONSTRAINT "complaint_visibility_revocation_pair" CHECK (num_nonnulls("complaint_visibility"."revoked_at", "complaint_visibility"."revoked_by_user_id") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"reported_by_user_id" uuid NOT NULL,
	"class_id" uuid,
	"section_id" uuid,
	"subject_id" uuid,
	"reported_date" date NOT NULL,
	"reported_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"title" varchar(200) NOT NULL,
	"reason" varchar(64) NOT NULL,
	"description" text NOT NULL,
	"status" "complaint_status" DEFAULT 'open' NOT NULL,
	"action_taken" text,
	"severity" varchar(8) DEFAULT 'medium' NOT NULL,
	"assigned_to_user_id" uuid,
	"assigned_at" timestamp (3) with time zone,
	"resolved_at" timestamp (3) with time zone,
	"resolved_by_user_id" uuid,
	"student_notified_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "complaints_severity_check" CHECK ("complaints"."severity" in ('low', 'medium', 'high', 'critical')),
	CONSTRAINT "complaints_assignment_pair" CHECK (num_nonnulls("complaints"."assigned_to_user_id", "complaints"."assigned_at") in (0, 2)),
	CONSTRAINT "complaints_review_requires_assignee" CHECK ("complaints"."status" <> 'under_review' or "complaints"."assigned_to_user_id" is not null),
	CONSTRAINT "complaints_resolution_pair" CHECK (num_nonnulls("complaints"."resolved_at", "complaints"."resolved_by_user_id") in (0, 2)),
	CONSTRAINT "complaints_resolution_status_check" CHECK ("complaints"."status" not in ('resolved', 'dismissed') or "complaints"."resolved_at" is not null),
	CONSTRAINT "complaints_resolution_requires_action" CHECK ("complaints"."status" <> 'resolved' or nullif(btrim("complaints"."action_taken"), '') is not null)
);
--> statement-breakpoint
CREATE TABLE "announcement_audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"audience_type" "notification_audience" NOT NULL,
	"audience_id" uuid,
	"match_mode" varchar(8) DEFAULT 'any' NOT NULL,
	CONSTRAINT "announcement_audiences_id_check" CHECK ("announcement_audiences"."audience_type" = 'everyone' or "announcement_audiences"."audience_id" is not null),
	CONSTRAINT "announcement_audiences_match_mode_check" CHECK ("announcement_audiences"."match_mode" in ('any', 'all'))
);
--> statement-breakpoint
CREATE TABLE "announcement_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"delivered_at" timestamp (3) with time zone,
	"read_at" timestamp (3) with time zone,
	"acknowledged_at" timestamp (3) with time zone,
	"acknowledgement_note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_receipts_ack_pair" CHECK ("announcement_receipts"."acknowledged_at" is null or "announcement_receipts"."read_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"campus_id" uuid,
	"academic_session_id" uuid,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(12) DEFAULT 'draft' NOT NULL,
	"priority" varchar(8) DEFAULT 'normal' NOT NULL,
	"announcement_type" varchar(16) DEFAULT 'all' NOT NULL,
	"notification_id" uuid,
	"requires_acknowledgement" boolean DEFAULT false NOT NULL,
	"acknowledge_by" timestamp (3) with time zone,
	"publish_at" timestamp (3) with time zone,
	"published_at" timestamp (3) with time zone,
	"archived_at" timestamp (3) with time zone,
	"author_user_id" uuid NOT NULL,
	"attachment_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "announcements_status_check" CHECK ("announcements"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "announcements_priority_check" CHECK ("announcements"."priority" in ('low', 'normal', 'high', 'critical')),
	CONSTRAINT "announcements_type_check" CHECK ("announcements"."announcement_type" in ('all', 'students', 'guardians', 'staff', 'teachers', 'custom')),
	CONSTRAINT "announcements_publication_pair" CHECK ("announcements"."status" = 'draft' or "announcements"."published_at" is not null),
	CONSTRAINT "announcements_acknowledgement_deadline_check" CHECK (not "announcements"."requires_acknowledgement" or "announcements"."acknowledge_by" is not null),
	CONSTRAINT "announcements_publish_after_check" CHECK ("announcements"."publish_at" is null or "announcements"."published_at" is null or "announcements"."publish_at" <= "announcements"."published_at")
);
--> statement-breakpoint
CREATE TABLE "email_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_message_id" uuid NOT NULL,
	"event_type" varchar(16) NOT NULL,
	"provider_code" varchar(32),
	"provider_message" text,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"provider_event_id" varchar(255),
	CONSTRAINT "email_delivery_events_type_check" CHECK ("email_delivery_events"."event_type" in ('accepted', 'deferred', 'bounced', 'complained', 'opened', 'clicked'))
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"template_id" uuid,
	"template_version" integer,
	"email_type" varchar(40) NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"subject" varchar(300) NOT NULL,
	"body_html" text,
	"body_text" text,
	"to_user_id" uuid,
	"to_email" varchar(320) NOT NULL,
	"cc_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bcc_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_to_email" varchar(320),
	"notification_id" uuid,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"provider_message_id" varchar(255),
	"sent_at" timestamp (3) with time zone,
	"failed_at" timestamp (3) with time zone,
	"failure_reason" text,
	"next_attempt_at" timestamp (3) with time zone,
	"attachment_storage_key" varchar(512),
	"related_entity_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_messages_attempt_count_check" CHECK ("email_messages"."attempt_count" >= 0),
	CONSTRAINT "email_messages_max_attempts_check" CHECK ("email_messages"."max_attempts" > 0),
	CONSTRAINT "email_messages_attempt_within_limit_check" CHECK ("email_messages"."attempt_count" <= "email_messages"."max_attempts" or "email_messages"."status" <> 'queued'),
	CONSTRAINT "email_messages_sent_pair" CHECK ("email_messages"."status" <> 'sent' or ("email_messages"."sent_at" is not null and "email_messages"."provider_message_id" is not null)),
	CONSTRAINT "email_messages_failed_pair" CHECK ("email_messages"."status" <> 'failed' or ("email_messages"."failed_at" is not null and "email_messages"."failure_reason" is not null)),
	CONSTRAINT "email_messages_template_version_pair" CHECK (num_nonnulls("email_messages"."template_id", "email_messages"."template_version") in (0, 2)),
	CONSTRAINT "email_messages_body_check" CHECK (num_nonnulls("email_messages"."body_html", "email_messages"."body_text") >= 1),
	CONSTRAINT "email_messages_notification_pair" CHECK ("email_messages"."notification_id" is null or "email_messages"."to_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" varchar(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"locale" varchar(8) DEFAULT 'en' NOT NULL,
	"description" varchar(300),
	"subject_template" varchar(300) NOT NULL,
	"body_template" text NOT NULL,
	"required_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_type" varchar(16) DEFAULT 'plain_text' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "email_templates_version_check" CHECK ("email_templates"."version" > 0),
	CONSTRAINT "email_templates_content_type_check" CHECK ("email_templates"."content_type" in ('html', 'plain_text'))
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"audience_type" "notification_audience" NOT NULL,
	"audience_id" uuid,
	"resolution_note" varchar(200),
	"status" "notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"delivered_at" timestamp (3) with time zone,
	"read_at" timestamp (3) with time zone,
	"failed_at" timestamp (3) with time zone,
	"failure_reason" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "notification_deliveries_attempt_count_check" CHECK ("notification_deliveries"."attempt_count" >= 0),
	CONSTRAINT "notification_deliveries_read_pair" CHECK ("notification_deliveries"."status" <> 'read' or "notification_deliveries"."delivered_at" is not null),
	CONSTRAINT "notification_deliveries_failure_check" CHECK ("notification_deliveries"."status" not in ('failed', 'suppressed') or "notification_deliveries"."failure_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" varchar(32),
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_start" varchar(5),
	"quiet_hours_end" varchar(5),
	"minimum_priority" varchar(8) DEFAULT 'normal' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "notification_preferences_priority_check" CHECK ("notification_preferences"."minimum_priority" in ('low', 'normal', 'high', 'critical')),
	CONSTRAINT "notification_preferences_quiet_hours_check" CHECK (num_nonnulls("notification_preferences"."quiet_hours_start", "notification_preferences"."quiet_hours_end") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"source_module" varchar(32) NOT NULL,
	"event_key" varchar(64) NOT NULL,
	"related_entity_id" uuid,
	"channel" "notification_channel" DEFAULT 'in_app' NOT NULL,
	"audience_type" "notification_audience" NOT NULL,
	"audience_id" uuid,
	"title" varchar(300) NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"action_url" varchar(512),
	"required_permission_key" varchar(96),
	"scheduled_for" timestamp (3) with time zone,
	"expires_at" timestamp (3) with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "notifications_audience_id_check" CHECK ("notifications"."audience_type" = 'everyone' or "notifications"."audience_id" is not null),
	CONSTRAINT "notifications_schedule_check" CHECK ("notifications"."scheduled_for" is null or "notifications"."expires_at" is null or "notifications"."expires_at" > "notifications"."scheduled_for"),
	CONSTRAINT "notifications_in_app_not_deferred" CHECK ("notifications"."channel" <> 'in_app' or "notifications"."scheduled_for" is null)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_display_name" varchar(64),
	"action" varchar(64) NOT NULL,
	"result" "audit_result" NOT NULL,
	"target_type" varchar(48) NOT NULL,
	"target_id" varchar(64) NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"context" jsonb,
	"correlation_id" varchar(96),
	"request_id" varchar(96),
	"ip_address" "inet",
	"user_agent" varchar(512),
	"institution_id" uuid,
	"is_immutable" boolean DEFAULT true NOT NULL,
	CONSTRAINT "audit_events_action_check" CHECK (length(btrim("audit_events"."action")) > 0),
	CONSTRAINT "audit_events_target_check" CHECK (length(btrim("audit_events"."target_type")) > 0 and length(btrim("audit_events"."target_id")) > 0),
	CONSTRAINT "audit_events_actor_pair" CHECK (num_nonnulls("audit_events"."actor_user_id", "audit_events"."actor_display_name") >= 1),
	CONSTRAINT "audit_events_state_check" CHECK ("audit_events"."after_state" is not null or "audit_events"."before_state" is not null or "audit_events"."action" in ('auth.login', 'auth.logout'))
);
--> statement-breakpoint
CREATE TABLE "setting_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"setting_key" varchar(128) NOT NULL,
	"previous_value" text,
	"new_value" text,
	"typed_values" jsonb,
	"override_reason" text,
	"changed_by_user_id" uuid NOT NULL,
	"changed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"correlation_id" varchar(96),
	CONSTRAINT "setting_changes_value_check" CHECK ("setting_changes"."previous_value" is null or "setting_changes"."new_value" is null or "setting_changes"."previous_value" <> "setting_changes"."new_value"),
	CONSTRAINT "setting_changes_key_check" CHECK (length(btrim("setting_changes"."setting_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"setting_key" varchar(128) NOT NULL,
	"setting_value_type" "setting_value_type" NOT NULL,
	"setting_category" varchar(32) NOT NULL,
	"string_value" varchar(2048),
	"number_value" integer,
	"boolean_value" boolean,
	"json_value" jsonb,
	"number_unit" varchar(16),
	"is_secret_reference" boolean DEFAULT false NOT NULL,
	"description" text,
	"is_client_readable" boolean DEFAULT false NOT NULL,
	"default_source" varchar(16) DEFAULT 'system' NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_key_check" CHECK ("system_settings"."setting_key" ~ '^[a-z0-9]+(\.[a-z0-9_]+)+$'),
	CONSTRAINT "system_settings_source_check" CHECK ("system_settings"."default_source" in ('system', 'institution', 'department', 'manual')),
	CONSTRAINT "system_settings_value_type_check" CHECK ((
        ("system_settings"."setting_value_type" = 'string'  and "system_settings"."string_value"  is not null and num_nonnulls("system_settings"."number_value", "system_settings"."boolean_value", "system_settings"."json_value") = 0)
     or ("system_settings"."setting_value_type" = 'number'  and "system_settings"."number_value"  is not null and num_nonnulls("system_settings"."string_value", "system_settings"."boolean_value", "system_settings"."json_value") = 0)
     or ("system_settings"."setting_value_type" = 'boolean' and "system_settings"."boolean_value" is not null and num_nonnulls("system_settings"."string_value", "system_settings"."number_value", "system_settings"."json_value") = 0)
     or ("system_settings"."setting_value_type" in ('json', 'date') and "system_settings"."json_value" is not null and num_nonnulls("system_settings"."string_value", "system_settings"."number_value", "system_settings"."boolean_value") = 0)
      )),
	CONSTRAINT "system_settings_unit_check" CHECK ("system_settings"."setting_value_type" <> 'number' or "system_settings"."number_unit" is not null)
);
--> statement-breakpoint
CREATE TABLE "dead_letter_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"job_type" varchar(64) NOT NULL,
	"institution_id" uuid,
	"attempt_count" integer NOT NULL,
	"error_message" text,
	"error_type" varchar(32),
	"dead_lettered_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"acknowledged_by_user_id" uuid,
	"acknowledged_at" timestamp (3) with time zone,
	"acknowledgement_note" text,
	"resolution" varchar(12),
	"resolved_at" timestamp (3) with time zone,
	"resolved_by_user_id" uuid,
	"replayed_as_job_id" uuid,
	"resolution_note" text,
	CONSTRAINT "dead_letter_jobs_attempt_count_check" CHECK ("dead_letter_jobs"."attempt_count" > 0),
	CONSTRAINT "dead_letter_jobs_acknowledgement_pair" CHECK (num_nonnulls("dead_letter_jobs"."acknowledged_by_user_id", "dead_letter_jobs"."acknowledged_at") in (0, 2)),
	CONSTRAINT "dead_letter_jobs_resolution_check" CHECK ("dead_letter_jobs"."resolution" is null or "dead_letter_jobs"."resolution" in ('replayed', 'fixed', 'abandoned')),
	CONSTRAINT "dead_letter_jobs_resolution_pair" CHECK ("dead_letter_jobs"."resolution" is null or ("dead_letter_jobs"."resolved_at" is not null and "dead_letter_jobs"."resolved_by_user_id" is not null)),
	CONSTRAINT "dead_letter_jobs_resolution_note_check" CHECK ("dead_letter_jobs"."resolved_at" is null or nullif(btrim("dead_letter_jobs"."resolution_note"), '') is not null),
	CONSTRAINT "dead_letter_jobs_replay_check" CHECK ("dead_letter_jobs"."replayed_as_job_id" is null or "dead_letter_jobs"."resolution" = 'replayed')
);
--> statement-breakpoint
CREATE TABLE "job_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" varchar(64) NOT NULL,
	"handler_name" varchar(128) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"description" text,
	"default_max_attempts" integer DEFAULT 3 NOT NULL,
	"default_visibility_timeout_ms" integer DEFAULT 300000 NOT NULL,
	"retry_backoff_ms" integer DEFAULT 30000 NOT NULL,
	"retry_backoff_is_exponential" boolean DEFAULT false NOT NULL,
	"allows_concurrency" boolean DEFAULT false NOT NULL,
	"max_concurrent_runs" integer,
	"requires_institution_scope" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"estimated_duration_ms" integer,
	CONSTRAINT "job_definitions_type_unique" UNIQUE("job_type"),
	CONSTRAINT "job_definitions_max_attempts_check" CHECK ("job_definitions"."default_max_attempts" > 0),
	CONSTRAINT "job_definitions_visibility_timeout_check" CHECK ("job_definitions"."default_visibility_timeout_ms" >= 1000),
	CONSTRAINT "job_definitions_backoff_check" CHECK ("job_definitions"."retry_backoff_ms" >= 0),
	CONSTRAINT "job_definitions_concurrency_check" CHECK ("job_definitions"."max_concurrent_runs" is null or "job_definitions"."max_concurrent_runs" > 0),
	CONSTRAINT "job_definitions_concurrency_consistency_check" CHECK ("job_definitions"."allows_concurrency" or "job_definitions"."max_concurrent_runs" is null or "job_definitions"."max_concurrent_runs" = 1),
	CONSTRAINT "job_definitions_estimated_duration_check" CHECK ("job_definitions"."estimated_duration_ms" is null or "job_definitions"."estimated_duration_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"worker_id" varchar(128) NOT NULL,
	"started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp (3) with time zone,
	"duration_ms" integer,
	"succeeded" boolean DEFAULT false NOT NULL,
	"error_type" varchar(32),
	"error_message" text,
	"error_stack" text,
	"log_context" jsonb,
	"result" jsonb,
	"log_lines" jsonb,
	"correlation_id" varchar(96),
	CONSTRAINT "job_runs_attempt_number_check" CHECK ("job_runs"."attempt_number" > 0),
	CONSTRAINT "job_runs_duration_pair" CHECK (num_nonnulls("job_runs"."finished_at", "job_runs"."duration_ms") in (0, 2)),
	CONSTRAINT "job_runs_duration_check" CHECK ("job_runs"."duration_ms" is null or "job_runs"."duration_ms" >= 0),
	CONSTRAINT "job_runs_error_pair" CHECK (("job_runs"."succeeded" = true and "job_runs"."error_type" is null and "job_runs"."error_message" is null)
        or ("job_runs"."succeeded" = false and "job_runs"."error_type" is not null)),
	CONSTRAINT "job_runs_finished_pair" CHECK ("job_runs"."succeeded" = false or "job_runs"."finished_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "job_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"job_type" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"cron_expression" varchar(120),
	"interval_seconds" integer,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"payload_template" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_attempts" integer,
	"catch_up_policy" varchar(8) DEFAULT 'skip' NOT NULL,
	"last_enqueued_at" timestamp (3) with time zone,
	"next_run_at" timestamp (3) with time zone,
	"last_run_at" timestamp (3) with time zone,
	"last_job_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "job_schedules_trigger_check" CHECK (num_nonnulls("job_schedules"."cron_expression", "job_schedules"."interval_seconds") = 1),
	CONSTRAINT "job_schedules_interval_check" CHECK ("job_schedules"."interval_seconds" is null or "job_schedules"."interval_seconds" >= 60),
	CONSTRAINT "job_schedules_catch_up_check" CHECK ("job_schedules"."catch_up_policy" in ('skip', 'fire_all')),
	CONSTRAINT "job_schedules_max_attempts_check" CHECK ("job_schedules"."max_attempts" is null or "job_schedules"."max_attempts" > 0),
	CONSTRAINT "job_schedules_last_enqueued_pair" CHECK ("job_schedules"."last_job_id" is null or "job_schedules"."last_enqueued_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"job_type" varchar(64) NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_schema_version" integer DEFAULT 1 NOT NULL,
	"deduplicate_scope" varchar(200),
	"is_recurring" boolean DEFAULT false NOT NULL,
	"schedule_id" uuid,
	"max_attempts" integer,
	"claimed_by" varchar(128),
	"claimed_at" timestamp (3) with time zone,
	"heartbeat_at" timestamp (3) with time zone,
	"visibility_timeout_ms" integer DEFAULT 300000 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp (3) with time zone,
	"started_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	"dead_lettered_at" timestamp (3) with time zone,
	"dead_letter_reason" text,
	"last_error" text,
	"result" jsonb,
	"progress_note" varchar(300),
	"duration_ms" integer,
	"requested_by_user_id" uuid,
	"correlation_id" varchar(96),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "jobs_attempt_count_check" CHECK ("jobs"."attempt_count" >= 0),
	CONSTRAINT "jobs_max_attempts_check" CHECK ("jobs"."max_attempts" is null or "jobs"."max_attempts" > 0),
	CONSTRAINT "jobs_visibility_timeout_check" CHECK ("jobs"."visibility_timeout_ms" >= 1000),
	CONSTRAINT "jobs_schema_version_check" CHECK ("jobs"."payload_schema_version" > 0),
	CONSTRAINT "jobs_claim_pair" CHECK (num_nonnulls("jobs"."claimed_by", "jobs"."claimed_at") in (0, 2)),
	CONSTRAINT "jobs_heartbeat_pair" CHECK ("jobs"."heartbeat_at" is null or "jobs"."claimed_at" is not null),
	CONSTRAINT "jobs_started_pair" CHECK ("jobs"."started_at" is null or "jobs"."claimed_by" is not null),
	CONSTRAINT "jobs_completion_pair" CHECK (num_nonnulls("jobs"."completed_at", "jobs"."duration_ms") in (0, 2)),
	CONSTRAINT "jobs_completed_status_check" CHECK ("jobs"."status" <> 'completed' or "jobs"."completed_at" is not null),
	CONSTRAINT "jobs_dead_letter_pair" CHECK ("jobs"."status" <> 'dead_letter' or ("jobs"."dead_lettered_at" is not null and "jobs"."dead_letter_reason" is not null)),
	CONSTRAINT "jobs_exhausted_check" CHECK ("jobs"."status" <> 'dead_letter' or "jobs"."max_attempts" is null or "jobs"."attempt_count" >= "jobs"."max_attempts"),
	CONSTRAINT "jobs_deduplicate_scope_check" CHECK (("jobs"."is_recurring" and "jobs"."deduplicate_scope" is null) or (not "jobs"."is_recurring" and "jobs"."deduplicate_scope" is not null)),
	CONSTRAINT "jobs_schedule_pair" CHECK ("jobs"."is_recurring" = ("jobs"."schedule_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_institutions" ADD CONSTRAINT "user_institutions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_institutions" ADD CONSTRAINT "user_institutions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_scopes" ADD CONSTRAINT "permission_scopes_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_scopes" ADD CONSTRAINT "permission_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_scopes" ADD CONSTRAINT "permission_scopes_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campuses" ADD CONSTRAINT "campuses_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designations" ADD CONSTRAINT "designations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designations" ADD CONSTRAINT "designations_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_assignments" ADD CONSTRAINT "floor_assignments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_assignments" ADD CONSTRAINT "floor_assignments_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_change_sets" ADD CONSTRAINT "schedule_change_sets_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_change_sets" ADD CONSTRAINT "schedule_change_sets_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_publish_history" ADD CONSTRAINT "schedule_publish_history_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_placements" ADD CONSTRAINT "student_placements_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_placements" ADD CONSTRAINT "student_placements_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_placements" ADD CONSTRAINT "student_placements_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_placements" ADD CONSTRAINT "student_placements_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_previous_schools" ADD CONSTRAINT "student_previous_schools_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_guardian_user_id_guardians_user_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."guardians"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_authorizations" ADD CONSTRAINT "guardian_authorizations_guardian_user_id_guardians_user_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."guardians"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_authorizations" ADD CONSTRAINT "guardian_authorizations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_guardian_user_id_guardians_user_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."guardians"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_links" ADD CONSTRAINT "guardian_links_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian_snapshots" ADD CONSTRAINT "student_guardian_snapshots_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian_snapshots" ADD CONSTRAINT "student_guardian_snapshots_guardian_user_id_guardians_user_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."guardians"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_checklist_completions" ADD CONSTRAINT "admission_checklist_completions_admission_id_admissions_id_fk" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_checklist_completions" ADD CONSTRAINT "admission_checklist_completions_checklist_id_admission_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."admission_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_checklists" ADD CONSTRAINT "admission_checklists_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_admission_id_admissions_id_fk" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_status_history" ADD CONSTRAINT "admission_status_history_admission_id_admissions_id_fk" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_windows" ADD CONSTRAINT "admission_windows_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_windows" ADD CONSTRAINT "admission_windows_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_windows" ADD CONSTRAINT "admission_windows_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_windows" ADD CONSTRAINT "admission_windows_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_applied_class_id_classes_id_fk" FOREIGN KEY ("applied_class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_applied_group_id_groups_id_fk" FOREIGN KEY ("applied_group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_status_history" ADD CONSTRAINT "employee_status_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_designation_id_designations_id_fk" FOREIGN KEY ("designation_id") REFERENCES "public"."designations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_announcements" ADD CONSTRAINT "hr_announcements_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_attachments" ADD CONSTRAINT "leave_attachments_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_assignments" ADD CONSTRAINT "salary_assignments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_assignments" ADD CONSTRAINT "salary_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_assignments" ADD CONSTRAINT "salary_assignments_salary_structure_id_salary_structures_id_fk" FOREIGN KEY ("salary_structure_id") REFERENCES "public"."salary_structures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_designation_id_designations_id_fk" FOREIGN KEY ("designation_id") REFERENCES "public"."designations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_documents" ADD CONSTRAINT "teacher_documents_teacher_user_id_teachers_user_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."teachers"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_leave_balances" ADD CONSTRAINT "teacher_leave_balances_teacher_user_id_teachers_user_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."teachers"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_qualifications" ADD CONSTRAINT "teacher_qualifications_teacher_user_id_teachers_user_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."teachers"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacher_user_id_teachers_user_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."teachers"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_workload_history" ADD CONSTRAINT "teacher_workload_history_teacher_user_id_teachers_user_id_fk" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."teachers"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_device_id_biometric_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."biometric_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_biometric_transaction_id_biometric_transactions_id_fk" FOREIGN KEY ("biometric_transaction_id") REFERENCES "public"."biometric_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_summaries" ADD CONSTRAINT "daily_attendance_summaries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_summaries" ADD CONSTRAINT "daily_attendance_summaries_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_devices" ADD CONSTRAINT "biometric_devices_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_devices" ADD CONSTRAINT "biometric_devices_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_devices" ADD CONSTRAINT "biometric_devices_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_enrollments" ADD CONSTRAINT "biometric_enrollments_device_id_biometric_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."biometric_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_enrollments" ADD CONSTRAINT "biometric_enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_enrollments" ADD CONSTRAINT "biometric_enrollments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_transactions" ADD CONSTRAINT "biometric_transactions_device_id_biometric_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."biometric_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_transactions" ADD CONSTRAINT "biometric_transactions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_transactions" ADD CONSTRAINT "biometric_transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_transactions" ADD CONSTRAINT "biometric_transactions_resolved_time_slot_id_time_slots_id_fk" FOREIGN KEY ("resolved_time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_periods" ADD CONSTRAINT "extra_periods_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_periods" ADD CONSTRAINT "extra_periods_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_periods" ADD CONSTRAINT "extra_periods_replaces_schedule_id_schedules_id_fk" FOREIGN KEY ("replaces_schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_periods" ADD CONSTRAINT "extra_periods_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_periods" ADD CONSTRAINT "extra_periods_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_periods" ADD CONSTRAINT "extra_periods_absence_id_teacher_absences_id_fk" FOREIGN KEY ("absence_id") REFERENCES "public"."teacher_absences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_incident_reports" ADD CONSTRAINT "floor_incident_reports_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_incident_reports" ADD CONSTRAINT "floor_incident_reports_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_incident_reports" ADD CONSTRAINT "floor_incident_reports_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_incident_reports" ADD CONSTRAINT "floor_incident_reports_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_live_snapshots" ADD CONSTRAINT "floor_live_snapshots_floor_id_floors_id_fk" FOREIGN KEY ("floor_id") REFERENCES "public"."floors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_live_snapshots" ADD CONSTRAINT "floor_live_snapshots_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_live_snapshots" ADD CONSTRAINT "floor_live_snapshots_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_live_snapshots" ADD CONSTRAINT "floor_live_snapshots_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floor_live_snapshots" ADD CONSTRAINT "floor_live_snapshots_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_start_time_slot_id_time_slots_id_fk" FOREIGN KEY ("start_time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_end_time_slot_id_time_slots_id_fk" FOREIGN KEY ("end_time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_marks_corrections" ADD CONSTRAINT "exam_marks_corrections_examination_mark_id_examination_marks_id_fk" FOREIGN KEY ("examination_mark_id") REFERENCES "public"."examination_marks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_marks_corrections" ADD CONSTRAINT "exam_marks_corrections_corrected_by_user_id_users_id_fk" FOREIGN KEY ("corrected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_marks_corrections" ADD CONSTRAINT "exam_marks_corrections_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_marks" ADD CONSTRAINT "examination_marks_examination_id_examinations_id_fk" FOREIGN KEY ("examination_id") REFERENCES "public"."examinations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_marks" ADD CONSTRAINT "examination_marks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_marks" ADD CONSTRAINT "examination_marks_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_marks" ADD CONSTRAINT "examination_marks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_marks" ADD CONSTRAINT "examination_marks_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_marks" ADD CONSTRAINT "examination_marks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_marks" ADD CONSTRAINT "examination_marks_entered_by_user_id_users_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_registrations" ADD CONSTRAINT "examination_registrations_examination_id_examinations_id_fk" FOREIGN KEY ("examination_id") REFERENCES "public"."examinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_registrations" ADD CONSTRAINT "examination_registrations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examination_registrations" ADD CONSTRAINT "examination_registrations_withdrawn_by_user_id_users_id_fk" FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_set_by_teacher_user_id_users_id_fk" FOREIGN KEY ("set_by_teacher_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_bands" ADD CONSTRAINT "grading_bands_grading_scheme_id_grading_schemes_id_fk" FOREIGN KEY ("grading_scheme_id") REFERENCES "public"."grading_schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_schemes" ADD CONSTRAINT "grading_schemes_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_schemes" ADD CONSTRAINT "grading_schemes_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_schemes" ADD CONSTRAINT "grading_schemes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publication_log" ADD CONSTRAINT "result_publication_log_student_result_id_student_results_id_fk" FOREIGN KEY ("student_result_id") REFERENCES "public"."student_results"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publication_log" ADD CONSTRAINT "result_publication_log_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_results" ADD CONSTRAINT "student_results_grading_scheme_id_grading_schemes_id_fk" FOREIGN KEY ("grading_scheme_id") REFERENCES "public"."grading_schemes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_test_corrections" ADD CONSTRAINT "daily_test_corrections_daily_test_evaluation_id_daily_test_evaluations_id_fk" FOREIGN KEY ("daily_test_evaluation_id") REFERENCES "public"."daily_test_evaluations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_test_corrections" ADD CONSTRAINT "daily_test_corrections_corrected_by_user_id_users_id_fk" FOREIGN KEY ("corrected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_test_evaluations" ADD CONSTRAINT "daily_test_evaluations_daily_test_id_daily_tests_id_fk" FOREIGN KEY ("daily_test_id") REFERENCES "public"."daily_tests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_test_evaluations" ADD CONSTRAINT "daily_test_evaluations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_test_evaluations" ADD CONSTRAINT "daily_test_evaluations_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_test_evaluations" ADD CONSTRAINT "daily_test_evaluations_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_test_evaluations" ADD CONSTRAINT "daily_test_evaluations_entered_by_user_id_users_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_test_publications" ADD CONSTRAINT "daily_test_publications_daily_test_id_daily_tests_id_fk" FOREIGN KEY ("daily_test_id") REFERENCES "public"."daily_tests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_test_publications" ADD CONSTRAINT "daily_test_publications_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tests" ADD CONSTRAINT "daily_tests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tests" ADD CONSTRAINT "daily_tests_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tests" ADD CONSTRAINT "daily_tests_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tests" ADD CONSTRAINT "daily_tests_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tests" ADD CONSTRAINT "daily_tests_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tests" ADD CONSTRAINT "daily_tests_created_by_teacher_user_id_users_id_fk" FOREIGN KEY ("created_by_teacher_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_test_report_items" ADD CONSTRAINT "monthly_test_report_items_monthly_test_report_id_monthly_test_reports_id_fk" FOREIGN KEY ("monthly_test_report_id") REFERENCES "public"."monthly_test_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_test_report_items" ADD CONSTRAINT "monthly_test_report_items_daily_test_id_daily_tests_id_fk" FOREIGN KEY ("daily_test_id") REFERENCES "public"."daily_tests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_test_report_items" ADD CONSTRAINT "monthly_test_report_items_daily_test_evaluation_id_daily_test_evaluations_id_fk" FOREIGN KEY ("daily_test_evaluation_id") REFERENCES "public"."daily_test_evaluations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_test_reports" ADD CONSTRAINT "monthly_test_reports_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_test_reports" ADD CONSTRAINT "monthly_test_reports_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_test_reports" ADD CONSTRAINT "monthly_test_reports_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_test_reports" ADD CONSTRAINT "monthly_test_reports_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_test_reports" ADD CONSTRAINT "monthly_test_reports_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_test_reports" ADD CONSTRAINT "monthly_test_reports_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_test_reports" ADD CONSTRAINT "monthly_test_reports_superseded_by_report_id_monthly_test_reports_id_fk" FOREIGN KEY ("superseded_by_report_id") REFERENCES "public"."monthly_test_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_assignments" ADD CONSTRAINT "diary_assignments_diary_id_diaries_id_fk" FOREIGN KEY ("diary_id") REFERENCES "public"."diaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_assignments" ADD CONSTRAINT "diary_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_assignments" ADD CONSTRAINT "diary_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_assignments" ADD CONSTRAINT "diary_assignments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_assignments" ADD CONSTRAINT "diary_assignments_guardian_link_fk" FOREIGN KEY ("guardian_user_id","student_id") REFERENCES "public"."guardian_links"("guardian_user_id","student_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_attachments" ADD CONSTRAINT "diary_attachments_diary_id_diaries_id_fk" FOREIGN KEY ("diary_id") REFERENCES "public"."diaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_notification_preferences" ADD CONSTRAINT "diary_notification_preferences_guardian_user_id_guardians_user_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."guardians"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_notification_preferences" ADD CONSTRAINT "diary_notification_preferences_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_notifications" ADD CONSTRAINT "diary_notifications_diary_id_diaries_id_fk" FOREIGN KEY ("diary_id") REFERENCES "public"."diaries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_notifications" ADD CONSTRAINT "diary_notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_notifications" ADD CONSTRAINT "diary_notifications_guardian_user_id_guardians_user_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "public"."guardians"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_notifications" ADD CONSTRAINT "diary_notifications_diary_assignment_id_diary_assignments_id_fk" FOREIGN KEY ("diary_assignment_id") REFERENCES "public"."diary_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_notifications" ADD CONSTRAINT "diary_notifications_guardian_link_fk" FOREIGN KEY ("guardian_user_id","student_id") REFERENCES "public"."guardian_links"("guardian_user_id","student_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_reads" ADD CONSTRAINT "diary_reads_diary_id_diaries_id_fk" FOREIGN KEY ("diary_id") REFERENCES "public"."diaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_concessions" ADD CONSTRAINT "fee_concessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_concessions" ADD CONSTRAINT "fee_concessions_invoice_id_fee_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."fee_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_concessions" ADD CONSTRAINT "fee_concessions_fee_structure_id_fee_structures_id_fk" FOREIGN KEY ("fee_structure_id") REFERENCES "public"."fee_structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_deferrals" ADD CONSTRAINT "fee_deferrals_invoice_id_fee_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."fee_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_installments" ADD CONSTRAINT "fee_installments_payment_plan_id_fee_payment_plans_id_fk" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."fee_payment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_installments" ADD CONSTRAINT "fee_installments_paid_by_payment_id_payments_id_fk" FOREIGN KEY ("paid_by_payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_invoice_lines" ADD CONSTRAINT "fee_invoice_lines_invoice_id_fee_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."fee_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_invoice_lines" ADD CONSTRAINT "fee_invoice_lines_fee_structure_item_id_fee_structure_items_id_fk" FOREIGN KEY ("fee_structure_item_id") REFERENCES "public"."fee_structure_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_invoices" ADD CONSTRAINT "fee_invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payment_plans" ADD CONSTRAINT "fee_payment_plans_invoice_id_fee_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."fee_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payment_plans" ADD CONSTRAINT "fee_payment_plans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_audit" ADD CONSTRAINT "fee_structure_audit_fee_structure_id_fee_structures_id_fk" FOREIGN KEY ("fee_structure_id") REFERENCES "public"."fee_structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_fee_structure_id_fee_structures_id_fk" FOREIGN KEY ("fee_structure_id") REFERENCES "public"."fee_structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fee_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."fee_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reverses_payment_id_payments_id_fk" FOREIGN KEY ("reverses_payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_superseded_by_id_receipts_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_reconciliation_id_bank_reconciliations_id_fk" FOREIGN KEY ("reconciliation_id") REFERENCES "public"."bank_reconciliations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_expense_head_id_expense_heads_id_fk" FOREIGN KEY ("expense_head_id") REFERENCES "public"."expense_heads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_heads" ADD CONSTRAINT "expense_heads_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_heads" ADD CONSTRAINT "expense_heads_parent_head_id_expense_heads_id_fk" FOREIGN KEY ("parent_head_id") REFERENCES "public"."expense_heads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_heads" ADD CONSTRAINT "expense_heads_ledger_account_id_financial_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expense_head_id_expense_heads_id_fk" FOREIGN KEY ("expense_head_id") REFERENCES "public"."expense_heads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_journal_transaction_id_journal_transactions_id_fk" FOREIGN KEY ("journal_transaction_id") REFERENCES "public"."journal_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_transactions" ADD CONSTRAINT "journal_transactions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_transactions" ADD CONSTRAINT "journal_transactions_reverses_transaction_id_journal_transactions_id_fk" FOREIGN KEY ("reverses_transaction_id") REFERENCES "public"."journal_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_journal_transaction_id_journal_transactions_id_fk" FOREIGN KEY ("journal_transaction_id") REFERENCES "public"."journal_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_ledger_account_id_financial_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payroll_item_id_payroll_items_id_fk" FOREIGN KEY ("payroll_item_id") REFERENCES "public"."payroll_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_applied_by_user_id_users_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_calculation_sources" ADD CONSTRAINT "payroll_calculation_sources_payroll_item_id_payroll_items_id_fk" FOREIGN KEY ("payroll_item_id") REFERENCES "public"."payroll_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_teacher_id_teachers_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_salary_assignment_id_salary_assignments_id_fk" FOREIGN KEY ("salary_assignment_id") REFERENCES "public"."salary_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_processed_by_user_id_users_id_fk" FOREIGN KEY ("processed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payslips" ADD CONSTRAINT "payroll_payslips_payroll_item_id_payroll_items_id_fk" FOREIGN KEY ("payroll_item_id") REFERENCES "public"."payroll_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payslips" ADD CONSTRAINT "payroll_payslips_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payslips" ADD CONSTRAINT "payroll_payslips_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payslips" ADD CONSTRAINT "payroll_payslips_superseded_by_slip_id_payroll_payslips_id_fk" FOREIGN KEY ("superseded_by_slip_id") REFERENCES "public"."payroll_payslips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_period_locks" ADD CONSTRAINT "payroll_period_locks_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_period_locks" ADD CONSTRAINT "payroll_period_locks_locked_by_user_id_users_id_fk" FOREIGN KEY ("locked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_calculated_by_user_id_users_id_fk" FOREIGN KEY ("calculated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_actions" ADD CONSTRAINT "complaint_actions_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_actions" ADD CONSTRAINT "complaint_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_supersedes_attachment_id_complaint_attachments_id_fk" FOREIGN KEY ("supersedes_attachment_id") REFERENCES "public"."complaint_attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_withdrawn_by_user_id_users_id_fk" FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_parent_comment_id_complaint_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."complaint_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_edited_by_user_id_users_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_visibility" ADD CONSTRAINT "complaint_visibility_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_visibility" ADD CONSTRAINT "complaint_visibility_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_visibility" ADD CONSTRAINT "complaint_visibility_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_visibility" ADD CONSTRAINT "complaint_visibility_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_audiences" ADD CONSTRAINT "announcement_audiences_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_receipts" ADD CONSTRAINT "announcement_receipts_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_receipts" ADD CONSTRAINT "announcement_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_events" ADD CONSTRAINT "email_delivery_events_email_message_id_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setting_changes" ADD CONSTRAINT "setting_changes_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setting_changes" ADD CONSTRAINT "setting_changes_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_letter_jobs" ADD CONSTRAINT "dead_letter_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_letter_jobs" ADD CONSTRAINT "dead_letter_jobs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dead_letter_jobs" ADD CONSTRAINT "dead_letter_jobs_replayed_as_job_id_jobs_id_fk" FOREIGN KEY ("replayed_as_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_schedules" ADD CONSTRAINT "job_schedules_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_schedules" ADD CONSTRAINT "job_schedules_job_type_job_definitions_job_type_fk" FOREIGN KEY ("job_type") REFERENCES "public"."job_definitions"("job_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_job_type_job_definitions_job_type_fk" FOREIGN KEY ("job_type") REFERENCES "public"."job_definitions"("job_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "security_events_token_hash_key" ON "security_events" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "security_events_user_kind_idx" ON "security_events" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_active_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "user_institutions_institution_idx" ON "user_institutions" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "permission_scopes_role_idx" ON "permission_scopes" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "permission_scopes_user_idx" ON "permission_scopes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_scopes_unique" ON "permission_scopes" USING btree ("role_id","permission_id","scope_type","scope_id") WHERE "permission_scopes"."role_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "permission_scopes_user_unique" ON "permission_scopes" USING btree ("user_id","permission_id","scope_type","scope_id") WHERE "permission_scopes"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_slug_institution_key" ON "roles" USING btree ("institution_id","slug") WHERE "roles"."institution_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_system_slug_key" ON "roles" USING btree ("slug") WHERE "roles"."institution_id" is null;--> statement-breakpoint
CREATE INDEX "roles_institution_idx" ON "roles" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_permissions_live_grant_key" ON "user_permissions" USING btree ("user_id","permission_id","institution_id") WHERE "user_permissions"."revoked_at" is null and "user_permissions"."institution_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_permissions_live_global_key" ON "user_permissions" USING btree ("user_id","permission_id","effect") WHERE "user_permissions"."revoked_at" is null and "user_permissions"."institution_id" is null;--> statement-breakpoint
CREATE INDEX "user_permissions_permission_idx" ON "user_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "user_permissions_user_active_idx" ON "user_permissions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_live_grant_key" ON "user_roles" USING btree ("user_id","role_id","institution_id") WHERE "user_roles"."revoked_at" is null and "user_roles"."institution_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_live_global_key" ON "user_roles" USING btree ("user_id","role_id") WHERE "user_roles"."revoked_at" is null and "user_roles"."institution_id" is null;--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "user_roles_user_active_idx" ON "user_roles" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "user_roles_institution_active_idx" ON "user_roles" USING btree ("institution_id","role_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_sessions_institution_name_key" ON "academic_sessions" USING btree ("institution_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_sessions_one_current_key" ON "academic_sessions" USING btree ("institution_id") WHERE "academic_sessions"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "buildings_campus_slug_key" ON "buildings" USING btree ("campus_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "buildings_institution_slug_key" ON "buildings" USING btree ("institution_id","slug");--> statement-breakpoint
CREATE INDEX "buildings_institution_idx" ON "buildings" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campuses_institution_slug_key" ON "campuses" USING btree ("institution_id","slug");--> statement-breakpoint
CREATE INDEX "campuses_institution_idx" ON "campuses" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_institution_slug_key" ON "departments" USING btree ("institution_id","slug");--> statement-breakpoint
CREATE INDEX "departments_institution_idx" ON "departments" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "designations_institution_slug_key" ON "designations" USING btree ("institution_id","slug");--> statement-breakpoint
CREATE INDEX "designations_department_idx" ON "designations" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "floors_building_name_key" ON "floors" USING btree ("building_id","name");--> statement-breakpoint
CREATE INDEX "floors_institution_idx" ON "floors" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "institutions_code_key" ON "institutions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "institutions_slug_key" ON "institutions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "class_subjects_subject_idx" ON "class_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "class_subjects_class_idx" ON "class_subjects" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_subjects_group_idx" ON "class_subjects" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "class_subjects_section_idx" ON "class_subjects" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_teacher_assignments_unique" ON "class_teacher_assignments" USING btree ("teacher_id","subject_id","section_id","academic_session_id") WHERE "class_teacher_assignments"."section_id" is not null and "class_teacher_assignments"."subject_id" is not null;--> statement-breakpoint
CREATE INDEX "class_teacher_assignments_teacher_idx" ON "class_teacher_assignments" USING btree ("teacher_id","academic_session_id");--> statement-breakpoint
CREATE INDEX "class_teacher_assignments_section_idx" ON "class_teacher_assignments" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_session_name_key" ON "classes" USING btree ("academic_session_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_session_slug_key" ON "classes" USING btree ("academic_session_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "classes_session_grade_key" ON "classes" USING btree ("academic_session_id","grade_level");--> statement-breakpoint
CREATE INDEX "classes_institution_idx" ON "classes" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "floor_assignments_floor_user_key" ON "floor_assignments" USING btree ("floor_id","user_id");--> statement-breakpoint
CREATE INDEX "floor_assignments_user_idx" ON "floor_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "floor_assignments_floor_active_idx" ON "floor_assignments" USING btree ("floor_id","assigned_until");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_class_name_key" ON "groups" USING btree ("class_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_class_slug_key" ON "groups" USING btree ("class_id","slug");--> statement-breakpoint
CREATE INDEX "groups_institution_idx" ON "groups" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "schedule_change_sets_session_idx" ON "schedule_change_sets" USING btree ("academic_session_id","created_at");--> statement-breakpoint
CREATE INDEX "schedule_publish_history_schedule_idx" ON "schedule_publish_history" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "schedule_publish_history_session_idx" ON "schedule_publish_history" USING btree ("academic_session_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_section_slot_key" ON "schedules" USING btree ("section_id","academic_session_id","time_slot_id") WHERE "schedules"."kind" <> 'free';--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_teacher_slot_key" ON "schedules" USING btree ("teacher_id","academic_session_id","time_slot_id") WHERE "schedules"."kind" <> 'free' and "schedules"."teacher_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_floor_slot_key" ON "schedules" USING btree ("floor_id","academic_session_id","time_slot_id") WHERE "schedules"."kind" <> 'free' and "schedules"."floor_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "schedules_institution_slot_tenant_key" ON "schedules" USING btree ("institution_id","academic_session_id","time_slot_id","section_id") WHERE "schedules"."kind" <> 'free';--> statement-breakpoint
CREATE INDEX "schedules_teacher_idx" ON "schedules" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "schedules_section_idx" ON "schedules" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "schedules_session_idx" ON "schedules" USING btree ("academic_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_group_name_key" ON "sections" USING btree ("group_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_group_slug_key" ON "sections" USING btree ("group_id","slug");--> statement-breakpoint
CREATE INDEX "sections_floor_idx" ON "sections" USING btree ("floor_id");--> statement-breakpoint
CREATE INDEX "sections_institution_idx" ON "sections" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_institution_code_key" ON "subjects" USING btree ("institution_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_institution_slug_key" ON "subjects" USING btree ("institution_id","slug");--> statement-breakpoint
CREATE INDEX "subjects_department_idx" ON "subjects" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "time_slots_institution_session_idx" ON "time_slots" USING btree ("institution_id","academic_session_id");--> statement-breakpoint
CREATE INDEX "student_documents_student_idx" ON "student_documents" USING btree ("student_id","document_type");--> statement-breakpoint
CREATE INDEX "student_enrollments_student_idx" ON "student_enrollments" USING btree ("student_id","academic_year");--> statement-breakpoint
CREATE INDEX "student_enrollments_institution_year_idx" ON "student_enrollments" USING btree ("institution_id","academic_year");--> statement-breakpoint
CREATE INDEX "student_notes_student_idx" ON "student_notes" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_placements_one_current_key" ON "student_placements" USING btree ("student_id") WHERE "student_placements"."is_current" = true;--> statement-breakpoint
CREATE INDEX "student_placements_section_idx" ON "student_placements" USING btree ("section_id","academic_session_id");--> statement-breakpoint
CREATE INDEX "student_placements_class_idx" ON "student_placements" USING btree ("class_id","academic_session_id");--> statement-breakpoint
CREATE INDEX "student_placements_student_idx" ON "student_placements" USING btree ("student_id","placed_at");--> statement-breakpoint
CREATE INDEX "student_previous_schools_student_idx" ON "student_previous_schools" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_institution_admission_number_key" ON "students" USING btree ("institution_id","admission_number");--> statement-breakpoint
CREATE UNIQUE INDEX "students_institution_slug_key" ON "students" USING btree ("institution_id","slug");--> statement-breakpoint
CREATE INDEX "students_institution_lifecycle_idx" ON "students" USING btree ("institution_id","lifecycle");--> statement-breakpoint
CREATE INDEX "students_name_search_idx" ON "students" USING btree ("institution_id","last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_contacts_student_priority_key" ON "emergency_contacts" USING btree ("student_id","priority");--> statement-breakpoint
CREATE INDEX "guardian_authorizations_student_idx" ON "guardian_authorizations" USING btree ("student_id","scope");--> statement-breakpoint
CREATE INDEX "guardian_authorizations_guardian_idx" ON "guardian_authorizations" USING btree ("guardian_user_id");--> statement-breakpoint
CREATE INDEX "guardian_links_student_idx" ON "guardian_links" USING btree ("student_id","is_active");--> statement-breakpoint
CREATE INDEX "guardian_links_guardian_idx" ON "guardian_links" USING btree ("guardian_user_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_links_one_primary_key" ON "guardian_links" USING btree ("student_id") WHERE "guardian_links"."contact_type" = 'primary' and "guardian_links"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_phone_key" ON "guardians" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "guardians_name_search_idx" ON "guardians" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardian_snapshots_idempotency_key" ON "student_guardian_snapshots" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "student_guardian_snapshots_guardian_idx" ON "student_guardian_snapshots" USING btree ("guardian_user_id","report_type","sent_at");--> statement-breakpoint
CREATE INDEX "student_guardian_snapshots_student_idx" ON "student_guardian_snapshots" USING btree ("student_id","report_type");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_checklist_completions_unique" ON "admission_checklist_completions" USING btree ("admission_id","checklist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_checklists_institution_name_key" ON "admission_checklists" USING btree ("institution_id","name");--> statement-breakpoint
CREATE INDEX "admission_documents_admission_idx" ON "admission_documents" USING btree ("admission_id","document_type");--> statement-breakpoint
CREATE INDEX "admission_status_history_admission_idx" ON "admission_status_history" USING btree ("admission_id","changed_at");--> statement-breakpoint
CREATE INDEX "admission_windows_session_idx" ON "admission_windows" USING btree ("academic_session_id","opens_on");--> statement-breakpoint
CREATE UNIQUE INDEX "admissions_institution_application_number_key" ON "admissions" USING btree ("institution_id","application_number");--> statement-breakpoint
CREATE UNIQUE INDEX "admissions_institution_slug_key" ON "admissions" USING btree ("institution_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "admissions_converted_student_key" ON "admissions" USING btree ("student_id") WHERE "admissions"."student_id" is not null;--> statement-breakpoint
CREATE INDEX "admissions_institution_status_idx" ON "admissions" USING btree ("institution_id","status","created_at");--> statement-breakpoint
CREATE INDEX "admissions_name_search_idx" ON "admissions" USING btree ("institution_id","last_name","first_name");--> statement-breakpoint
CREATE INDEX "employee_attendance_date_idx" ON "employee_attendance" USING btree ("attendance_date","status");--> statement-breakpoint
CREATE INDEX "employee_documents_employee_idx" ON "employee_documents" USING btree ("employee_id","document_type");--> statement-breakpoint
CREATE INDEX "employee_status_history_employee_idx" ON "employee_status_history" USING btree ("employee_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_user_key" ON "employees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_institution_code_key" ON "employees" USING btree ("institution_id","employee_code");--> statement-breakpoint
CREATE INDEX "employees_institution_status_idx" ON "employees" USING btree ("institution_id","status");--> statement-breakpoint
CREATE INDEX "employees_department_idx" ON "employees" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "hr_announcements_institution_idx" ON "hr_announcements" USING btree ("institution_id","published_at");--> statement-breakpoint
CREATE INDEX "leave_attachments_request_idx" ON "leave_attachments" USING btree ("leave_request_id");--> statement-breakpoint
CREATE INDEX "leave_requests_institution_status_idx" ON "leave_requests" USING btree ("institution_id","status","from_date");--> statement-breakpoint
CREATE INDEX "leave_requests_student_idx" ON "leave_requests" USING btree ("student_id","from_date");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_idx" ON "leave_requests" USING btree ("employee_id","from_date");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_institution_code_key" ON "leave_types" USING btree ("institution_id","code");--> statement-breakpoint
CREATE INDEX "salary_assignments_employee_idx" ON "salary_assignments" USING btree ("employee_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "salary_assignments_one_current_key" ON "salary_assignments" USING btree ("employee_id") WHERE "salary_assignments"."effective_to" is null;--> statement-breakpoint
CREATE INDEX "salary_structures_institution_effective_idx" ON "salary_structures" USING btree ("institution_id","effective_from");--> statement-breakpoint
CREATE INDEX "salary_structures_designation_idx" ON "salary_structures" USING btree ("designation_id");--> statement-breakpoint
CREATE INDEX "teacher_documents_teacher_idx" ON "teacher_documents" USING btree ("teacher_user_id","document_type");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_leave_balances_unique" ON "teacher_leave_balances" USING btree ("teacher_user_id","leave_type_id","academic_session_id");--> statement-breakpoint
CREATE INDEX "teacher_qualifications_teacher_idx" ON "teacher_qualifications" USING btree ("teacher_user_id","qualification_type");--> statement-breakpoint
CREATE INDEX "teacher_subjects_subject_idx" ON "teacher_subjects" USING btree ("subject_id","is_verified");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_workload_history_session_key" ON "teacher_workload_history" USING btree ("teacher_user_id","academic_session_id");--> statement-breakpoint
CREATE INDEX "teacher_workload_history_session_idx" ON "teacher_workload_history" USING btree ("academic_session_id","periods_taught");--> statement-breakpoint
CREATE INDEX "teachers_institution_idx" ON "teachers" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "teachers_department_idx" ON "teachers" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teachers_institution_code_key" ON "teachers" USING btree ("institution_id","employee_code") WHERE "teachers"."employee_code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_corrections_one_per_mark_key" ON "attendance_corrections" USING btree ("section_id","attendance_date","time_slot_id","student_id");--> statement-breakpoint
CREATE INDEX "attendance_corrections_student_idx" ON "attendance_corrections" USING btree ("student_id","corrected_at");--> statement-breakpoint
CREATE INDEX "attendance_exceptions_institution_open_idx" ON "attendance_exceptions" USING btree ("institution_id","attendance_date","kind") WHERE "attendance_exceptions"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "attendance_records_section_date_idx" ON "attendance_records" USING btree ("section_id","attendance_date");--> statement-breakpoint
CREATE INDEX "attendance_records_student_date_idx" ON "attendance_records" USING btree ("student_id","attendance_date");--> statement-breakpoint
CREATE INDEX "attendance_records_status_idx" ON "attendance_records" USING btree ("attendance_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_sessions_slot_key" ON "attendance_sessions" USING btree ("section_id","attendance_date","time_slot_id");--> statement-breakpoint
CREATE INDEX "attendance_sessions_opened_by_idx" ON "attendance_sessions" USING btree ("opened_by_user_id","attendance_date");--> statement-breakpoint
CREATE INDEX "daily_attendance_summaries_month_idx" ON "daily_attendance_summaries" USING btree ("month","academic_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "biometric_devices_key_key" ON "biometric_devices" USING btree ("device_key");--> statement-breakpoint
CREATE INDEX "biometric_devices_institution_idx" ON "biometric_devices" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "biometric_enrollments_device_template_key" ON "biometric_enrollments" USING btree ("device_id","template_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "biometric_enrollments_student_key" ON "biometric_enrollments" USING btree ("device_id","student_id") WHERE "biometric_enrollments"."student_id" is not null and "biometric_enrollments"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "biometric_enrollments_employee_key" ON "biometric_enrollments" USING btree ("device_id","employee_id") WHERE "biometric_enrollments"."employee_id" is not null and "biometric_enrollments"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "biometric_enrollments_student_idx" ON "biometric_enrollments" USING btree ("student_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "biometric_transactions_device_event_key" ON "biometric_transactions" USING btree ("device_id","device_event_id");--> statement-breakpoint
CREATE INDEX "biometric_transactions_device_time_idx" ON "biometric_transactions" USING btree ("device_id","device_time");--> statement-breakpoint
CREATE INDEX "biometric_transactions_student_idx" ON "biometric_transactions" USING btree ("student_id","device_time");--> statement-breakpoint
CREATE INDEX "biometric_transactions_verification_idx" ON "biometric_transactions" USING btree ("verification","received_at");--> statement-breakpoint
CREATE INDEX "extra_periods_teacher_idx" ON "extra_periods" USING btree ("teacher_id","extra_date");--> statement-breakpoint
CREATE INDEX "extra_periods_date_idx" ON "extra_periods" USING btree ("institution_id","extra_date");--> statement-breakpoint
CREATE INDEX "extra_periods_payable_idx" ON "extra_periods" USING btree ("extra_date","teacher_id") WHERE "extra_periods"."is_payable" = true and "extra_periods"."consumed_by_pay_line_id" is null;--> statement-breakpoint
CREATE INDEX "floor_incident_reports_institution_open_idx" ON "floor_incident_reports" USING btree ("institution_id","severity","occurred_at") WHERE "floor_incident_reports"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "floor_incident_reports_floor_idx" ON "floor_incident_reports" USING btree ("floor_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "floor_live_snapshots_unique" ON "floor_live_snapshots" USING btree ("floor_id","schedule_id","attendance_date");--> statement-breakpoint
CREATE INDEX "floor_live_snapshots_floor_date_idx" ON "floor_live_snapshots" USING btree ("floor_id","attendance_date","time_slot_id");--> statement-breakpoint
CREATE INDEX "floor_live_snapshots_teacher_idx" ON "floor_live_snapshots" USING btree ("teacher_id","attendance_date");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_absences_employee_date_key" ON "teacher_absences" USING btree ("employee_id","absence_date","scope");--> statement-breakpoint
CREATE INDEX "teacher_absences_date_idx" ON "teacher_absences" USING btree ("institution_id","absence_date");--> statement-breakpoint
CREATE INDEX "teacher_absences_employee_idx" ON "teacher_absences" USING btree ("employee_id","absence_date");--> statement-breakpoint
CREATE INDEX "exam_marks_corrections_mark_idx" ON "exam_marks_corrections" USING btree ("examination_mark_id","corrected_at");--> statement-breakpoint
CREATE INDEX "exam_marks_corrections_actor_idx" ON "exam_marks_corrections" USING btree ("corrected_by_user_id","corrected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "examination_marks_unique" ON "examination_marks" USING btree ("examination_id","student_id");--> statement-breakpoint
CREATE INDEX "examination_marks_student_idx" ON "examination_marks" USING btree ("student_id","academic_session_id");--> statement-breakpoint
CREATE INDEX "examination_marks_class_idx" ON "examination_marks" USING btree ("class_id","section_id","examination_id");--> statement-breakpoint
CREATE INDEX "examination_marks_subject_session_idx" ON "examination_marks" USING btree ("subject_id","academic_session_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "examination_registrations_unique" ON "examination_registrations" USING btree ("examination_id","student_id");--> statement-breakpoint
CREATE INDEX "examination_registrations_student_idx" ON "examination_registrations" USING btree ("student_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "examination_registrations_seat_key" ON "examination_registrations" USING btree ("examination_id","seat_number") WHERE "examination_registrations"."seat_number" is not null;--> statement-breakpoint
CREATE INDEX "examinations_institution_date_idx" ON "examinations" USING btree ("institution_id","exam_date");--> statement-breakpoint
CREATE INDEX "examinations_subject_idx" ON "examinations" USING btree ("subject_id","academic_session_id");--> statement-breakpoint
CREATE INDEX "examinations_class_idx" ON "examinations" USING btree ("class_id","section_id","status");--> statement-breakpoint
CREATE INDEX "grading_bands_scheme_percentage_idx" ON "grading_bands" USING btree ("grading_scheme_id","min_percentage");--> statement-breakpoint
CREATE INDEX "grading_bands_scheme_marks_idx" ON "grading_bands" USING btree ("grading_scheme_id","min_marks");--> statement-breakpoint
CREATE UNIQUE INDEX "grading_bands_percentage_unique" ON "grading_bands" USING btree ("grading_scheme_id","min_percentage") WHERE "grading_bands"."min_percentage" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "grading_bands_marks_unique" ON "grading_bands" USING btree ("grading_scheme_id","min_marks") WHERE "grading_bands"."min_marks" is not null;--> statement-breakpoint
CREATE INDEX "grading_schemes_institution_idx" ON "grading_schemes" USING btree ("institution_id","is_active","is_default");--> statement-breakpoint
CREATE INDEX "grading_schemes_subject_idx" ON "grading_schemes" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "result_publication_log_unique" ON "result_publication_log" USING btree ("student_result_id","channel");--> statement-breakpoint
CREATE INDEX "result_publication_log_status_idx" ON "result_publication_log" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_results_unique" ON "student_results" USING btree ("student_id","academic_session_id");--> statement-breakpoint
CREATE INDEX "student_results_class_idx" ON "student_results" USING btree ("academic_session_id","class_id","section_id");--> statement-breakpoint
CREATE INDEX "student_results_session_status_idx" ON "student_results" USING btree ("academic_session_id","result_status");--> statement-breakpoint
CREATE INDEX "daily_test_corrections_eval_idx" ON "daily_test_corrections" USING btree ("daily_test_evaluation_id","corrected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_test_evaluations_unique" ON "daily_test_evaluations" USING btree ("daily_test_id","student_id");--> statement-breakpoint
CREATE INDEX "daily_test_evaluations_student_idx" ON "daily_test_evaluations" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "daily_test_evaluations_class_idx" ON "daily_test_evaluations" USING btree ("class_id","section_id","daily_test_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_test_publications_unique" ON "daily_test_publications" USING btree ("daily_test_id","channel");--> statement-breakpoint
CREATE INDEX "daily_tests_institution_date_idx" ON "daily_tests" USING btree ("institution_id","test_date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_tests_teacher_subject_day_key" ON "daily_tests" USING btree ("created_by_teacher_user_id","subject_id","test_date");--> statement-breakpoint
CREATE INDEX "daily_tests_subject_idx" ON "daily_tests" USING btree ("subject_id","academic_session_id","status");--> statement-breakpoint
CREATE INDEX "daily_tests_class_idx" ON "daily_tests" USING btree ("class_id","section_id","test_date");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_test_report_items_unique" ON "monthly_test_report_items" USING btree ("monthly_test_report_id","daily_test_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_test_report_items_eval_unique" ON "monthly_test_report_items" USING btree ("monthly_test_report_id","daily_test_evaluation_id");--> statement-breakpoint
CREATE INDEX "monthly_test_report_items_test_idx" ON "monthly_test_report_items" USING btree ("daily_test_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_test_reports_unique" ON "monthly_test_reports" USING btree ("student_id","subject_id","academic_session_id","period_start") WHERE "monthly_test_reports"."superseded_by_report_id" is null;--> statement-breakpoint
CREATE INDEX "monthly_test_reports_institution_period_idx" ON "monthly_test_reports" USING btree ("institution_id","period_start","status");--> statement-breakpoint
CREATE INDEX "monthly_test_reports_class_idx" ON "monthly_test_reports" USING btree ("class_id","section_id","period_start");--> statement-breakpoint
CREATE INDEX "monthly_test_reports_awaiting_email_idx" ON "monthly_test_reports" USING btree ("period_start","email_sent_at") WHERE "monthly_test_reports"."status" = 'published' and "monthly_test_reports"."email_sent_at" is null and "monthly_test_reports"."superseded_by_report_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "diaries_subject_date_key" ON "diaries" USING btree ("subject_id","diary_date");--> statement-breakpoint
CREATE INDEX "diaries_institution_date_idx" ON "diaries" USING btree ("institution_id","diary_date","status");--> statement-breakpoint
CREATE INDEX "diaries_class_idx" ON "diaries" USING btree ("class_id","section_id","diary_date");--> statement-breakpoint
CREATE INDEX "diaries_session_date_idx" ON "diaries" USING btree ("academic_session_id","diary_date");--> statement-breakpoint
CREATE UNIQUE INDEX "diary_assignments_unique" ON "diary_assignments" USING btree ("diary_id","student_id");--> statement-breakpoint
CREATE INDEX "diary_assignments_student_idx" ON "diary_assignments" USING btree ("student_id","assigned_at");--> statement-breakpoint
CREATE INDEX "diary_assignments_guardian_idx" ON "diary_assignments" USING btree ("guardian_user_id","assigned_at");--> statement-breakpoint
CREATE INDEX "diary_attachments_diary_idx" ON "diary_attachments" USING btree ("diary_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diary_notification_preferences_unique" ON "diary_notification_preferences" USING btree ("guardian_user_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diary_notifications_assignment_guardian_key" ON "diary_notifications" USING btree ("diary_assignment_id","guardian_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diary_notifications_idempotency_key" ON "diary_notifications" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "diary_notifications_pending_idx" ON "diary_notifications" USING btree ("created_at") WHERE "diary_notifications"."status" in ('pending', 'queued');--> statement-breakpoint
CREATE INDEX "diary_notifications_diary_idx" ON "diary_notifications" USING btree ("diary_id","status");--> statement-breakpoint
CREATE INDEX "diary_notifications_guardian_idx" ON "diary_notifications" USING btree ("guardian_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "diary_reads_unique" ON "diary_reads" USING btree ("diary_id","viewer_kind","viewer_id");--> statement-breakpoint
CREATE INDEX "diary_reads_viewer_idx" ON "diary_reads" USING btree ("viewer_kind","viewer_id","read_at");--> statement-breakpoint
CREATE INDEX "fee_concessions_student_idx" ON "fee_concessions" USING btree ("student_id","granted_at");--> statement-breakpoint
CREATE INDEX "fee_concessions_invoice_idx" ON "fee_concessions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "fee_deferrals_invoice_idx" ON "fee_deferrals" USING btree ("invoice_id","is_approved");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_installments_sequence_key" ON "fee_installments" USING btree ("payment_plan_id","sequence");--> statement-breakpoint
CREATE INDEX "fee_installments_due_idx" ON "fee_installments" USING btree ("due_on");--> statement-breakpoint
CREATE INDEX "fee_invoice_lines_invoice_idx" ON "fee_invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_invoices_number_key" ON "fee_invoices" USING btree ("institution_id","academic_session_id","invoice_number");--> statement-breakpoint
CREATE INDEX "fee_invoices_student_status_idx" ON "fee_invoices" USING btree ("student_id","status","due_on");--> statement-breakpoint
CREATE INDEX "fee_invoices_institution_due_idx" ON "fee_invoices" USING btree ("institution_id","due_on","status");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_payment_plans_one_active_key" ON "fee_payment_plans" USING btree ("invoice_id") WHERE "fee_payment_plans"."status" in ('active', 'approved');--> statement-breakpoint
CREATE INDEX "fee_payment_plans_student_idx" ON "fee_payment_plans" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "fee_structure_audit_structure_idx" ON "fee_structure_audit" USING btree ("fee_structure_id","changed_at");--> statement-breakpoint
CREATE INDEX "fee_structure_items_structure_idx" ON "fee_structure_items" USING btree ("fee_structure_id","sort_order");--> statement-breakpoint
CREATE INDEX "fee_structures_institution_idx" ON "fee_structures" USING btree ("institution_id","is_active");--> statement-breakpoint
CREATE INDEX "fee_structures_effective_idx" ON "fee_structures" USING btree ("institution_id","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_number_key" ON "payments" USING btree ("institution_id","payment_number");--> statement-breakpoint
CREATE INDEX "payments_deposited_to_idx" ON "payments" USING btree ("deposited_to_account_id","received_on");--> statement-breakpoint
CREATE INDEX "payments_student_idx" ON "payments" USING btree ("student_id","received_on");--> statement-breakpoint
CREATE INDEX "payments_institution_date_idx" ON "payments" USING btree ("institution_id","received_on","method");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_number_key" ON "receipts" USING btree ("institution_id","receipt_number");--> statement-breakpoint
CREATE INDEX "receipts_payment_idx" ON "receipts" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "bank_reconciliation_items_reconciliation_idx" ON "bank_reconciliation_items" USING btree ("reconciliation_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_reconciliation_items_entry_key" ON "bank_reconciliation_items" USING btree ("ledger_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_reconciliation_items_reference_key" ON "bank_reconciliation_items" USING btree ("reconciliation_id","statement_line_reference") WHERE "bank_reconciliation_items"."statement_line_reference" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_reconciliations_period_key" ON "bank_reconciliations" USING btree ("account_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "bank_reconciliations_status_idx" ON "bank_reconciliations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_period_key" ON "budgets" USING btree ("institution_id","expense_head_id","department_id","period");--> statement-breakpoint
CREATE INDEX "budgets_institution_period_idx" ON "budgets" USING btree ("institution_id","period");--> statement-breakpoint
CREATE INDEX "expense_heads_institution_idx" ON "expense_heads" USING btree ("institution_id","is_active");--> statement-breakpoint
CREATE INDEX "expense_heads_parent_idx" ON "expense_heads" USING btree ("parent_head_id");--> statement-breakpoint
CREATE INDEX "expenses_institution_status_idx" ON "expenses" USING btree ("institution_id","status","incurred_on");--> statement-breakpoint
CREATE INDEX "expenses_head_idx" ON "expenses" USING btree ("expense_head_id","incurred_on");--> statement-breakpoint
CREATE INDEX "financial_accounts_institution_idx" ON "financial_accounts" USING btree ("institution_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_number_key" ON "financial_accounts" USING btree ("institution_id","account_number") WHERE "financial_accounts"."account_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_periods_institution_name_key" ON "financial_periods" USING btree ("institution_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_transactions_reference_key" ON "journal_transactions" USING btree ("institution_id","reference_number");--> statement-breakpoint
CREATE INDEX "journal_transactions_institution_date_idx" ON "journal_transactions" USING btree ("institution_id","transaction_on","status");--> statement-breakpoint
CREATE INDEX "journal_transactions_payment_idx" ON "journal_transactions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_journal_idx" ON "ledger_entries" USING btree ("journal_transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_category_idx" ON "ledger_entries" USING btree ("category","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_institution_name_key" ON "payment_methods" USING btree ("institution_id","name");--> statement-breakpoint
CREATE INDEX "payment_methods_institution_active_idx" ON "payment_methods" USING btree ("institution_id","is_active");--> statement-breakpoint
CREATE INDEX "payroll_adjustments_item_idx" ON "payroll_adjustments" USING btree ("payroll_item_id");--> statement-breakpoint
CREATE INDEX "payroll_adjustments_applied_by_idx" ON "payroll_adjustments" USING btree ("applied_by_user_id","applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_calculation_sources_unique" ON "payroll_calculation_sources" USING btree ("payroll_item_id","source_type","source_record_id");--> statement-breakpoint
CREATE INDEX "payroll_calculation_sources_record_idx" ON "payroll_calculation_sources" USING btree ("source_type","source_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_items_run_employee_key" ON "payroll_items" USING btree ("payroll_run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payroll_items_run_idx" ON "payroll_items" USING btree ("payroll_run_id","is_excluded");--> statement-breakpoint
CREATE INDEX "payroll_items_employee_idx" ON "payroll_items" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payroll_items_teacher_idx" ON "payroll_items" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_payments_run_account_key" ON "payroll_payments" USING btree ("payroll_run_id","ledger_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_payments_reference_key" ON "payroll_payments" USING btree ("institution_id","payment_reference") WHERE "payroll_payments"."payment_reference" is not null;--> statement-breakpoint
CREATE INDEX "payroll_payments_status_idx" ON "payroll_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payroll_payments_institution_idx" ON "payroll_payments" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_payslips_number_key" ON "payroll_payslips" USING btree ("institution_id","slip_number");--> statement-breakpoint
CREATE INDEX "payroll_payslips_item_idx" ON "payroll_payslips" USING btree ("payroll_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_period_locks_period_key" ON "payroll_period_locks" USING btree ("institution_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_period_key" ON "payroll_runs" USING btree ("institution_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "payroll_runs_institution_status_idx" ON "payroll_runs" USING btree ("institution_id","status","period_start");--> statement-breakpoint
CREATE INDEX "complaint_actions_complaint_idx" ON "complaint_actions" USING btree ("complaint_id","occurred_at");--> statement-breakpoint
CREATE INDEX "complaint_actions_actor_idx" ON "complaint_actions" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "complaint_attachments_complaint_idx" ON "complaint_attachments" USING btree ("complaint_id","is_current");--> statement-breakpoint
CREATE INDEX "complaint_attachments_supersedes_idx" ON "complaint_attachments" USING btree ("supersedes_attachment_id");--> statement-breakpoint
CREATE INDEX "complaint_comments_complaint_idx" ON "complaint_comments" USING btree ("complaint_id","created_at");--> statement-breakpoint
CREATE INDEX "complaint_comments_parent_idx" ON "complaint_comments" USING btree ("parent_comment_id","created_at");--> statement-breakpoint
CREATE INDEX "complaint_comments_author_idx" ON "complaint_comments" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "complaint_visibility_unique" ON "complaint_visibility" USING btree ("complaint_id","user_id") WHERE "complaint_visibility"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "complaint_visibility_user_idx" ON "complaint_visibility" USING btree ("user_id","revoked_at","expires_at");--> statement-breakpoint
CREATE INDEX "complaint_visibility_complaint_idx" ON "complaint_visibility" USING btree ("complaint_id");--> statement-breakpoint
CREATE INDEX "complaints_institution_status_idx" ON "complaints" USING btree ("institution_id","status","reported_at");--> statement-breakpoint
CREATE INDEX "complaints_student_idx" ON "complaints" USING btree ("student_id","reported_at");--> statement-breakpoint
CREATE INDEX "complaints_reported_by_idx" ON "complaints" USING btree ("reported_by_user_id","reported_at");--> statement-breakpoint
CREATE INDEX "complaints_assigned_idx" ON "complaints" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "complaints_class_idx" ON "complaints" USING btree ("class_id","section_id","reported_date");--> statement-breakpoint
CREATE INDEX "complaints_severity_idx" ON "complaints" USING btree ("institution_id","severity","status");--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_audiences_everyone_key" ON "announcement_audiences" USING btree ("announcement_id") WHERE "announcement_audiences"."audience_type" = 'everyone';--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_audiences_target_key" ON "announcement_audiences" USING btree ("announcement_id","audience_type","audience_id") WHERE "announcement_audiences"."audience_type" <> 'everyone';--> statement-breakpoint
CREATE INDEX "announcement_audiences_lookup_idx" ON "announcement_audiences" USING btree ("audience_type","audience_id");--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_receipts_unique" ON "announcement_receipts" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX "announcement_receipts_pending_ack_idx" ON "announcement_receipts" USING btree ("announcement_id","acknowledged_at") WHERE "announcement_receipts"."acknowledged_at" is null;--> statement-breakpoint
CREATE INDEX "announcement_receipts_user_idx" ON "announcement_receipts" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "announcements_institution_status_idx" ON "announcements" USING btree ("institution_id","status","published_at");--> statement-breakpoint
CREATE INDEX "announcements_publish_queue_idx" ON "announcements" USING btree ("publish_at") WHERE "announcements"."status" = 'published' and "announcements"."publish_at" is not null;--> statement-breakpoint
CREATE INDEX "email_delivery_events_message_idx" ON "email_delivery_events" USING btree ("email_message_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_idempotency_key" ON "email_messages" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "email_messages_queue_idx" ON "email_messages" USING btree ("next_attempt_at","created_at") WHERE "email_messages"."status" in ('queued', 'sending');--> statement-breakpoint
CREATE INDEX "email_messages_status_idx" ON "email_messages" USING btree ("status","sent_at");--> statement-breakpoint
CREATE INDEX "email_messages_to_idx" ON "email_messages" USING btree ("to_user_id","created_at");--> statement-breakpoint
CREATE INDEX "email_messages_type_idx" ON "email_messages" USING btree ("email_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_active_key" ON "email_templates" USING btree ("template_key","locale") WHERE "email_templates"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_key_version_unique" ON "email_templates" USING btree ("template_key","locale","version");--> statement-breakpoint
CREATE INDEX "email_templates_lookup_idx" ON "email_templates" USING btree ("template_key","is_active","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_unique" ON "notification_deliveries" USING btree ("notification_id","recipient_user_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_inbox_idx" ON "notification_deliveries" USING btree ("recipient_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_pending_idx" ON "notification_deliveries" USING btree ("created_at") WHERE "notification_deliveries"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "notification_deliveries_audience_idx" ON "notification_deliveries" USING btree ("audience_type","audience_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_unique" ON "notification_preferences" USING btree ("user_id","category") WHERE "notification_preferences"."category" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_default_unique" ON "notification_preferences" USING btree ("user_id") WHERE "notification_preferences"."category" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_event_channel_key" ON "notifications" USING btree ("event_key","related_entity_id","channel") WHERE "notifications"."related_entity_id" is not null and "notifications"."scheduled_for" is null;--> statement-breakpoint
CREATE INDEX "notifications_audience_idx" ON "notifications" USING btree ("institution_id","audience_type","audience_id");--> statement-breakpoint
CREATE INDEX "notifications_pending_idx" ON "notifications" USING btree ("scheduled_for") WHERE "notifications"."scheduled_for" is not null;--> statement-breakpoint
CREATE INDEX "notifications_source_idx" ON "notifications" USING btree ("source_module","event_key");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_denied_idx" ON "audit_events" USING btree ("occurred_at") WHERE "audit_events"."result" <> 'success';--> statement-breakpoint
CREATE INDEX "audit_events_institution_idx" ON "audit_events" USING btree ("institution_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "setting_changes_key_idx" ON "setting_changes" USING btree ("institution_id","setting_key","changed_at");--> statement-breakpoint
CREATE INDEX "setting_changes_actor_idx" ON "setting_changes" USING btree ("changed_by_user_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "system_settings_key_unique" ON "system_settings" USING btree ("institution_id","setting_key");--> statement-breakpoint
CREATE INDEX "system_settings_category_idx" ON "system_settings" USING btree ("institution_id","setting_category","setting_key");--> statement-breakpoint
CREATE INDEX "system_settings_client_readable_idx" ON "system_settings" USING btree ("institution_id") WHERE "system_settings"."is_client_readable" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "dead_letter_jobs_job_unique" ON "dead_letter_jobs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "dead_letter_jobs_unacknowledged_idx" ON "dead_letter_jobs" USING btree ("dead_lettered_at") WHERE "dead_letter_jobs"."acknowledged_at" is null;--> statement-breakpoint
CREATE INDEX "dead_letter_jobs_unresolved_idx" ON "dead_letter_jobs" USING btree ("dead_lettered_at") WHERE "dead_letter_jobs"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "dead_letter_jobs_type_idx" ON "dead_letter_jobs" USING btree ("job_type","resolved_at");--> statement-breakpoint
CREATE INDEX "job_definitions_active_idx" ON "job_definitions" USING btree ("is_active","job_type");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_job_attempt_unique" ON "job_runs" USING btree ("job_id","attempt_number");--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job_id","attempt_number");--> statement-breakpoint
CREATE INDEX "job_runs_failure_idx" ON "job_runs" USING btree ("error_type","started_at") WHERE "job_runs"."succeeded" = false;--> statement-breakpoint
CREATE INDEX "job_runs_worker_idx" ON "job_runs" USING btree ("worker_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_schedules_name_unique" ON "job_schedules" USING btree ("institution_id","name");--> statement-breakpoint
CREATE INDEX "job_schedules_due_idx" ON "job_schedules" USING btree ("next_run_at") WHERE "job_schedules"."is_active" = true and "job_schedules"."next_run_at" is not null;--> statement-breakpoint
CREATE INDEX "job_schedules_type_idx" ON "job_schedules" USING btree ("job_type","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_key_unique" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("next_attempt_at","created_at") WHERE "jobs"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "jobs_stale_claim_idx" ON "jobs" USING btree ("claimed_at") WHERE "jobs"."status" = 'running' and "jobs"."claimed_by" is not null;--> statement-breakpoint
CREATE INDEX "jobs_dead_letter_idx" ON "jobs" USING btree ("dead_lettered_at") WHERE "jobs"."status" = 'dead_letter';--> statement-breakpoint
CREATE INDEX "jobs_type_status_idx" ON "jobs" USING btree ("job_type","status","created_at");--> statement-breakpoint
CREATE INDEX "jobs_institution_idx" ON "jobs" USING btree ("institution_id","status","created_at");--> statement-breakpoint
CREATE INDEX "jobs_schedule_idx" ON "jobs" USING btree ("schedule_id","created_at");