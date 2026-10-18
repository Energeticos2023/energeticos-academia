import {adminClient,ask,COURSE_ID} from './admin-client.mjs';
const action=process.argv[2];
try {
 if(!['invitar','activar','suspender'].includes(action))throw new Error('Uso: node scripts/manage-students.mjs invitar|activar|suspender');
 const client=await adminClient();
 const email=(await ask('Correo del estudiante: ')).toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Correo no válido.');
 let user;
 if(action==='invitar'){
  const site=await ask('URL HTTPS de la web del curso: ');
  const target=new URL(site);if(target.protocol!=='https:'||target.username||target.password)throw new Error('URL no válida.');
  if(await ask('¿Pago verificado? Escribe PAGO CONFIRMADO: ')!=='PAGO CONFIRMADO')throw new Error('Matrícula no activada.');
  if(await ask('Se enviará una invitación a ese correo. Escribe ENVIAR para continuar: ')!=='ENVIAR')throw new Error('Invitación cancelada.');
  const result=await client.auth.admin.inviteUserByEmail(email,{redirectTo:site});
  if(result.error)throw new Error('No se pudo invitar. Si la cuenta existe, utiliza activar y pide al alumno recuperar su contraseña.');
  user=result.data.user;
 }else{
  for(let page=1;page<=100;page++){
   const {data,error}=await client.auth.admin.listUsers({page,perPage:100});
   if(error)throw new Error('No se pudo consultar la cuenta.');
   user=data.users.find(u=>u.email?.toLowerCase()===email);if(user||data.users.length<100)break;
  }
  if(!user)throw new Error('No se encontró la cuenta.');
  if(action==='activar'&&await ask('¿Pago verificado? Escribe PAGO CONFIRMADO: ')!=='PAGO CONFIRMADO')throw new Error('Matrícula no activada.');
 }
 let validUntil=null;
 if(action!=='suspender'){
  const expiry=await ask('Vencimiento YYYY-MM-DD (vacío = sin vencimiento): ');
  if(expiry){if(!/^\d{4}-\d{2}-\d{2}$/.test(expiry))throw new Error('Fecha no válida.');const date=new Date(expiry+'T23:59:59-05:00');if(!Number.isFinite(date.getTime())||date.getTime()<=Date.now())throw new Error('La fecha debe estar en el futuro.');validUntil=date.toISOString();}
 }
 const record={user_id:user.id,course_id:COURSE_ID,status:action==='suspender'?'suspended':'active',payment_confirmed:action!=='suspender',valid_until:validUntil};
 const {error}=await client.from('course_enrollments').upsert(record,{onConflict:'user_id,course_id'});
 if(error)throw new Error('No se pudo guardar la matrícula. La cuenta no obtiene acceso sin una matrícula activa. Revisa la configuración.');
 console.log(action==='suspender'?'Acceso suspendido.':'Matrícula activada. El estudiante define su propia contraseña mediante el correo de invitación o recuperación.');
}catch(error){console.error(error.message);process.exitCode=1;}
