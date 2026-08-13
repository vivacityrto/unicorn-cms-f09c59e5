-- Lesson-level playback windows for shared workshop recordings.
-- Nullable: existing 1:1 course-per-recording lessons stay NULL and keep
-- using academy_courses.segment_start_seconds / segment_end_seconds until
-- those leftover rows are archived. Segmented lessons (one course, N
-- lessons on the same video_id) store the window here so the player can
-- seek/pause per lesson.
--
-- Also teach academy_lesson_set_minutes_from_video to use the segment span
-- when both bounds are set — otherwise N lessons on a 2h recording would
-- each inherit the full duration and inflate PDP / catalog totals.

alter table public.academy_lessons
  add column if not exists segment_start_seconds integer;

alter table public.academy_lessons
  add column if not exists segment_end_seconds integer;

comment on column public.academy_lessons.segment_start_seconds is
  'Inclusive start of this lesson''s window within video_id, in seconds. Null = play from the start (or fall back to the course-level window).';

comment on column public.academy_lessons.segment_end_seconds is
  'Exclusive-ish end of this lesson''s window within video_id, in seconds. Player pauses here. Null = play to the end.';

create or replace function public.academy_lesson_set_minutes_from_video()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_duration integer;
  v_span integer;
begin
  if new.segment_start_seconds is not null
     and new.segment_end_seconds is not null
     and new.segment_end_seconds > new.segment_start_seconds then
    v_span := new.segment_end_seconds - new.segment_start_seconds;
    new.estimated_minutes := ceil(v_span::numeric / 60.0)::integer;
    return new;
  end if;

  if new.video_id is not null then
    select tv.duration_seconds into v_duration
    from public.training_videos tv
    where tv.id = new.video_id;

    if v_duration is not null and v_duration > 0 then
      new.estimated_minutes := ceil(v_duration::numeric / 60.0)::integer;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.academy_lesson_set_minutes_from_video() from public;
revoke all on function public.academy_lesson_set_minutes_from_video() from anon;
revoke all on function public.academy_lesson_set_minutes_from_video() from authenticated;

drop trigger if exists trg_academy_lesson_set_minutes_from_video on public.academy_lessons;
create trigger trg_academy_lesson_set_minutes_from_video
  before insert or update of video_id, segment_start_seconds, segment_end_seconds
  on public.academy_lessons
  for each row
  execute function public.academy_lesson_set_minutes_from_video();

-- When a training_videos duration changes, only rewrite minutes on lessons
-- that are NOT a segment window — those stay tied to start/end, not the
-- full recording length.
create or replace function public.training_video_refresh_lesson_minutes()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.duration_seconds is distinct from old.duration_seconds
     and new.duration_seconds is not null
     and new.duration_seconds > 0 then
    update public.academy_lessons
    set estimated_minutes = ceil(new.duration_seconds::numeric / 60.0)::integer,
        updated_at = now()
    where video_id = new.id
      and (
        segment_start_seconds is null
        or segment_end_seconds is null
        or segment_end_seconds <= segment_start_seconds
      );
  end if;
  return new;
end;
$function$;

revoke all on function public.training_video_refresh_lesson_minutes() from public;
revoke all on function public.training_video_refresh_lesson_minutes() from anon;
revoke all on function public.training_video_refresh_lesson_minutes() from authenticated;
