BEGIN;

-- academy_assessment_attempts
DROP POLICY IF EXISTS "Attempts: Vivacity staff view all" ON public.academy_assessment_attempts;
CREATE POLICY "Attempts: Vivacity staff view all" ON public.academy_assessment_attempts AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "Attempts: users manage own" ON public.academy_assessment_attempts;
CREATE POLICY "Attempts: users manage own" ON public.academy_assessment_attempts AS PERMISSIVE FOR ALL TO public USING ((user_id = (SELECT auth.uid())));

-- academy_assessment_questions
DROP POLICY IF EXISTS "Questions: Vivacity staff manage" ON public.academy_assessment_questions;
CREATE POLICY "Questions: Vivacity staff manage" ON public.academy_assessment_questions AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "Questions: staff or enrolled learners view" ON public.academy_assessment_questions;
CREATE POLICY "Questions: staff or enrolled learners view" ON public.academy_assessment_questions AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))) OR (EXISTS ( SELECT 1 FROM (academy_assessments a JOIN academy_enrollments e ON (((e.course_id = a.course_id) AND (e.user_id = (SELECT auth.uid())) AND (e.status = 'active'::text)))) WHERE (a.id = academy_assessment_questions.assessment_id)))));

-- academy_assessments
DROP POLICY IF EXISTS "Assessments: Vivacity staff manage" ON public.academy_assessments;
CREATE POLICY "Assessments: Vivacity staff manage" ON public.academy_assessments AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

-- academy_certificates
DROP POLICY IF EXISTS "Certificates: Vivacity staff manage all" ON public.academy_certificates;
CREATE POLICY "Certificates: Vivacity staff manage all" ON public.academy_certificates AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "Certificates: tenant admins view their tenant" ON public.academy_certificates;
CREATE POLICY "Certificates: tenant admins view their tenant" ON public.academy_certificates AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM tenant_users tu WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = academy_certificates.tenant_id) AND (tu.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));

DROP POLICY IF EXISTS "Certificates: users view own" ON public.academy_certificates;
CREATE POLICY "Certificates: users view own" ON public.academy_certificates AS PERMISSIVE FOR SELECT TO public USING ((user_id = (SELECT auth.uid())));

-- academy_courses
DROP POLICY IF EXISTS "Academy courses: Vivacity staff manage all" ON public.academy_courses;
CREATE POLICY "Academy courses: Vivacity staff manage all" ON public.academy_courses AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

-- academy_enrollments
DROP POLICY IF EXISTS "Enrollments: Vivacity staff manage all" ON public.academy_enrollments;
CREATE POLICY "Enrollments: Vivacity staff manage all" ON public.academy_enrollments AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "Enrollments: tenant admins view their tenant" ON public.academy_enrollments;
CREATE POLICY "Enrollments: tenant admins view their tenant" ON public.academy_enrollments AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM tenant_users tu WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = academy_enrollments.tenant_id) AND (tu.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));

DROP POLICY IF EXISTS "Enrollments: users self-enrol" ON public.academy_enrollments;
CREATE POLICY "Enrollments: users self-enrol" ON public.academy_enrollments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = (SELECT auth.uid())) AND (source = 'self_enrol'::text) AND ((tenant_id IS NULL) OR (EXISTS ( SELECT 1 FROM tenant_users tu WHERE ((tu.user_id = (SELECT auth.uid())) AND (tu.tenant_id = academy_enrollments.tenant_id)))))));

DROP POLICY IF EXISTS "Enrollments: users view own" ON public.academy_enrollments;
CREATE POLICY "Enrollments: users view own" ON public.academy_enrollments AS PERMISSIVE FOR SELECT TO public USING ((user_id = (SELECT auth.uid())));

-- academy_lesson_progress
DROP POLICY IF EXISTS "Lesson progress: Vivacity staff view all" ON public.academy_lesson_progress;
CREATE POLICY "Lesson progress: Vivacity staff view all" ON public.academy_lesson_progress AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "Lesson progress: users manage own" ON public.academy_lesson_progress;
CREATE POLICY "Lesson progress: users manage own" ON public.academy_lesson_progress AS PERMISSIVE FOR ALL TO public USING ((user_id = (SELECT auth.uid())));

-- academy_lessons
DROP POLICY IF EXISTS "Academy lessons: Vivacity staff manage" ON public.academy_lessons;
CREATE POLICY "Academy lessons: Vivacity staff manage" ON public.academy_lessons AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

-- academy_modules
DROP POLICY IF EXISTS "Academy modules: Vivacity staff manage" ON public.academy_modules;
CREATE POLICY "Academy modules: Vivacity staff manage" ON public.academy_modules AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

-- academy_package_course_rules
DROP POLICY IF EXISTS "Package course rules: Vivacity staff manage" ON public.academy_package_course_rules;
CREATE POLICY "Package course rules: Vivacity staff manage" ON public.academy_package_course_rules AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM users u WHERE ((u.user_uuid = (SELECT auth.uid())) AND ((lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])) OR (u.is_vivacity_internal = true))))));

DROP POLICY IF EXISTS "Package course rules: tenant users can view" ON public.academy_package_course_rules;
CREATE POLICY "Package course rules: tenant users can view" ON public.academy_package_course_rules AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM (package_instances pi JOIN tenant_users tu ON ((tu.tenant_id = pi.tenant_id))) WHERE ((pi.package_id = academy_package_course_rules.package_id) AND (tu.user_id = (SELECT auth.uid()))))));

COMMIT;