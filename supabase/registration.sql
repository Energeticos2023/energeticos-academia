-- Solicitudes públicas y panel privado del titular. No habilita matrículas.
begin;
create schema if not exists academy_private;
revoke all on schema academy_private from public, anon, authenticated;
create table if not exists academy_private.administrators (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
revoke all on academy_private.administrators from public, anon, authenticated;
create or replace function public.is_academy_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from academy_private.administrators a join auth.users u on u.id=a.user_id
 where a.user_id = (select auth.uid()) and u.email_confirmed_at is not null);
$$;
revoke all on function public.is_academy_admin() from public,anon;
grant execute on function public.is_academy_admin() to authenticated;
create table if not exists public.registration_requests (
 id uuid primary key default gen_random_uuid(),
 course_id text not null check(course_id='flotas-electricas-peru'),
 full_name text not null check(char_length(full_name) between 2 and 120),
 email text not null check(char_length(email) between 3 and 254),
 organization text not null default '' check(char_length(organization)<=160),
 status text not null default 'pending' check(status in ('pending','contacted','closed')),
 consent_version text not null default '2026-10-v1',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(course_id,email)
);
alter table public.registration_requests enable row level security;
revoke all on public.registration_requests from public,anon,authenticated;
grant select on public.registration_requests to authenticated;
grant all on public.registration_requests to service_role;
drop policy if exists registration_admin_read on public.registration_requests;
create policy registration_admin_read on public.registration_requests for select to authenticated
 using((select public.is_academy_admin()));
create or replace function public.request_registration(p_name text,p_email text,p_organization text,p_consent boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n text:=btrim(p_name); e text:=lower(btrim(p_email)); o text:=btrim(coalesce(p_organization,''));
begin
 if p_consent is distinct from true or n is null or char_length(n) not between 2 and 120
 or e is null or char_length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or char_length(o)>160 or n ~ '[[:cntrl:]]' or o ~ '[[:cntrl:]]' then
  raise exception 'Revisa tus datos y autoriza el registro de la solicitud.' using errcode='22023';
 end if;
 insert into public.registration_requests(course_id,full_name,email,organization)
 values('flotas-electricas-peru',n,e,o) on conflict(course_id,email) do nothing;
 return jsonb_build_object('received',true);
end;
$$;
revoke all on function public.request_registration(text,text,text,boolean) from public;
grant execute on function public.request_registration(text,text,text,boolean) to anon,authenticated;
create or replace function public.set_registration_status(p_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_academy_admin() then raise exception 'Acceso no autorizado.' using errcode='42501'; end if;
 if p_status not in ('pending','contacted','closed') or p_status is null then raise exception 'Estado no válido.' using errcode='22023'; end if;
 update public.registration_requests set status=p_status,updated_at=now() where id=p_id;
 if not found then raise exception 'Solicitud no encontrada.' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.set_registration_status(uuid,text) from public,anon;
grant execute on function public.set_registration_status(uuid,text) to authenticated;
-- Vincula solo la cuenta verificada del titular, si ya existe. No crea credenciales.
insert into academy_private.administrators(user_id)
 select id from auth.users where lower(email)='jose.zena.p@uni.pe'
 and (email_confirmed_at is not null or invited_at is not null)
 on conflict do nothing;
commit;
