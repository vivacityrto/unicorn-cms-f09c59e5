import { supabase } from '@/integrations/supabase/client';
import type { TimelineEvent } from './useClientManagementData';
import type { CourseActorInfo, ActorProfile } from './portfolioTimelineGrouping';

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
  avatar_url: string | null;
}

export interface EnrollmentCourseContext {
  courseInfoByCourseId: Map<string, CourseActorInfo>;
  actorByUuid: Map<string, ActorProfile>;
}

/**
 * For `auto_all_clients` rows, the academy_enrolled trigger falls back to the
 * learner's id when no explicit enroller is recorded. The course's own
 * published_by/created_by is therefore the reliable actor for that one
 * course-wide enrollment source. Other sources preserve the trigger's actor.
 * Shared by the portfolio-wide feed and the per-tenant Timeline.
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
    return { courseInfoByCourseId: new Map(), actorByUuid: new Map() };
  }

  const { data: courses } = await supabase
    .from('academy_courses')
    .select('id, title, slug, published_by, created_by')
    .in('id', courseIds.map((id) => Number(id)));

  const courseInfoByCourseId = new Map<string, CourseActorInfo>(
    ((courses || []) as CourseRow[]).map((c) => [
      String(c.id),
      { title: c.title, slug: c.slug ?? null, actorUuid: c.published_by ?? c.created_by ?? null },
    ])
  );

  // Two distinct actor sources: the course's own published_by/created_by for
  // `auto_all_clients` rows, and the row's own created_by for manual rows
  // (useBulkEnroll sets enrolled_by) and individual enrollment sources.
  const courseActorUuids = [...courseInfoByCourseId.values()].map((c) => c.actorUuid).filter(Boolean) as string[];
  const rowActorUuids = rows
    .filter((r) => {
      if (r.event_type !== 'academy_enrolled') return false;
      const source = (r.metadata as Record<string, unknown> | null)?.source;
      return source !== 'auto_all_clients';
    })
    .map((r) => r.created_by)
    .filter((id): id is string => !!id);
  const actorUuids = [...new Set([...courseActorUuids, ...rowActorUuids])];
  if (actorUuids.length === 0) {
    return { courseInfoByCourseId, actorByUuid: new Map() };
  }

  const { data: actors } = await supabase
    .from('users')
    .select('user_uuid, first_name, last_name, avatar_url')
    .in('user_uuid', actorUuids);

  const actorByUuid = new Map<string, ActorProfile>(
    ((actors || []) as ActorRow[])
      .map((u): [string, ActorProfile] => [
        u.user_uuid,
        {
          name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim(),
          first_name: u.first_name,
          last_name: u.last_name,
          avatar_url: u.avatar_url,
        },
      ])
      .filter(([, profile]) => !!profile.name)
  );

  return { courseInfoByCourseId, actorByUuid };
}
