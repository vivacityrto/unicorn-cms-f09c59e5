import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  "../../migrations/20260914120000_academy_solo_access_boundary.sql",
);
const staffMigrationPath = resolve(
  here,
  "../../migrations/20260914060040_academy_solo_internal_staff_and_demo_invite_support.sql",
);
const provisioningMigrationPath = resolve(
  here,
  "../../migrations/20260914064041_academy_solo_account_provisioning.sql",
);

const migration = await readFile(migrationPath, "utf8");
const staffMigration = await readFile(staffMigrationPath, "utf8");
const provisioningMigration = await readFile(provisioningMigrationPath, "utf8");

test("Academy Solo migration has a recursion-safe server entitlement gate", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.has_academy_access_safe\(p_user_id uuid\)/);
  assert.match(migration, /t\.academy_access_enabled IS TRUE/);
  assert.match(migration, /tu\.access_scope IS NULL OR tu\.access_scope IN \('full', 'academy_only'\)/);
  assert.match(migration, /t\.academy_subscription_expires_at IS NULL OR t\.academy_subscription_expires_at > now\(\)/);
  assert.match(migration, /u\.disabled IS DISTINCT FROM TRUE/);
  assert.match(migration, /u\.archived IS DISTINCT FROM TRUE/);
  assert.match(migration, /SET row_security = off/);
});

test("published catalogue, lesson outline, and enrolment paths require Academy access", () => {
  assert.match(migration, /Academy courses: Academy users view published[\s\S]*has_academy_access_safe/);
  assert.match(migration, /Academy modules: Academy users view published outline[\s\S]*has_academy_access_safe/);
  assert.match(migration, /CREATE OR REPLACE VIEW public\.v_academy_lesson_outline[\s\S]*has_academy_access_safe/);
  assert.match(migration, /Enrollments: Academy users self-enrol[\s\S]*has_academy_access_safe/);
});

test("ended access retains history but blocks progress writes", () => {
  assert.match(migration, /Lesson progress: users view own history/);
  assert.match(migration, /Lesson progress: active Academy users manage own/);
  assert.match(migration, /academy_lesson_progress\.enrollment_id[\s\S]*e\.status IN \('active', 'completed'\)/);
  assert.match(migration, /Attempts: users view own history/);
  assert.match(migration, /Attempts: active Academy users manage own/);
  assert.match(migration, /e\.id = academy_assessment_attempts\.enrollment_id/);
  assert.match(migration, /e\.course_id = academy_assessment_attempts\.course_id/);
  assert.match(migration, /e\.course_id = academy_lesson_progress\.course_id/);
  assert.match(migration, /l\.course_id = e\.course_id/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_academy_enrollment\(p_enrollment_id bigint\)[\s\S]*academy_access_required/);
});

test("Solo lifecycle writes are staff-only and audited", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.manage_academy_solo_access/);
  assert.match(migration, /is_vivacity_team_safe\(\(SELECT auth\.uid\(\)\)\)/);
  assert.match(migration, /INSERT INTO public\.audit_eos_events/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.manage_academy_solo_access/);
  assert.doesNotMatch(migration, /ALTER TABLE public\.tenants[\s\S]*tenant_type/);
});

test("Solo lifecycle capability covers every active internal staff role", () => {
  for (const role of ["Super Admin", "Team Leader", "Team Member", "Integrator", "BGT", "CSC", "CET"]) {
    assert.match(
      staffMigration,
      new RegExp(`academy\\.tenant_access\\.manage'.*'${role}'.*'full'`),
    );
  }
});

test("Solo account provisioning bypasses RTO/package onboarding", () => {
  assert.match(provisioningMigration, /CREATE OR REPLACE FUNCTION public\.create_academy_solo_account/);
  assert.match(provisioningMigration, /is_vivacity_team_safe\(v_actor\)/);
  assert.match(provisioningMigration, /academy_account_type', 'individual'/);
  assert.match(provisioningMigration, /catalogue_scope', 'all_published_courses'/);
  assert.match(provisioningMigration, /compliance_system_enabled,\s*resource_hub_enabled,\s*documents_enabled/);
  assert.match(provisioningMigration, /'rto_profile_created', false/);
  assert.match(provisioningMigration, /'package_created', false/);
  assert.match(provisioningMigration, /audit_eos_events/);
  assert.match(provisioningMigration, /REVOKE ALL ON FUNCTION public\.create_academy_solo_account/);
  assert.match(migration, /WHEN p_is_solo_pilot OR COALESCE\(metadata, '\{\}'::jsonb\) \? 'academy_solo' THEN 1/);
});
