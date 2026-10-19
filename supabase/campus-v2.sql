-- Campus v2: paquetes de módulo con publicación controlada, acceso de personal docente,
-- evaluación con sorteo estratificado, tiempo límite e intentos en servidor, y auditoría.
-- Aplicar después de setup.sql, assessments.sql y registration.sql. Es idempotente.
begin;

-- 1. Seguridad del esquema privado ----------------------------------------------------
create schema if not exists academy_private;
revoke all on schema academy_private from public, anon, authenticated;
alter table academy_private.administrators enable row level security;
revoke all on academy_private.administrators from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

create table if not exists academy_private.audit_events (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table academy_private.audit_events enable row level security;
revoke all on academy_private.audit_events from public, anon, authenticated;

-- 2. Paquetes de módulo -----------------------------------------------------------------
create table if not exists academy_private.module_packages (
  package_id text primary key,
  course_id text not null,
  version_label text not null,
  publication_state text not null check (publication_state in ('testing','approved','archived')),
  payload jsonb not null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table academy_private.module_packages enable row level security;
revoke all on academy_private.module_packages from public, anon, authenticated;

-- Un alumno solo recibe paquetes aprobados; el administrador ve también los de prueba.
create or replace function public.get_module_package(requested_package text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p academy_private.module_packages%rowtype;
begin
  if auth.uid() is null then raise exception 'Acceso no autorizado' using errcode = '42501'; end if;
  select * into p from academy_private.module_packages where package_id = requested_package;
  if not found then raise exception 'Acceso no autorizado' using errcode = '42501'; end if;
  if public.is_academy_admin() or (p.publication_state = 'testing' and public.is_course_staff(p.course_id)) then return p.payload; end if;
  if p.publication_state <> 'approved' or not public.has_course_access(p.course_id) then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end if;
  return p.payload;
end $$;
revoke all on function public.get_module_package(text) from public, anon;
grant execute on function public.get_module_package(text) to authenticated;

-- Contenido vigente del curso para quien inicia sesión: aprobado para alumnos;
-- para el administrador, la versión en prueba más reciente si existe.
create or replace function public.get_current_module(requested_course text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p academy_private.module_packages%rowtype; admin boolean;
begin
  if auth.uid() is null then raise exception 'Acceso no autorizado' using errcode = '42501'; end if;
  admin := public.is_academy_admin();
  if not admin and not public.has_course_access(requested_course) then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end if;
  if admin then
    select * into p from academy_private.module_packages
     where course_id = requested_course and publication_state in ('testing','approved')
     order by (publication_state = 'testing') desc, updated_at desc limit 1;
  else
    select * into p from academy_private.module_packages
     where course_id = requested_course and publication_state = 'approved'
     order by updated_at desc limit 1;
  end if;
  if not found then raise exception 'El contenido del curso aún no está publicado.' using errcode = 'P0002'; end if;
  return jsonb_build_object('package_id', p.package_id, 'version_label', p.version_label,
                            'publication_state', p.publication_state, 'course', p.payload);
end $$;
revoke all on function public.get_current_module(text) from public, anon;
grant execute on function public.get_current_module(text) to authenticated;

create or replace function public.list_module_packages()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_academy_admin() then raise exception 'Acceso no autorizado.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'package_id', package_id, 'course_id', course_id, 'version_label', version_label,
      'publication_state', publication_state, 'updated_at', updated_at,
      'lessons', jsonb_array_length(coalesce(payload->'lessons', '[]'::jsonb)))
      order by updated_at desc) from academy_private.module_packages), '[]'::jsonb);
end $$;
revoke all on function public.list_module_packages() from public, anon;
grant execute on function public.list_module_packages() to authenticated;

-- Publicar una versión en prueba: pasa a aprobada y archiva la aprobada anterior.
create or replace function public.publish_module_package(requested_package text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p academy_private.module_packages%rowtype;
begin
  if not public.is_academy_admin() then raise exception 'Acceso no autorizado.' using errcode = '42501'; end if;
  select * into p from academy_private.module_packages where package_id = requested_package for update;
  if not found or p.publication_state <> 'testing' then
    raise exception 'Solo se puede publicar una versión en prueba.' using errcode = '22023';
  end if;
  update academy_private.module_packages set publication_state = 'archived', updated_at = now()
   where course_id = p.course_id and publication_state = 'approved'
     and coalesce(payload->>'module_id', '') = coalesce(p.payload->>'module_id', '');
  update academy_private.module_packages set publication_state = 'approved', updated_at = now()
   where package_id = requested_package;
  insert into academy_private.audit_events(actor, action, target, detail)
   values (auth.uid(), 'publish_module_package', requested_package, jsonb_build_object('version', p.version_label));
  return jsonb_build_object('package_id', requested_package, 'publication_state', 'approved');
end $$;
revoke all on function public.publish_module_package(text) from public, anon;
grant execute on function public.publish_module_package(text) to authenticated;

-- 3. Acceso del personal docente --------------------------------------------------------
-- 'staff' identifica accesos del autor o revisores: no son matrículas pagadas ni cuentan
-- para estadísticas o certificados.
alter table public.course_enrollments add column if not exists access_kind text not null default 'student';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'course_enrollments_access_kind_check') then
    alter table public.course_enrollments add constraint course_enrollments_access_kind_check
      check (access_kind in ('student','staff'));
  end if;
end $$;

-- 4. Evaluación con sorteo, tiempo límite e intentos -----------------------------------
alter table public.assessment_catalog add column if not exists draw_rule jsonb;
alter table public.assessment_catalog add column if not exists time_limit_minutes integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assessment_catalog_time_limit_check') then
    alter table public.assessment_catalog add constraint assessment_catalog_time_limit_check
      check (time_limit_minutes is null or time_limit_minutes between 1 and 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_catalog_draw_rule_check') then
    alter table public.assessment_catalog add constraint assessment_catalog_draw_rule_check
      check (draw_rule is null or jsonb_typeof(draw_rule) = 'object');
  end if;
end $$;
alter table academy_private.assessment_questions add column if not exists stratum text;

create table if not exists academy_private.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_id text not null references public.assessment_catalog(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  question_ids text[] not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_attempt_id uuid references public.assessment_attempts(id) on delete set null,
  unique (user_id, assessment_id, attempt_number)
);
alter table academy_private.assessment_sessions enable row level security;
revoke all on academy_private.assessment_sessions from public, anon, authenticated;
create index if not exists assessment_sessions_lookup on academy_private.assessment_sessions(user_id, assessment_id);
create index if not exists assessment_attempts_lookup on public.assessment_attempts(user_id, assessment_id);

-- Preguntas de una sesión, en el orden sorteado y sin claves.
create or replace function academy_private.session_questions(s academy_private.assessment_sessions)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'stem', q.stem, 'options', q.options) order by t.ord), '[]'::jsonb)
  from unnest(s.question_ids) with ordinality as t(qid, ord)
  join academy_private.assessment_questions q on q.assessment_id = s.assessment_id and q.id = t.qid;
$$;
revoke all on function academy_private.session_questions(academy_private.assessment_sessions) from public, anon, authenticated;

create or replace function public.get_assessment(requested_assessment text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.assessment_catalog%rowtype;
  s academy_private.assessment_sessions%rowtype;
  questions jsonb;
  attempts integer;
  best numeric;
begin
  select * into c from public.assessment_catalog where id = requested_assessment and active for share;
  if not found or auth.uid() is null or not public.has_course_access(c.course_id) then
    raise exception 'Acceso no autorizado a la evaluación' using errcode = '42501';
  end if;
  select max(score) into best from public.assessment_attempts a where a.user_id = auth.uid() and a.assessment_id = c.id;
  if c.draw_rule is null then
    select jsonb_agg(jsonb_build_object('id', q.id, 'stem', q.stem, 'options', q.options) order by q.ordinal)
      into questions from academy_private.assessment_questions q where q.assessment_id = c.id;
    if questions is null then raise exception 'Evaluación aún no configurada'; end if;
    select count(*) into attempts from public.assessment_attempts a where a.user_id = auth.uid() and a.assessment_id = c.id;
    return jsonb_build_object('id', c.id, 'title', c.title, 'mode', 'fixed', 'pass_score', c.pass_score,
      'max_attempts', c.max_attempts, 'attempts', attempts, 'best_score', best, 'questions', questions);
  end if;
  select count(*) into attempts from academy_private.assessment_sessions x where x.user_id = auth.uid() and x.assessment_id = c.id;
  select * into s from academy_private.assessment_sessions x
   where x.user_id = auth.uid() and x.assessment_id = c.id and x.submitted_attempt_id is null
     and now() <= x.expires_at + interval '2 minutes'
   order by x.attempt_number desc limit 1;
  return jsonb_build_object('id', c.id, 'title', c.title, 'mode', 'draw', 'pass_score', c.pass_score,
    'max_attempts', c.max_attempts, 'attempts', attempts, 'best_score', best,
    'time_limit_minutes', c.time_limit_minutes,
    'draw_size', (select sum(value::int) from jsonb_each_text(c.draw_rule)),
    'server_time', now(),
    'session', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'attempt_number', s.attempt_number, 'started_at', s.started_at, 'expires_at', s.expires_at,
      'questions', academy_private.session_questions(s)) end);
end $$;
revoke all on function public.get_assessment(text) from public, anon;
grant execute on function public.get_assessment(text) to authenticated;

-- Iniciar un intento: consume un intento y fija las preguntas sorteadas.
create or replace function public.start_assessment(requested_assessment text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.assessment_catalog%rowtype;
  open_session academy_private.assessment_sessions%rowtype;
  used integer;
  picked text[] := '{}';
  part text[];
  rule record;
begin
  select * into c from public.assessment_catalog where id = requested_assessment and active for share;
  if not found or auth.uid() is null or not public.has_course_access(c.course_id) then
    raise exception 'Acceso no autorizado a la evaluación' using errcode = '42501';
  end if;
  if c.draw_rule is null then raise exception 'Esta evaluación no usa sorteo.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(c.id));
  select * into open_session from academy_private.assessment_sessions x
   where x.user_id = auth.uid() and x.assessment_id = c.id and x.submitted_attempt_id is null
     and now() <= x.expires_at + interval '2 minutes' limit 1;
  if found then return public.get_assessment(requested_assessment); end if;
  select count(*) into used from academy_private.assessment_sessions x where x.user_id = auth.uid() and x.assessment_id = c.id;
  if c.max_attempts is not null and used >= c.max_attempts then
    raise exception 'Se alcanzó el número de intentos permitido' using errcode = '22023';
  end if;
  for rule in select key, value::int as n from jsonb_each_text(c.draw_rule) order by key loop
    select array_agg(q.id) into part from (
      select q.id from academy_private.assessment_questions q
       where q.assessment_id = c.id and q.stratum = rule.key order by random() limit rule.n) q;
    if coalesce(array_length(part, 1), 0) < rule.n then
      raise exception 'El banco no tiene suficientes preguntas del capítulo %', rule.key;
    end if;
    picked := picked || part;
  end loop;
  select array_agg(x order by random()) into picked from unnest(picked) as x;
  insert into academy_private.assessment_sessions(user_id, assessment_id, attempt_number, question_ids, expires_at)
   values (auth.uid(), c.id, used + 1, picked, now() + make_interval(mins => coalesce(c.time_limit_minutes, 60)));
  return public.get_assessment(requested_assessment);
end $$;
revoke all on function public.start_assessment(text) from public, anon;
grant execute on function public.start_assessment(text) to authenticated;

create or replace function public.submit_assessment(requested_assessment text, submitted_answers jsonb, request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 c public.assessment_catalog%rowtype;
 previous public.assessment_attempts%rowtype;
 result public.assessment_attempts%rowtype;
 s academy_private.assessment_sessions%rowtype;
 total integer;
 correct integer;
 attempts integer;
begin
 select * into c from public.assessment_catalog where id = requested_assessment and active for share;
 if not found or auth.uid() is null or not public.has_course_access(c.course_id) then
  raise exception 'Acceso no autorizado a la evaluación' using errcode = '42501';
 end if;
 if request_key is null then raise exception 'Identificador de envío requerido'; end if;
 -- Serializa los envíos de un alumno para esta evaluación y evita intentos simultáneos.
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text), hashtext(c.id));
 select * into previous from public.assessment_attempts a where a.user_id = auth.uid() and a.submission_key = request_key;
 if found then
  if previous.assessment_id <> c.id then raise exception 'Identificador de envío ya utilizado'; end if;
  result := previous;
 elsif c.draw_rule is not null then
  select * into s from academy_private.assessment_sessions x
   where x.user_id = auth.uid() and x.assessment_id = c.id and x.submitted_attempt_id is null
   order by x.attempt_number desc limit 1 for update;
  if not found then raise exception 'No hay un intento en curso. Inicia la evaluación.' using errcode = '22023'; end if;
  if now() > s.expires_at + interval '2 minutes' then
   raise exception 'El tiempo del intento terminó sin envío.' using errcode = '22023';
  end if;
  total := array_length(s.question_ids, 1);
  if submitted_answers is null or jsonb_typeof(submitted_answers) <> 'array' or octet_length(submitted_answers::text) > 20000
     or jsonb_array_length(submitted_answers) <> total then
   raise exception 'Formato de respuestas no válido';
  end if;
  if (select count(distinct a->>'id') from jsonb_array_elements(submitted_answers) a where a->>'id' = any(s.question_ids)) <> total then
   raise exception 'Preguntas duplicadas o ajenas al intento';
  end if;
  if exists (
   select 1 from jsonb_array_elements(submitted_answers) a
   join academy_private.assessment_questions q on q.assessment_id = c.id and q.id = a->>'id'
   where jsonb_typeof(a->'choice') not in ('number', 'null')
      or (jsonb_typeof(a->'choice') = 'number' and not exists (
          select 1 from generate_series(0, jsonb_array_length(q.options) - 1) n where n::text = a->>'choice'))
  ) then raise exception 'Opciones no válidas'; end if;
  select count(*) into correct from jsonb_array_elements(submitted_answers) a
   join academy_private.assessment_questions q on q.assessment_id = c.id and q.id = a->>'id'
   where jsonb_typeof(a->'choice') = 'number' and q.correct_index::text = a->>'choice';
  insert into public.assessment_attempts(user_id, assessment_id, submission_key, attempt_number, answers, question_snapshot,
                                         pass_score, correct_count, question_count, score, passed)
   values (auth.uid(), c.id, request_key, s.attempt_number, submitted_answers, academy_private.session_questions(s),
           c.pass_score, correct, total, round(correct * 100.0 / total, 2), (correct * 100.0 / total) >= c.pass_score)
   returning * into result;
  update academy_private.assessment_sessions set submitted_attempt_id = result.id where id = s.id;
 else
  if submitted_answers is null or jsonb_typeof(submitted_answers) <> 'array' or octet_length(submitted_answers::text) > 20000 then
   raise exception 'Formato de respuestas no válido';
  end if;
  select count(*) into total from academy_private.assessment_questions q where q.assessment_id = c.id;
  if total = 0 or jsonb_array_length(submitted_answers) <> total then raise exception 'Responde todas las preguntas'; end if;
  if (select count(distinct a->>'id') from jsonb_array_elements(submitted_answers) a) <> total then raise exception 'Preguntas duplicadas o incompletas'; end if;
  if exists (
   select 1 from jsonb_array_elements(submitted_answers) a
   left join academy_private.assessment_questions q on q.assessment_id = c.id and q.id = a->>'id'
   where q.id is null or jsonb_typeof(a->'choice') is distinct from 'number'
    or not exists (select 1 from generate_series(0, jsonb_array_length(q.options) - 1) n where n::text = a->>'choice')
  ) then raise exception 'Preguntas u opciones no válidas'; end if;
  select count(*) into attempts from public.assessment_attempts a where a.user_id = auth.uid() and a.assessment_id = c.id;
  if c.max_attempts is not null and attempts >= c.max_attempts then raise exception 'Se alcanzó el número de intentos permitido'; end if;
  select count(*) into correct from jsonb_array_elements(submitted_answers) a
  join academy_private.assessment_questions q on q.assessment_id = c.id and q.id = a->>'id'
  where q.correct_index::text = a->>'choice';
  insert into public.assessment_attempts(user_id, assessment_id, submission_key, attempt_number, answers, question_snapshot,
                                         pass_score, correct_count, question_count, score, passed)
   values (auth.uid(), c.id, request_key, attempts + 1, submitted_answers,
    (select jsonb_agg(jsonb_build_object('id', q.id, 'stem', q.stem, 'options', q.options) order by q.ordinal)
       from academy_private.assessment_questions q where q.assessment_id = c.id),
    c.pass_score, correct, total, round(correct * 100.0 / total, 2), (correct * 100.0 / total) >= c.pass_score)
   returning * into result;
 end if;
 return jsonb_build_object('attempt_id', result.id, 'score', result.score, 'passed', result.passed,
   'correct_count', result.correct_count, 'question_count', result.question_count,
   'attempt_number', result.attempt_number, 'submitted_at', result.submitted_at);
end $$;
revoke all on function public.submit_assessment(text, jsonb, uuid) from public, anon;
grant execute on function public.submit_assessment(text, jsonb, uuid) to authenticated;

-- Resumen para el panel: matrículas, avance y notas (sin respuestas ni claves).
create or replace function public.admin_course_overview(requested_course text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_academy_admin() then raise exception 'Acceso no autorizado.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'email', u.email, 'status', e.status, 'access_kind', e.access_kind,
      'payment_confirmed', e.payment_confirmed, 'valid_until', e.valid_until, 'created_at', e.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'completed', coalesce(jsonb_array_length(p.state->'completed'), 0),
      'progress_updated_at', p.updated_at,
      'best_scores', (select jsonb_object_agg(a.assessment_id, a.best) from (
          select assessment_id, max(score) as best from public.assessment_attempts
           where user_id = e.user_id group by assessment_id) a),
      'attempts', (select count(*) from public.assessment_attempts a where a.user_id = e.user_id))
      order by e.created_at desc)
    from public.course_enrollments e
    join auth.users u on u.id = e.user_id
    left join public.student_progress p on p.user_id = e.user_id and p.course_id = e.course_id
    where e.course_id = requested_course), '[]'::jsonb);
end $$;
revoke all on function public.admin_course_overview(text) from public, anon;
grant execute on function public.admin_course_overview(text) to authenticated;

-- 5. Revisores y gestión de matrículas ---------------------------------------------------
-- Personal docente (access_kind = 'staff') con acceso vigente: puede revisar versiones en prueba.
create or replace function public.is_course_staff(requested_course text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_course_access(requested_course) and exists (
    select 1 from public.course_enrollments e
     where e.user_id = (select auth.uid()) and e.course_id = requested_course and e.access_kind = 'staff');
$$;
revoke all on function public.is_course_staff(text) from public, anon;
grant execute on function public.is_course_staff(text) to authenticated;

create or replace function public.get_current_module(requested_course text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p academy_private.module_packages%rowtype; reviewer boolean;
begin
  if auth.uid() is null then raise exception 'Acceso no autorizado' using errcode = '42501'; end if;
  reviewer := public.is_academy_admin() or public.is_course_staff(requested_course);
  if not reviewer and not public.has_course_access(requested_course) then
    raise exception 'Acceso no autorizado' using errcode = '42501';
  end if;
  if reviewer then
    select * into p from academy_private.module_packages
     where course_id = requested_course and publication_state in ('testing','approved')
     order by (publication_state = 'testing') desc, updated_at desc limit 1;
  else
    select * into p from academy_private.module_packages
     where course_id = requested_course and publication_state = 'approved'
     order by updated_at desc limit 1;
  end if;
  if not found then raise exception 'El contenido del curso aún no está publicado.' using errcode = 'P0002'; end if;
  return jsonb_build_object('package_id', p.package_id, 'version_label', p.version_label,
                            'publication_state', p.publication_state, 'course', p.payload);
end $$;
revoke all on function public.get_current_module(text) from public, anon;
grant execute on function public.get_current_module(text) to authenticated;

-- Activar, renovar o suspender la matrícula de un alumno con cuenta existente.
-- Nunca modifica accesos de personal docente.
create or replace function public.admin_set_enrollment(p_email text, p_status text, p_valid_until timestamptz, p_payment_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid; e text := lower(btrim(coalesce(p_email, ''))); kind text;
begin
  if not public.is_academy_admin() then raise exception 'Acceso no autorizado.' using errcode = '42501'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'Estado no válido.' using errcode = '22023'; end if;
  if p_status = 'active' and char_length(btrim(coalesce(p_payment_note, ''))) < 3 then
    raise exception 'Indica la referencia del pago verificado.' using errcode = '22023';
  end if;
  if p_valid_until is not null and p_valid_until <= now() then raise exception 'La vigencia debe ser futura.' using errcode = '22023'; end if;
  select id into uid from auth.users where lower(email) = e;
  if uid is null then raise exception 'No existe una cuenta con ese correo. Envía primero la invitación.' using errcode = 'P0002'; end if;
  select access_kind into kind from public.course_enrollments where user_id = uid and course_id = 'flotas-electricas-peru';
  if kind = 'staff' then raise exception 'Esa cuenta es de personal docente; no se modifica desde aquí.' using errcode = '22023'; end if;
  insert into public.course_enrollments(user_id, course_id, status, payment_confirmed, valid_until, access_kind)
  values (uid, 'flotas-electricas-peru', p_status, p_status = 'active', p_valid_until, 'student')
  on conflict (user_id, course_id) do update
    set status = excluded.status,
        payment_confirmed = public.course_enrollments.payment_confirmed or excluded.payment_confirmed,
        valid_until = excluded.valid_until;
  insert into academy_private.audit_events(actor, action, target, detail)
   values (auth.uid(), 'set_enrollment', e, jsonb_build_object('status', p_status, 'valid_until', p_valid_until,
           'payment_note', left(btrim(coalesce(p_payment_note, '')), 200)));
  return jsonb_build_object('email', e, 'status', p_status, 'valid_until', p_valid_until);
end $$;
revoke all on function public.admin_set_enrollment(text, text, timestamptz, text) from public, anon;
grant execute on function public.admin_set_enrollment(text, text, timestamptz, text) to authenticated;

-- Acceso de alumno para la cuenta administradora verificada, marcado como docente.
insert into public.course_enrollments(user_id, course_id, status, payment_confirmed, valid_until, access_kind)
select a.user_id, 'flotas-electricas-peru', 'active', true, null, 'staff'
  from academy_private.administrators a join auth.users u on u.id = a.user_id
 where u.email_confirmed_at is not null
on conflict (user_id, course_id) do nothing;

commit;
