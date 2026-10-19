import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const course='flotas-electricas-peru';
const owner='00000000-0000-4000-8000-000000000020';
const student='00000000-0000-4000-8000-000000000021';
const outsider='00000000-0000-4000-8000-000000000022';
const reviewer='00000000-0000-4000-8000-000000000023';

async function database(){
 const db=new PGlite();
 await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon,authenticated,service_role;
  create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,invited_at timestamptz,last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to anon,authenticated,service_role;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon,authenticated,service_role;
  grant select on storage.objects to anon,authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(regexp_replace(name,'/[^/]+$',''),'/')$$;
  insert into auth.users(id,email,email_confirmed_at) values
   ('${owner}','jose.zena.p@uni.pe',now()),('${student}','alumno@example.invalid',now()),('${outsider}','otro@example.invalid',now()),('${reviewer}','revisor@example.invalid',now());`);
 for(const file of ['setup.sql','assessments.sql','registration.sql','campus-v2.sql'])await db.exec(await readFile('supabase/'+file,'utf8'));
 // La migración crea el acceso docente del administrador verificado; el alumno se matricula aparte.
 await db.query(`insert into public.course_enrollments(user_id,course_id,status,payment_confirmed) values($1,$2,'active',true)`,[student,course]);
 await db.query(`insert into public.course_enrollments(user_id,course_id,status,payment_confirmed,access_kind) values($1,$2,'active',true,'staff')`,[reviewer,course]);
 // Banco sintético: 3 capítulos con 4 preguntas cada uno; se sortean 2 + 2 + 1 = 5.
 await db.query(`insert into public.assessment_catalog(id,course_id,lesson_id,title,pass_score,max_attempts,active,draw_rule,time_limit_minutes)
  values('exam-test',$1,'evaluacion','Examen sintético',70,3,true,'{"1.1":2,"1.2":2,"1.3":1}',45)`,[course]);
 for(const ch of ['1.1','1.2','1.3'])for(let k=1;k<=4;k++)
  await db.query(`insert into academy_private.assessment_questions(assessment_id,id,ordinal,stem,options,correct_index,explanation,stratum)
   values('exam-test',$1,$2,$3,'["A","B","C","D"]'::jsonb,$4,'Explicación sintética',$5)`,[`q${ch}-${k}`,Number(ch.slice(2))*10+k,`Pregunta ${ch}-${k}`,k%4,ch]);
 await db.query(`insert into academy_private.module_packages(package_id,course_id,version_label,publication_state,payload) values
   ('pkg-old',$1,'1.0','approved','{"module_id":"module-1","lessons":[{"id":"a"}]}'),
   ('pkg-new',$1,'2.2','testing','{"module_id":"module-1","lessons":[{"id":"a"},{"id":"b"}]}')`,[course]);
 return db;
}
async function as(db,id,fn){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn();}finally{await db.exec('reset role');}}
const one=async(db,sql,params=[])=>(await db.query(sql,params)).rows[0];

test('Campus v2: publicación controlada, acceso docente y examen con sorteo en servidor',async t=>{
 const db=await database();
 try{
  await t.test('La migración da acceso docente solo al administrador verificado',async()=>{
   assert.deepEqual((await db.query('select user_id,access_kind from public.course_enrollments order by user_id')).rows,
    [{user_id:owner,access_kind:'staff'},{user_id:student,access_kind:'student'},{user_id:reviewer,access_kind:'staff'}]);
  });
  await t.test('El alumno ve solo la versión aprobada; el administrador ve la versión en prueba',async()=>{
   await as(db,student,async()=>{
    const current=(await one(db,'select public.get_current_module($1) as r',[course])).r;
    assert.equal(current.package_id,'pkg-old');assert.equal(current.publication_state,'approved');
    await assert.rejects(db.query('select public.get_module_package($1)',['pkg-new']),e=>e.code==='42501');
    await assert.rejects(db.query('select public.publish_module_package($1)',['pkg-new']),e=>e.code==='42501');
    await assert.rejects(db.query('select public.list_module_packages()'),e=>e.code==='42501');
    await assert.rejects(db.query('select public.admin_course_overview($1)',[course]),e=>e.code==='42501');
   });
   await as(db,outsider,async()=>{await assert.rejects(db.query('select public.get_current_module($1)',[course]),e=>e.code==='42501');});
   await as(db,reviewer,async()=>{
    assert.equal((await one(db,'select public.get_current_module($1) as r',[course])).r.package_id,'pkg-new','el revisor ve la versión en prueba');
    await assert.rejects(db.query('select public.publish_module_package($1)',['pkg-new']),e=>e.code==='42501');
   });
   await as(db,owner,async()=>{
    const current=(await one(db,'select public.get_current_module($1) as r',[course])).r;
    assert.equal(current.package_id,'pkg-new');assert.equal(current.course.lessons.length,2);
    assert.equal((await one(db,'select public.list_module_packages() as r')).r.length,2);
   });
  });
  await t.test('Publicar aprueba la versión en prueba, archiva la anterior y queda auditado',async()=>{
   await as(db,owner,async()=>{await db.query('select public.publish_module_package($1)',['pkg-new']);});
   assert.deepEqual((await db.query('select package_id,publication_state from academy_private.module_packages order by package_id')).rows,
    [{package_id:'pkg-new',publication_state:'approved'},{package_id:'pkg-old',publication_state:'archived'}]);
   assert.equal((await one(db,"select count(*)::int n from academy_private.audit_events where action='publish_module_package'")).n,1);
   await as(db,student,async()=>assert.equal((await one(db,'select public.get_current_module($1) as r',[course])).r.package_id,'pkg-new'));
   await as(db,owner,async()=>await assert.rejects(db.query('select public.publish_module_package($1)',['pkg-new'])));
  });
  await t.test('El esquema privado no es accesible para alumnos',async()=>{
   await as(db,student,async()=>{
    for(const table of ['administrators','assessment_sessions','module_packages','audit_events','assessment_questions'])
     await assert.rejects(db.query(`select * from academy_private.${table}`),e=>e.code==='42501');
    await assert.rejects(db.query("update public.course_enrollments set access_kind='staff'"),e=>e.code==='42501');
   });
  });
  let attempt1;
  await t.test('Ver la evaluación no consume intentos; iniciarla sortea 5 preguntas estratificadas sin claves',async()=>{
   await as(db,student,async()=>{
    const info=(await one(db,'select public.get_assessment($1) as r',['exam-test'])).r;
    assert.equal(info.mode,'draw');assert.equal(info.attempts,0);assert.equal(info.session,null);assert.equal(info.draw_size,5);
    const started=(await one(db,'select public.start_assessment($1) as r',['exam-test'])).r;
    assert.equal(started.attempts,1);assert.equal(started.session.questions.length,5);
    assert.ok(!JSON.stringify(started).includes('correct_index')&&!JSON.stringify(started).includes('Explicación'));
    const strata=started.session.questions.map(q=>q.id.slice(1,4)).sort();
    assert.deepEqual(strata,['1.1','1.1','1.2','1.2','1.3']);
    const again=(await one(db,'select public.start_assessment($1) as r',['exam-test'])).r;
    assert.equal(again.session.id,started.session.id,'reabrir devuelve el mismo intento');
    attempt1=started.session;
   });
  });
  await t.test('El envío se califica en servidor, admite preguntas sin responder y es idempotente',async()=>{
   await as(db,student,async()=>{
    const correct=q=>Number(q.id.split('-')[1])%4;
    const answers=attempt1.questions.map((q,i)=>({id:q.id,choice:i===0?null:correct(q)}));
    const key=randomUUID();
    const r=(await one(db,'select public.submit_assessment($1,$2::jsonb,$3::uuid) as r',['exam-test',JSON.stringify(answers),key])).r;
    assert.equal(r.correct_count,4);assert.equal(r.score,80);assert.equal(r.passed,true);assert.equal(r.attempt_number,1);
    const again=(await one(db,'select public.submit_assessment($1,$2::jsonb,$3::uuid) as r',['exam-test',JSON.stringify(answers),key])).r;
    assert.equal(again.attempt_id,r.attempt_id);
    await assert.rejects(db.query('select public.submit_assessment($1,$2::jsonb,$3::uuid)',['exam-test',JSON.stringify(answers),randomUUID()]),/No hay un intento/);
   });
  });
  await t.test('Respuestas ajenas al intento se rechazan y el cuarto intento no se permite',async()=>{
   await as(db,student,async()=>{
    const s2=(await one(db,'select public.start_assessment($1) as r',['exam-test'])).r.session;
    const foreign=s2.questions.map((q,i)=>({id:i===0?'q-ajena':q.id,choice:0}));
    await assert.rejects(db.query('select public.submit_assessment($1,$2::jsonb,$3::uuid)',['exam-test',JSON.stringify(foreign),randomUUID()]));
    await db.query('select public.submit_assessment($1,$2::jsonb,$3::uuid)',['exam-test',JSON.stringify(s2.questions.map(q=>({id:q.id,choice:0}))),randomUUID()]);
    await db.query('select public.start_assessment($1)',['exam-test']);
   });
   // el tercer intento vence sin envío: cuenta como utilizado
   await db.query("update academy_private.assessment_sessions set expires_at=now()-interval '10 minutes' where attempt_number=3");
   await as(db,student,async()=>{
    await assert.rejects(db.query('select public.submit_assessment($1,$2::jsonb,$3::uuid)',['exam-test','[]',randomUUID()]),/terminó/);
    const info=(await one(db,'select public.get_assessment($1) as r',['exam-test'])).r;
    assert.equal(info.attempts,3);assert.equal(info.session,null);assert.equal(Number(info.best_score),80);
    await assert.rejects(db.query('select public.start_assessment($1)',['exam-test']),/intentos/);
   });
  });
  await t.test('El panel resume matrículas y notas solo para el administrador',async()=>{
   await as(db,owner,async()=>{
    const overview=(await one(db,'select public.admin_course_overview($1) as r',[course])).r;
    assert.equal(overview.length,3);assert.ok(overview.some(x=>x.access_kind==='staff'));
    const alumno=overview.find(x=>x.email==='alumno@example.invalid');assert.equal(Number(alumno.best_scores['exam-test']),80);
    assert.ok(!JSON.stringify(overview).includes('correct_index'));
   });
  });
  await t.test('El administrador activa, renueva y suspende matrículas con referencia de pago; no toca al personal',async()=>{
   await as(db,student,async()=>await assert.rejects(db.query('select public.admin_set_enrollment($1,$2,$3,$4)',['otro@example.invalid','active',null,'Op. 123']),e=>e.code==='42501'));
   await as(db,owner,async()=>{
    await assert.rejects(db.query('select public.admin_set_enrollment($1,$2,$3,$4)',['otro@example.invalid','active',null,'']),e=>e.code==='22023');
    await assert.rejects(db.query('select public.admin_set_enrollment($1,$2,$3,$4)',['nadie@example.invalid','active',null,'Op. 123']),e=>e.code==='P0002');
    await assert.rejects(db.query('select public.admin_set_enrollment($1,$2,$3,$4)',['revisor@example.invalid','suspended',null,'']),e=>e.code==='22023');
    await db.query('select public.admin_set_enrollment($1,$2,$3,$4)',[' OTRO@example.invalid ','active','2099-01-01T00:00:00Z','Depósito BCP op. 123']);
   });
   await as(db,outsider,async()=>assert.equal((await one(db,'select public.get_current_module($1) as r',[course])).r.package_id,'pkg-new'));
   await as(db,owner,async()=>await db.query('select public.admin_set_enrollment($1,$2,$3,$4)',['otro@example.invalid','suspended',null,'']));
   await as(db,outsider,async()=>await assert.rejects(db.query('select public.get_current_module($1)',[course]),e=>e.code==='42501'));
   const row=await one(db,'select status,payment_confirmed,access_kind from public.course_enrollments where user_id=$1',[outsider]);
   assert.deepEqual(row,{status:'suspended',payment_confirmed:true,access_kind:'student'});
   assert.equal((await one(db,"select count(*)::int n from academy_private.audit_events where action='set_enrollment'")).n,2);
  });
 }finally{await db.close();}
});
