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
  await set({payment_confirmed:true,status:'suspended'});await deny(student);
  await set({payment_confirmed:true,valid_until:new Date(Date.now()-60000).toISOString()});await deny(student);
 }finally{
  await admin.storage.from(bucket).remove([object]);
  for(const id of ids)await admin.auth.admin.deleteUser(id);
 }
});
