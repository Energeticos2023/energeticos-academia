// Ejecutar solo contra el proyecto dedicado después de aplicar setup.sql.
// Crea dos cuentas de prueba, sin enviar correos, y elimina solo sus propios datos.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL;
const publicKey=process.env.SUPABASE_PUBLISHABLE_KEY;
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
const course='flotas-electricas-peru';
test('Autorización real de matrículas, almacenamiento y progreso',{skip:!url||!publicKey||!secret},async()=>{
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,secret,options),anon=createClient(url,publicKey,options);
 const bucket='course-private';const object=course+'/security-check-'+randomUUID()+'.json';
 const ids=[];const payload='{"integration_test":true}';
 async function ok(result){assert.equal(result.error,null,result.error?.message);return result.data;}
 async function deny(client){const r=await client.storage.from(bucket).download(object);assert.ok(r.error,'La descarga debía estar denegada');}
 try{
  const bucketInfo=await ok(await admin.storage.getBucket(bucket));assert.equal(bucketInfo.public,false);
  await ok(await admin.storage.from(bucket).upload(object,payload,{contentType:'application/json'}));
  await deny(anon);
  const accounts=[];
  for(let i=0;i<2;i++){
   const email='academy-security-'+randomUUID()+'@example.com',password=randomBytes(24).toString('base64url');
   const user=await ok(await admin.auth.admin.createUser({email,password,email_confirm:true}));ids.push(user.user.id);
   const student=createClient(url,publicKey,options);await ok(await student.auth.signInWithPassword({email,password}));accounts.push(student);
  }
  const [student,other]=accounts;
  await deny(student);
  const enrollment={user_id:ids[0],course_id:course,status:'active',payment_confirmed:false,valid_until:null};
  const set=async change=>ok(await admin.from('course_enrollments').upsert({...enrollment,...change}));
  await set({});await deny(student);
  await set({payment_confirmed:true});assert.equal(await (await ok(await student.storage.from(bucket).download(object))).text(),payload);
  await deny(other);
  assert.ok((await student.from('course_enrollments').update({payment_confirmed:true,status:'active'}).eq('user_id',ids[0])).error,'Un alumno no debe poder editar matrículas');
  await ok(await student.from('student_progress').upsert({user_id:ids[0],course_id:course,state:{completed:['proposito']}}));
  const visible=await ok(await other.from('student_progress').select('state').eq('user_id',ids[0]));assert.equal(visible.length,0);
  assert.ok((await other.from('student_progress').upsert({user_id:ids[0],course_id:course,state:{}})).error,'Un alumno no debe poder escribir en el progreso de otro');
  // Requiere assessments.sql y el banco privado previamente cargados.
  const assessment=await ok(await student.rpc('get_assessment',{requested_assessment:'m1-final-v1'}));
  assert.equal(assessment.questions.length,10);
  assert.ok(!JSON.stringify(assessment).includes('correct_index'),'La API de preguntas no debe divulgar claves');
  assert.ok((await other.rpc('get_assessment',{requested_assessment:'m1-final-v1'})).error,'El examen no está disponible sin matrícula');
  const submissionKey=randomUUID();
  const submitted=assessment.questions.map(q=>({id:q.id,choice:0,score:100}));
  const first=await ok(await student.rpc('submit_assessment',{requested_assessment:assessment.id,submitted_answers:submitted,request_key:submissionKey}));
  assert.equal(first.score,first.correct_count*100/first.question_count);
  const again=await ok(await student.rpc('submit_assessment',{requested_assessment:assessment.id,submitted_answers:submitted,request_key:submissionKey}));
  assert.equal(first.attempt_id,again.attempt_id,'Un reintento de red no debe consumir otro intento');
  assert.ok((await student.from('assessment_attempts').update({score:100,passed:true}).eq('id',first.attempt_id)).error,'La nota no debe poder modificarse desde el alumno');
  const otherAttempts=await ok(await other.from('assessment_attempts').select('id').eq('user_id',ids[0]));assert.equal(otherAttempts.length,0);
  const duplicates=assessment.questions.map(q=>({id:assessment.questions[0].id,choice:0}));
  assert.ok((await student.rpc('submit_assessment',{requested_assessment:assessment.id,submitted_answers:duplicates,request_key:randomUUID()})).error,'No deben aceptarse preguntas duplicadas');
  await set({payment_confirmed:true,status:'suspended'});await deny(student);
  assert.ok((await student.rpc('get_assessment',{requested_assessment:assessment.id})).error,'La suspensión también bloquea evaluaciones');
  await set({payment_confirmed:true,valid_until:new Date(Date.now()-60000).toISOString()});await deny(student);
 }finally{
  await admin.storage.from(bucket).remove([object]);
  for(const id of ids)await admin.auth.admin.deleteUser(id);
 }
});
