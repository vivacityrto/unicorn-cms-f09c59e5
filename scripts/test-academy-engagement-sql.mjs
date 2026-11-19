// Isolated PostgreSQL fixture only. Never connects to a hosted database.
// Install PGlite outside the checkout; see the Academy engagement handoff.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create schema auth;
create role anon; create role authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function public.is_vivacity() returns boolean language sql stable as $$ select current_setting('test.staff',true)::boolean $$;
create table public.users(user_uuid uuid primary key,is_vivacity_internal boolean,is_system_account boolean);
create table academy_courses(id bigint primary key,title text);
create table academy_enrollments(id bigint primary key,course_id bigint,user_id uuid,tenant_id bigint,status text,completed_at timestamptz,revoked_at timestamptz,enrolled_at timestamptz,source text);
create table academy_lessons(id bigint primary key,course_id bigint,lesson_type text);
create table academy_lesson_progress(id bigint,enrollment_id bigint,user_id uuid,course_id bigint,lesson_id bigint,started_at timestamptz,last_position_seconds integer,watch_seconds integer);
create table academy_certificates(id bigint,enrollment_id bigint,user_id uuid,course_id bigint,revoked_at timestamptz,issued_at timestamptz);
insert into users values ('00000000-0000-0000-0000-000000000001',false,false),('00000000-0000-0000-0000-000000000002',false,false),('00000000-0000-0000-0000-000000000003',true,false);
insert into academy_courses values (1,'Course One'),(2,'Course Two');
insert into academy_enrollments values
(1,1,'00000000-0000-0000-0000-000000000001',10,'completed','2026-11-20Z',null,'2026-11-18T13:00:00Z','self_enrol'),
(2,1,'00000000-0000-0000-0000-000000000002',10,'active',null,null,'2026-11-19T12:59:59.999Z','self_enrol'),
(3,2,'00000000-0000-0000-0000-000000000001',10,'completed','2026-11-20Z',null,'2026-11-19T13:00:00Z','self_enrol'),
(4,2,'00000000-0000-0000-0000-000000000002',20,'active',null,null,'2026-11-19T01:00:00Z','auto_package'),
(5,2,'00000000-0000-0000-0000-000000000002',10,'revoked',null,null,'2026-11-19T01:00:00Z','self_enrol'),
(6,2,'00000000-0000-0000-0000-000000000003',10,'completed','2026-11-20Z',null,'2026-11-19T01:00:00Z','self_enrol');
insert into academy_lessons values (1,1,'video'),(2,1,'video'),(3,2,'resource');
insert into academy_lesson_progress values
(1,1,'00000000-0000-0000-0000-000000000001',1,1,now(),0,0),
(2,1,'00000000-0000-0000-0000-000000000001',1,2,now(),10,10),
(3,2,'00000000-0000-0000-0000-000000000001',1,1,now(),10,10),
(4,3,'00000000-0000-0000-0000-000000000001',2,3,now(),10,10);
insert into academy_certificates values
(1,1,'00000000-0000-0000-0000-000000000001',1,null,now()),
(2,1,'00000000-0000-0000-0000-000000000001',1,now(),now());
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261119081929_academy_engagement_dashboard.sql', import.meta.url),'utf8'));
const query = async (args='') => (await db.query(`select fn_academy_engagement_dashboard(${args}) as d`)).rows[0].d;
await assert.rejects(query(), /staff only/);
await db.exec(`set test.uid='00000000-0000-0000-0000-000000000001';set test.staff='false';`);
await assert.rejects(query(), /staff only/);
await db.exec(`set test.staff='true';`);
await assert.rejects(query(`null,null,null,'invalid'`), /Unsupported/);
await assert.rejects(query(`'2026-11-20','2026-11-19'`), /From date/);
const day = await query(`'2026-11-19','2026-11-19'`);
assert.deepEqual(day.totals,{enrolments:2,learners:2,video_started:1,completed:1,certificates:1});
assert.equal(day.courses.length,1);
const all = await query();
assert.deepEqual(all.totals,{enrolments:3,learners:2,video_started:1,completed:2,certificates:1});
assert.equal((await query(`null,null,20,'all'`)).totals.enrolments,1);
assert.equal((await query(`null,null,20,'self_enrol'`)).totals.enrolments,0);
assert.deepEqual((await query(`'2099-01-01',null`)).courses,[]);
const grants = await db.query(`select has_function_privilege('anon','fn_academy_engagement_dashboard(date,date,bigint,text)','execute') anon, has_function_privilege('authenticated','fn_academy_engagement_dashboard(date,date,bigint,text)','execute') authenticated`);
assert.deepEqual(grants.rows[0],{anon:false,authenticated:true});
console.log('PASS: SQL auth denial, source/date validation, Sydney inclusive boundary, distinct playback learner, wrong-user exclusion, non-video exclusion, internal/revoked exclusion, certificate revocation, tenant/source scope, empty cohort, grants.');
await db.close();
