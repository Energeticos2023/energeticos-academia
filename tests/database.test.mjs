import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('PostgreSQL aplica la autorización de matrículas y calcula notas sin confiar en el navegador',async t=>{
 const db=new PGlite();
 const student='00000000-0000-4000-8000-000000000001';
 const other='00000000-0000-4000-8000-000000000002';
 const course='flotas-electricas-peru';
 try{
  await db.exec(`
   create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
   grant usage on schema public to anon,authenticated,service_role;
   create schema auth;
   create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated,service_role;
   create schema storage;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   grant usage on schema storage to anon,authenticated,service_role;
   grant select on storage.objects to anon,authenticated;
   create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(regexp_replace(name,'/[^/]+$',''),'/')$$;
  `);
  await db.exec(await readFile('supabase/setup.sql','utf8'));
  await db.exec(await readFile('supabase/assessments.sql','utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[student,'test-one@example.invalid',other,'test-two@example.invalid']);
  await db.query('insert into public.course_enrollments(user_id,course_id,status,payment_confirmed) values($1,$2,$3,false)',[student,course,'active']);
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['course-private',course+'/module-1/test.json']);
  await db.query('insert into public.assessment_catalog(id,course_id,lesson_id,title,pass_score,active) values($1,$2,$3,$4,70,true)',['test-assessment',course,'test-unit','Evaluación sintética de prueba']);
  await db.exec(`insert into academy_private.assessment_questions(assessment_id,id,ordinal,stem,options,correct_index,explanation) values
   ('test-assessment','one',1,'Pregunta sintética uno','["A","B"]'::jsonb,1,'Explicación sintética uno'),
   ('test-assessment','two',2,'Pregunta sintética dos','["A","B"]'::jsonb,0,'Explicación sintética dos');`);
  async function asUser(id,fn){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn();}finally{await db.exec('reset role');}}
  async function grade(answers,key=randomUUID()){return (await db.query('select public.submit_assessment($1,$2::jsonb,$3::uuid) as result',['test-assessment',JSON.stringify(answers),key])).rows[0].result;}
  await t.test('Anónimos y alumnos impagos no pueden acceder a materiales o evaluaciones',async()=>{
   await db.exec('set role anon');
   assert.equal((await db.query('select * from storage.objects')).rows.length,0);
   await assert.rejects(db.query('select public.get_assessment($1)',['test-assessment']),e=>e.code==='42501');await db.exec('reset role');
   await asUser(student,async()=>{assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(db.query('select public.get_assessment($1)',['test-assessment']),e=>e.code==='42501');});
  });
  await db.query('update public.course_enrollments set payment_confirmed=true where user_id=$1',[student]);
  await t.test('La matrícula pagada permite leer materiales; la cuenta sin matrícula no tiene acceso',async()=>{
   await asUser(student,async()=>assert.equal((await db.query('select * from storage.objects')).rows.length,1));
   await asUser(other,async()=>{assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(db.query('select public.get_assessment($1)',['test-assessment']),e=>e.code==='42501');});
  });
  await t.test('Las claves de respuesta no se entregan al alumno',async()=>{
   await asUser(student,async()=>{
    await assert.rejects(db.query('select * from academy_private.assessment_questions'),e=>e.code==='42501');
    const assessment=(await db.query('select public.get_assessment($1) as data',['test-assessment'])).rows[0].data;
    assert.equal(assessment.questions.length,2);assert.ok(!JSON.stringify(assessment).includes('correct_index'));assert.ok(!JSON.stringify(assessment).includes('explanation'));
   });
  });
  let attemptId;
  await t.test('El servidor ignora una nota enviada por el cliente y un reenvío conserva el mismo intento',async()=>{
   await asUser(student,async()=>{
    const request=randomUUID();
    const result=await grade([{id:'one',choice:0,score:100},{id:'two',choice:0,score:100}],request);
    assert.equal(result.score,50);assert.equal(result.passed,false);attemptId=result.attempt_id;
    const repeated=await grade([{id:'one',choice:1},{id:'two',choice:0}],request);
    assert.equal(repeated.attempt_id,attemptId);assert.equal(repeated.score,50);assert.equal(repeated.attempt_number,1);
    await assert.rejects(db.query('update public.assessment_attempts set score=100 where id=$1',[attemptId]),e=>e.code==='42501');
   });
  });
  await t.test('Los intentos incompletos, duplicados o con opciones inexistentes se rechazan',async()=>{
   await asUser(student,async()=>{
    for(const a of [[{id:'one',choice:1}],[{id:'one',choice:1},{id:'one',choice:0}],[{id:'one',choice:7},{id:'two',choice:0}],[{id:'one',choice:'1'},{id:'two',choice:0}]])await assert.rejects(grade(a));
   });
  });
  await t.test('Un intento correcto se registra y se conserva una instantánea de preguntas sin soluciones',async()=>{
   await asUser(student,async()=>{
    const result=await grade([{id:'one',choice:1},{id:'two',choice:0}]);assert.equal(result.score,100);assert.equal(result.passed,true);assert.equal(result.attempt_number,2);
    const snapshot=(await db.query('select question_snapshot from public.assessment_attempts where id=$1',[result.attempt_id])).rows[0].question_snapshot;
    assert.equal(snapshot.length,2);assert.ok(!JSON.stringify(snapshot).includes('correct_index'));
   });
  });
  await t.test('Los límites se aplican en servidor y los resultados solo son visibles para su propietario',async()=>{
   await db.query('update public.assessment_catalog set max_attempts=2 where id=$1',['test-assessment']);
   await asUser(student,async()=>{await assert.rejects(grade([{id:'one',choice:1},{id:'two',choice:0}]));await assert.rejects(db.query('update public.course_enrollments set payment_confirmed=true where user_id=$1',[student]),e=>e.code==='42501');});
   await asUser(other,async()=>assert.equal((await db.query('select * from public.assessment_attempts')).rows.length,0));
  });
  await t.test('La suspensión y el vencimiento bloquean las evaluaciones y el almacenamiento',async()=>{
   for(const [status,expiry] of [['suspended',null],['active','2000-01-01T00:00:00Z']]){
    await db.query('update public.course_enrollments set status=$1,valid_until=$2 where user_id=$3',[status,expiry,student]);
    await asUser(student,async()=>{assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(db.query('select public.get_assessment($1)',['test-assessment']),e=>e.code==='42501');});
   }
  });
  let seed;try{seed=await readFile('private-assessments/seed.sql','utf8');}catch{}
  if(seed)await t.test('El banco privado real se instala con sus seis evaluaciones y 35 preguntas calificables',async()=>{
   await db.exec(seed);
   assert.equal((await db.query("select count(*)::integer as count from public.assessment_catalog where id like 'm1-%'")).rows[0].count,6);
   assert.equal((await db.query("select count(*)::integer as count from academy_private.assessment_questions where assessment_id like 'm1-%'")).rows[0].count,35);
  });
 }finally{await db.close();}
});
