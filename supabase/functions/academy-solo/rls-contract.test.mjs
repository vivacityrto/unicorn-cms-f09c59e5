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

const migration = await readFile(migrationPath, "utf8");

test("Academy Solo migration has a recursion-safe server entitlement gate", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.has_academy_access_safe\(p_user_id uuid\)/);
  assert.match(migration, /t\.academy_access_enabled IS TRUE/);
  assert.match(migration, /tu\.access_scope IS NULL OR tu\.access_scope IN \('full', 'academy_only'\)/);
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
