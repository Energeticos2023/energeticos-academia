-- Ejecutar en un proyecto Supabase dedicado a la academia.
begin;
create table if not exists public.course_enrollments (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null check (course_id = 'flotas-electricas-peru'),
  status text not null default 'suspended' check (status in ('active', 'suspended')),
  payment_confirmed boolean not null default false,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
alter table public.course_enrollments enable row level security;
revoke all on public.course_enrollments from anon, authenticated;
grant select on public.course_enrollments to authenticated;
grant all on public.course_enrollments to service_role;
drop policy if exists enrollment_read_own on public.course_enrollments;
create policy enrollment_read_own on public.course_enrollments for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.has_course_access(requested_course text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.course_enrollments e
    where e.user_id = (select auth.uid()) and e.course_id = requested_course
      and e.status = 'active' and e.payment_confirmed = true
      and (e.valid_until is null or e.valid_until > now())
  );
$$;
revoke all on function public.has_course_access(text) from public, anon;
grant execute on function public.has_course_access(text) to authenticated;

create table if not exists public.student_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null check (course_id = 'flotas-electricas-peru'),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 100000),
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
alter table public.student_progress enable row level security;
revoke all on public.student_progress from anon, authenticated;
grant select, insert, update on public.student_progress to authenticated;
grant all on public.student_progress to service_role;
drop policy if exists progress_read_own on public.student_progress;
drop policy if exists progress_insert_own on public.student_progress;
drop policy if exists progress_update_own on public.student_progress;
create policy progress_read_own on public.student_progress for select to authenticated
 using (user_id = (select auth.uid()) and public.has_course_access(course_id));
create policy progress_insert_own on public.student_progress for insert to authenticated
 with check (user_id = (select auth.uid()) and public.has_course_access(course_id));
create policy progress_update_own on public.student_progress for update to authenticated
 using (user_id = (select auth.uid()) and public.has_course_access(course_id))
 with check (user_id = (select auth.uid()) and public.has_course_access(course_id));

insert into storage.buckets (id, name, public, file_size_limit)
 values ('course-private', 'course-private', false, 52428800)
 on conflict (id) do update set public = false;
drop policy if exists enrolled_course_download on storage.objects;
create policy enrolled_course_download on storage.objects for select to authenticated
 using (bucket_id = 'course-private' and public.has_course_access((storage.foldername(name))[1]));
-- Sin políticas INSERT/UPDATE/DELETE para estudiantes: solo el administrador carga materiales.
commit;
