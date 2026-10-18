-- Aplicar después de setup.sql. Las soluciones nunca se exponen por la API.
begin;
create schema if not exists academy_private;
revoke all on schema academy_private from public, anon, authenticated;
grant usage on schema academy_private to service_role;

create table if not exists public.assessment_catalog (
 id text primary key,
 course_id text not null check (course_id='flotas-electricas-peru'),
 lesson_id text not null,
 title text not null,
 pass_score numeric not null default 70 check (pass_score between 0 and 100),
 max_attempts integer check (max_attempts > 0),
 active boolean not null default false
);
alter table public.assessment_catalog enable row level security;
revoke all on public.assessment_catalog from public, anon, authenticated;
grant select on public.assessment_catalog to authenticated;
grant all on public.assessment_catalog to service_role;
drop policy if exists assessments_enrolled_read on public.assessment_catalog;
create policy assessments_enrolled_read on public.assessment_catalog for select to authenticated
 using (active and public.has_course_access(course_id));

create table if not exists academy_private.assessment_questions (
 assessment_id text not null references public.assessment_catalog(id) on delete cascade,
 id text not null,
 ordinal integer not null check (ordinal > 0),
 stem text not null,
 options jsonb not null check (jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 6),
 correct_index integer not null check (correct_index >= 0 and correct_index < jsonb_array_length(options)),
 explanation text not null,
 primary key (assessment_id,id),
 unique (assessment_id,ordinal)
);
alter table academy_private.assessment_questions enable row level security;
revoke all on academy_private.assessment_questions from public, anon, authenticated;
grant all on academy_private.assessment_questions to service_role;

create table if not exists public.assessment_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 assessment_id text not null references public.assessment_catalog(id),
 submission_key uuid not null,
 attempt_number integer not null,
 answers jsonb not null,
 question_snapshot jsonb not null,
 pass_score numeric not null,
 correct_count integer not null,
 question_count integer not null,
 score numeric not null check(score between 0 and 100),
 passed boolean not null,
 submitted_at timestamptz not null default now(),
 unique(user_id,submission_key),
 unique(user_id,assessment_id,attempt_number)
);
alter table public.assessment_attempts enable row level security;
revoke all on public.assessment_attempts from public, anon, authenticated;
grant select on public.assessment_attempts to authenticated;
grant all on public.assessment_attempts to service_role;
drop policy if exists assessment_attempt_read_own on public.assessment_attempts;
create policy assessment_attempt_read_own on public.assessment_attempts for select to authenticated
 using(user_id=(select auth.uid()) and exists (
  select 1 from public.assessment_catalog c where c.id=assessment_id and public.has_course_access(c.course_id)
 ));

create or replace function public.get_assessment(requested_assessment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c public.assessment_catalog%rowtype;
 questions jsonb;
 attempts integer;
begin
 select * into c from public.assessment_catalog where id=requested_assessment and active for share;
 if not found or auth.uid() is null or not public.has_course_access(c.course_id) then
  raise exception 'Acceso no autorizado a la evaluación' using errcode='42501';
 end if;
 select jsonb_agg(jsonb_build_object('id',q.id,'stem',q.stem,'options',q.options) order by q.ordinal)
 into questions from academy_private.assessment_questions q where q.assessment_id=c.id;
 if questions is null then raise exception 'Evaluación aún no configurada'; end if;
 select count(*) into attempts from public.assessment_attempts a where a.user_id=auth.uid() and a.assessment_id=c.id;
 return jsonb_build_object('id',c.id,'title',c.title,'pass_score',c.pass_score,'max_attempts',c.max_attempts,'attempts',attempts,'questions',questions);
end;
$$;
revoke all on function public.get_assessment(text) from public, anon;
grant execute on function public.get_assessment(text) to authenticated;

create or replace function public.submit_assessment(requested_assessment text, submitted_answers jsonb, request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c public.assessment_catalog%rowtype;
 previous public.assessment_attempts%rowtype;
 result public.assessment_attempts%rowtype;
 total integer;
 correct integer;
 attempts integer;
begin
 select * into c from public.assessment_catalog where id=requested_assessment and active for share;
 if not found or auth.uid() is null or not public.has_course_access(c.course_id) then
  raise exception 'Acceso no autorizado a la evaluación' using errcode='42501';
 end if;
 if request_key is null then raise exception 'Identificador de envío requerido'; end if;
 -- Serializa los envíos de un alumno para esta evaluación y evita intentos simultáneos.
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text),hashtext(c.id));
 select * into previous from public.assessment_attempts a where a.user_id=auth.uid() and a.submission_key=request_key;
 if found then
  if previous.assessment_id<>c.id then raise exception 'Identificador de envío ya utilizado'; end if;
  result := previous;
 else
  if submitted_answers is null or jsonb_typeof(submitted_answers)<>'array' or octet_length(submitted_answers::text)>20000 then
   raise exception 'Formato de respuestas no válido';
  end if;
  select count(*) into total from academy_private.assessment_questions q where q.assessment_id=c.id;
  if total=0 or jsonb_array_length(submitted_answers)<>total then raise exception 'Responde todas las preguntas'; end if;
  if (select count(distinct a->>'id') from jsonb_array_elements(submitted_answers) a)<>total then raise exception 'Preguntas duplicadas o incompletas'; end if;
  if exists (
   select 1 from jsonb_array_elements(submitted_answers) a
   left join academy_private.assessment_questions q on q.assessment_id=c.id and q.id=a->>'id'
   where q.id is null or jsonb_typeof(a->'choice') is distinct from 'number'
    or not exists (select 1 from generate_series(0,jsonb_array_length(q.options)-1) n where n::text=a->>'choice')
  ) then raise exception 'Preguntas u opciones no válidas'; end if;
  select count(*) into attempts from public.assessment_attempts a where a.user_id=auth.uid() and a.assessment_id=c.id;
  if c.max_attempts is not null and attempts>=c.max_attempts then raise exception 'Se alcanzó el número de intentos permitido'; end if;
  select count(*) into correct from jsonb_array_elements(submitted_answers) a
  join academy_private.assessment_questions q on q.assessment_id=c.id and q.id=a->>'id'
  where q.correct_index::text=a->>'choice';
  insert into public.assessment_attempts(user_id,assessment_id,submission_key,attempt_number,answers,question_snapshot,pass_score,correct_count,question_count,score,passed)
   values(auth.uid(),c.id,request_key,attempts+1,submitted_answers,
    (select jsonb_agg(jsonb_build_object('id',q.id,'stem',q.stem,'options',q.options) order by q.ordinal) from academy_private.assessment_questions q where q.assessment_id=c.id),
    c.pass_score,correct,total,round(correct*100.0/total,2),(correct*100.0/total)>=c.pass_score)
   returning * into result;
 end if;
 return jsonb_build_object('attempt_id',result.id,'score',result.score,'passed',result.passed,'correct_count',result.correct_count,'question_count',result.question_count,'attempt_number',result.attempt_number,'submitted_at',result.submitted_at);
end;
$$;
revoke all on function public.submit_assessment(text,jsonb,uuid) from public, anon;
grant execute on function public.submit_assessment(text,jsonb,uuid) to authenticated;
commit;
