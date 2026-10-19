-- Temporary QA permissions for named, email-verified testers. No paid enrollment is fabricated.
-- The list of personal emails lives only in the private database; do not commit addresses here.
begin;
create table if not exists academy_private.qa_access_grants (
  email text not null check (email=lower(btrim(email)) and email like '%@%'),
  course_id text not null check (course_id='flotas-electricas-peru'),
  access_role text not null check (access_role in ('instructor','student')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  purpose text not null default 'Prueba funcional sin pago ni certificado',
  primary key(email,course_id)
);
alter table academy_private.qa_access_grants enable row level security;
revoke all on academy_private.qa_access_grants from public, anon, authenticated;
grant all on academy_private.qa_access_grants to service_role;
comment on table academy_private.qa_access_grants is 'Autorizaciones QA temporales, verificadas contra Auth; NO prueban pago ni dan derecho a diploma.';

create or replace function public.has_course_access(requested_course text)
returns boolean language sql stable security definer set search_path='' as $f$
  select auth.uid() is not null and (
    exists (
      select 1 from public.course_enrollments e
      where e.user_id=(select auth.uid())
        and e.course_id=requested_course
        and e.status='active' and e.payment_confirmed=true
        and (e.valid_until is null or e.valid_until>now())
    )
    or exists (
      select 1 from academy_private.qa_access_grants g
      join auth.users u on u.id=(select auth.uid())
      where g.course_id=requested_course
        and g.email=lower(u.email)
        and u.email_confirmed_at is not null
        and g.revoked_at is null and g.expires_at>now()
    )
  );
$f$;
revoke all on function public.has_course_access(text) from public,anon;
grant execute on function public.has_course_access(text) to authenticated;

create or replace function public.course_access_status(requested_course text)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare paid_until timestamptz;
  paid boolean :=false;
  test_role text;
  test_until timestamptz;
begin
 if auth.uid() is null then return jsonb_build_object('allowed',false,'mode','none'); end if;
 select true,e.valid_until into paid,paid_until
 from public.course_enrollments e
 where e.user_id=(select auth.uid()) and e.course_id=requested_course
   and e.status='active' and e.payment_confirmed=true
   and (e.valid_until is null or e.valid_until>now());
 if coalesce(paid,false) then
   return jsonb_build_object('allowed',true,'mode','enrollment','valid_until',paid_until);
 end if;
 select g.access_role,g.expires_at into test_role,test_until
 from academy_private.qa_access_grants g
 join auth.users u on u.id=(select auth.uid())
 where g.course_id=requested_course
   and g.email=lower(u.email)
   and u.email_confirmed_at is not null
   and g.revoked_at is null and g.expires_at>now();
 if found then
   return jsonb_build_object('allowed',true,'mode','testing','role',test_role,'valid_until',test_until);
 end if;
 return jsonb_build_object('allowed',false,'mode','none');
end;
$f$;
revoke all on function public.course_access_status(text) from public,anon;
grant execute on function public.course_access_status(text) to authenticated;

create or replace function public.is_academy_admin()
returns boolean language sql stable security definer set search_path='' as $f$
  select exists(
    select 1 from auth.users u
    where u.id=(select auth.uid()) and u.email_confirmed_at is not null
      and (
        exists(select 1 from academy_private.administrators a where a.user_id=u.id)
        or exists (
          select 1 from academy_private.qa_access_grants q
          where q.course_id='flotas-electricas-peru'
            and q.email=lower(u.email) and q.access_role='instructor'
            and q.revoked_at is null and q.expires_at>now()
        )
      )
  );
$f$;
revoke all on function public.is_academy_admin() from public,anon;
grant execute on function public.is_academy_admin() to authenticated;

-- Do not expose authoring DOCX/PPTX files, even to temporarily authorized QA users.
drop policy if exists enrolled_course_download on storage.objects;
create policy enrolled_course_download on storage.objects for select to authenticated
  using (
    bucket_id='course-private'
    and public.has_course_access((storage.foldername(name))[1])
    and lower(name) ~ '\.(json|jpe?g|png|webp|pdf)$'
  );
commit;
