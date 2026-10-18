import { createClient } from '@supabase/supabase-js';
import { validateConfig, enrollmentIsActive, isPrivateMaterialPath } from './access.mjs';

const config = window.ACADEMY_CONFIG;
const $ = s => document.querySelector(s);
let client, session, heartbeat, active=false, loading=false, saveTimer;
const objectUrls = new Map();
const COURSE_ID = config.courseId;
const recoveryType = new URLSearchParams(location.hash.slice(1)).get('type');
const status = (message, type='info') => { $('#auth-status').textContent=message; $('#auth-status').dataset.type=type; };
const setBusy = (value) => document.querySelectorAll('.auth-form button').forEach(b => b.disabled=value);
const redirectTo = () => new URL('.', location.href).href;

function showPublic(message) {
  active=false; $('#classroom').hidden=true; $('#public-view').hidden=false;
  if (heartbeat) clearInterval(heartbeat);
  objectUrls.forEach(url => URL.revokeObjectURL(url)); objectUrls.clear();
  if(message) { status(message,'error'); $('#login-section').scrollIntoView({block:'center'}); }
}
function showPassword() {
  showPublic();$('#login-form').hidden=true;$('#reset-form').hidden=true;$('#new-password-form').hidden=false;
  status('Define tu contraseña personal para ingresar al curso.');$('#login-section').scrollIntoView({block:'center'});
}
async function assertEnrollment() {
  const {data:enrollment,error} = await client.from('course_enrollments')
    .select('status,payment_confirmed,valid_until').eq('user_id',session.user.id).eq('course_id',COURSE_ID).maybeSingle();
  if(error) throw new Error('No se pudo verificar tu matrícula. Intenta nuevamente o contacta al docente.');
  if(!enrollmentIsActive(enrollment)) throw new Error('Tu matrícula no está activa. Contacta al docente para verificar tu pago o la vigencia de tu acceso.');
  return enrollment;
}
async function downloadPrivate(path) {
  if(!isPrivateMaterialPath(path,COURSE_ID))throw new Error('Ruta de material no válida.');
  const {data,error} = await client.storage.from(config.bucket).download(path);
  if(error)throw new Error('No fue posible acceder al material. Verifica tu matrícula o vuelve a iniciar sesión.');
  return data;
}
async function hydrateImages() {
  if(!active)return;
  for(const img of document.querySelectorAll('img[data-private-path]:not([data-loading])')) {
    img.dataset.loading='true';const path=img.dataset.privatePath;
    try {
      let url=objectUrls.get(path);
      if(!url){url=URL.createObjectURL(await downloadPrivate(path));objectUrls.set(path,url);}
      if(img.isConnected&&active)img.src=url;
    } catch { img.alt='Ilustración no disponible. Vuelve a iniciar sesión para reintentar.'; }
  }
}
function sanitizeLessons(course) {
  if(!Array.isArray(course.lessons)||!Array.isArray(course.questions))throw new Error('El contenido del curso no tiene un formato válido.');
  const allowed=new Set(['P','H2','H3','UL','OL','LI','ASIDE','DIV','TABLE','THEAD','TBODY','TR','TH','TD','FIGURE','IMG','STRONG','EM','BR','SMALL']);
  for(const lesson of course.lessons) {
    const doc=new DOMParser().parseFromString(lesson.html,'text/html');
    for(const el of doc.body.querySelectorAll('*')) {
      if(!allowed.has(el.tagName)){el.remove();continue;}
      for(const a of [...el.attributes])if(!['class','alt','loading','scope','data-private-path'].includes(a.name))el.removeAttribute(a.name);
      if(el.tagName==='IMG'&&!isPrivateMaterialPath(el.dataset.privatePath,COURSE_ID))el.remove();
    }
    lesson.html=doc.body.innerHTML;
  }
  return course;
}
async function openClassroom() {
  if(loading||active)return;loading=true;setBusy(true);status('Verificando tu matrícula…');
  try {
    const {data,error}=await client.auth.getSession();if(error||!data.session)throw new Error('Inicia sesión con tu correo y contraseña.');session=data.session;
    await assertEnrollment();
    if(window.academyStarted && window.academyUserId!==session.user.id){location.replace(redirectTo());return;}
    const course = sanitizeLessons(JSON.parse(await (await downloadPrivate(COURSE_ID+'/module-1/course-data.json')).text()));
    const progress=await client.from('student_progress').select('state').eq('user_id',session.user.id).eq('course_id',COURSE_ID).maybeSingle();
    if(progress.error)throw new Error('No se pudo cargar tu progreso. Intenta nuevamente.');
    window.COURSE=course;
    window.ACADEMY={userId:session.user.id,initialProgress:progress.data?.state||null,
      queueSave(state) {
        clearTimeout(saveTimer);
        saveTimer=setTimeout(async()=>{
          if(!active)return;
          const {error}=await client.from('student_progress').upsert({user_id:session.user.id,course_id:COURSE_ID,state,updated_at:new Date().toISOString()},{onConflict:'user_id,course_id'});
          document.querySelectorAll('.local-note').forEach(el=>el.textContent=error?'No se pudo sincronizar. Se conserva una copia en este navegador.':'Progreso sincronizado con tu cuenta.');
        },900);
      }};
    $('#public-view').hidden=true;$('#classroom').hidden=false;active=true;
    $('#student-email').textContent=session.user.email;
    if(!window.academyStarted) {window.academyStarted=true;window.academyUserId=session.user.id;window.startAcademy();}
    $('#login-form').reset();
    hydrateImages();
    new MutationObserver(()=>hydrateImages()).observe($('#main'),{childList:true,subtree:true});
    heartbeat=setInterval(async()=>{try{await assertEnrollment();}catch(error){showPublic(error.message);}},60000);
  } catch(error) {
    showPublic(error.message||'No se pudo abrir el aula. Intenta nuevamente.');
  } finally {loading=false;setBusy(false);}
}

document.addEventListener('click',async e=>{
  const a=e.target.closest('a');if(!a)return;
  const match=(a.getAttribute('href')||'').match(/^materiales\/(manual-modulo-1\.docx|presentacion-modulo-1\.pptx)$/);
  if(!match)return;e.preventDefault();e.stopImmediatePropagation();
  if(!active||!session)return showPublic('Inicia sesión para descargar los materiales.');
  const original=a.getAttribute('aria-busy');a.setAttribute('aria-busy','true');
  try {
    const blob=await downloadPrivate(COURSE_ID+'/module-1/materiales/'+match[1]);
    const url=URL.createObjectURL(blob);const download=document.createElement('a');download.href=url;download.download=match[1];download.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  } catch(error) {alert(error.message);}finally{if(original)a.setAttribute('aria-busy',original);else a.removeAttribute('aria-busy');}
},true);

$('#go-reset').addEventListener('click',()=>{$('#login-form').hidden=true;$('#reset-form').hidden=false;status('Indica el correo asociado a tu matrícula.');});
$('#back-login').addEventListener('click',()=>{$('#reset-form').hidden=true;$('#login-form').hidden=false;status('');});
$('#logout').addEventListener('click',async()=>{
  const localKey='energeticos-academia-m1-v1:'+session?.user?.id;
  if(saveTimer)clearTimeout(saveTimer);
  try{await client.auth.signOut();}finally{localStorage.removeItem(localKey);location.replace(redirectTo());}
});
$('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!client)return status('El acceso de alumnos se habilitará próximamente. Solicita información al docente.');
  setBusy(true);status('Comprobando tus datos…');
  try {
    const {error}=await client.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});
    $('#login-password').value='';
    if(error)return status('No se pudo iniciar sesión. Revisa tu correo y contraseña o recupera tu acceso.','error');
    await openClassroom();
  } catch{status('No se pudo conectar. Intenta nuevamente.','error');}finally{setBusy(false);}
});
$('#reset-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!client)return status('La recuperación de acceso aún no está habilitada. Contacta al docente.');
  setBusy(true);
  try {
    const {error}=await client.auth.resetPasswordForEmail($('#reset-email').value.trim(),{redirectTo:redirectTo()});
    if(error)status('No se pudo procesar la solicitud. Intenta más tarde.','error');
    else status('Si el correo tiene una cuenta, recibirás las instrucciones para recuperar tu contraseña.');
  }catch{status('No se pudo conectar. Intenta nuevamente.','error');}finally{setBusy(false);}
});
$('#new-password-form').addEventListener('submit',async e=>{
  e.preventDefault();const password=$('#new-password').value;
  if(password!==$('#confirm-password').value)return status('Las contraseñas no coinciden.','error');
  if(!client||password.length<12)return status('Utiliza una contraseña de al menos 12 caracteres.','error');
  setBusy(true);
  try {
    const {error}=await client.auth.updateUser({password});if(error)return status('No se pudo cambiar la contraseña. Solicita un nuevo enlace de recuperación.','error');
    $('#new-password-form').reset();history.replaceState(null,'',redirectTo());
    // Recargar elimina cualquier contenido de otra sesión y deja al SDK restaurar esta cuenta.
    location.replace(redirectTo());
  }catch{status('No se pudo conectar. Intenta nuevamente.','error');}finally{setBusy(false);}
});

try {
  if(validateConfig(config)) {
    client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,storage:sessionStorage,detectSessionInUrl:true,autoRefreshToken:true,flowType:'implicit'}});
    client.auth.onAuthStateChange((event,currentSession)=>{
      if(currentSession)session=currentSession;
      if(event==='PASSWORD_RECOVERY')showPassword();
      if(event==='SIGNED_OUT'&&active)showPublic('Tu sesión ha finalizado.');
    });
    const {data,error}=await client.auth.getSession();
    if(error)status('El enlace de acceso no es válido o ha vencido. Solicita uno nuevo.','error');
    else if(data.session && ['recovery','invite'].includes(recoveryType))showPassword();
    else if(data.session)await openClassroom();
  } else {
    status('Inscripciones por apertura. El acceso de alumnos se habilitará próximamente.');
    $('#login-form button[type="submit"]').disabled=true;
  }
}catch {status('El acceso de alumnos está en configuración. Contacta al docente.','error');}
