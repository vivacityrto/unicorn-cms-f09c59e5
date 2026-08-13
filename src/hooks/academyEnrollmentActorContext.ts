import { supabase } from '@/integrations/supabase/client';
import type { TimelineEvent } from './useClientManagementData';
import type { CourseActorInfo } from './portfolioTimelineGrouping';

interface CourseRow {
  id: number | string;
  title: string;
  slug: string | null;
  published_by: string | null;
  created_by: string | null;
}

interface ActorRow {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
}

export interface EnrollmentCourseContext {
  courseInfoByCourseId: Map<string, CourseActorInfo>;
  actorNameByUuid: Map<string, string>;
}

/**
 * The academy_enrolled trigger stamps created_by as enrolled_by, falling
 * back to the enrolled user's own id when no admin is recorded (true for a
 * whole-course auto-enrollment) — so it can't be trusted as "who did this".
 * The course's own published_by/created_by is the reliable actor for that
 * case, so grouped/reworded enrollment titles resolve the actor from here
 * instead. Shared by the portfolio-wide feed and the per-tenant Timeline.
 */
export async function fetchEnrollmentCourseContext(rows: TimelineEvent[]): Promise<EnrollmentCourseContext> {
  const courseIds = [
    ...new Set(
      rows
        .filter((r) => r.event_type === 'academy_enrolled')
        .map((r) => (r.metadata as Record<string, unknown> | null)?.course_id)
        .filter((id): id is number | string => id != null)
    ),
  ];
  if (courseIds.length === 0) {
    return { courseInfoByCourseId: new Map(), actorNameByUuid: new Map() };
  }

  const { data: courses } = await supabase
    .from('academy_courses')
    .select('id, title, slug, published_by, created_by')
    .in('id', courseIds);

  const courseInfoByCourseId = new Map<string, CourseActorInfo>(
    ((courses || []) as CourseRow[]).map((c) => [
      String(c.id),
      { title: c.title, slug: c.slug ?? null, actorUuid: c.published_by ?? c.created_by ?? null },
    ])
  );

  const actorUuids = [...new Set([...courseInfoByCourseId.values()].map((c) => c.actorUuid).filter(Boolean))] as string[];
  if (actorUuids.length === 0) {
    return { courseInfoByCourseId, actorNameByUuid: new Map() };
  }

  const { data: actors } = await supabase
    .from('users')
    .select('user_uuid, first_name, last_name')
    .in('user_uuid', actorUuids);

  const actorNameByUuid = new Map<string, string>(
    ((actors || []) as ActorRow[])
      .map((u): [string, string] => [u.user_uuid, [u.first_name, u.last_name].filter(Boolean).join(' ').trim()])
      .filter(([, name]) => !!name)
  );

  return { courseInfoByCourseId, actorNameByUuid };
}
