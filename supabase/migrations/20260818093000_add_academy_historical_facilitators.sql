create table public.academy_historical_facilitators (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique check (length(trim(display_name)) > 0),
  is_selectable boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.academy_historical_facilitators enable row level security;

create policy "Vivacity staff can read historical academy facilitators"
on public.academy_historical_facilitators for select to authenticated
using (exists (
  select 1 from public.users u
  where u.user_uuid = auth.uid()
    and u.is_vivacity_internal = true
    and coalesce(u.archived, false) = false
    and coalesce(u.disabled, false) = false
));

alter table public.academy_courses
  add column facilitator_display_name text;

insert into public.academy_historical_facilitators (display_name)
values ('Sam Holtham')
on conflict (display_name) do update set is_selectable = true;

update public.academy_courses
set facilitator_id = null,
    facilitator_display_name = 'Sam Holtham'
where lower(coalesce(webinar_series, '')) = 'trainers edge';
