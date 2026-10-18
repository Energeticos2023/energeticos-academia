import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Las solicitudes se guardan sin sesión y solo el administrador puede revisarlas',async()=>{
 const db=new PGlite();
 const owner='00000000-0000-4000-8000-000000000010',student='00000000-0000-4000-8000-000000000011';
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
   grant usage on schema public to anon,authenticated,service_role;
   create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,invited_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;
   insert into auth.users(id,email,email_confirmed_at) values('${owner}','jose.zena.p@uni.pe',now()),('${student}','student@example.invalid',now());`);
  await db.exec(await readFile('supabase/registration.sql','utf8'));
  await db.exec('set role anon');
  const submit=async(name='Prueba',email='request@example.invalid',org='Institución',consent=true)=>(await db.query('select public.request_registration($1,$2,$3,$4) as result',[name,email,org,consent])).rows[0].result;
  assert.deepEqual(await submit(),{received:true});
  assert.deepEqual(await submit('Otra persona',' REQUEST@example.invalid '),{received:true});
  await assert.rejects(db.query('select * from public.registration_requests'),e=>e.code==='42501');
  await assert.rejects(db.query("insert into public.registration_requests(course_id,full_name,email) values('flotas-electricas-peru','Intruso','x@example.invalid')"),e=>e.code==='42501');
  await assert.rejects(submit('No consentido','new@example.invalid','',false),e=>e.code==='22023');
  await assert.rejects(submit('x','new@example.invalid'),e=>e.code==='22023');
  await assert.rejects(submit('Prueba','invalid'),e=>e.code==='22023');
  await db.exec('reset role');
  const row=(await db.query('select * from public.registration_requests')).rows[0];
  assert.equal((await db.query('select count(*)::int n from public.registration_requests')).rows[0].n,1);
  assert.equal(row.full_name,'Prueba');assert.equal(row.status,'pending');
  await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[student]);
  assert.equal((await db.query('select public.is_academy_admin() allowed')).rows[0].allowed,false);
  assert.equal((await db.query('select * from public.registration_requests')).rows.length,0);
  await assert.rejects(db.query('select public.set_registration_status($1,$2)',[row.id,'contacted']),e=>e.code==='42501');
  await assert.rejects(db.query('select * from academy_private.administrators'),e=>e.code==='42501');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  assert.equal((await db.query('select public.is_academy_admin() allowed')).rows[0].allowed,true);
  assert.equal((await db.query('select * from public.registration_requests')).rows.length,1);
  await db.query('select public.set_registration_status($1,$2)',[row.id,'contacted']);
  assert.equal((await db.query('select status from public.registration_requests')).rows[0].status,'contacted');
  await assert.rejects(db.query('select public.set_registration_status($1,$2)',[row.id,'active']),e=>e.code==='22023');
  await assert.rejects(db.query('update public.registration_requests set status=$1',['closed']),e=>e.code==='42501');
  await db.exec('reset role');
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[owner]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select public.is_academy_admin() allowed')).rows[0].allowed,false);
  assert.equal((await db.query('select * from public.registration_requests')).rows.length,0);
 }finally{await db.close();}
});
