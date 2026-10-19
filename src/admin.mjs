const labels={pending:'Pendiente',contacted:'Contactado',closed:'Cerrado'};
const stateLabels={testing:'En revisión (solo docente)',approved:'Publicada para alumnos',archived:'Archivada'};
const date=value=>value?new Intl.DateTimeFormat('es-PE',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(value)):'—';
const cell=(text)=>{const td=document.createElement('td');td.textContent=text;return td;};
function table(headers){
 const wrap=document.createElement('div');wrap.className='table-scroll';
 const t=document.createElement('table');const head=document.createElement('thead');const row=document.createElement('tr');
 for(const h of headers){const th=document.createElement('th');th.scope='col';th.textContent=h;row.append(th);}
 head.append(row);const body=document.createElement('tbody');t.append(head,body);wrap.append(t);
 return {wrap,body};
}

export function createAdminPanel(client,options={}) {
 const panel=document.querySelector('#admin-view');
 const courseId=options.courseId||'flotas-electricas-peru';

 // Acceso del docente al aula como alumno
 panel.querySelector('#enter-classroom')?.addEventListener('click',()=>options.enterClassroom?.());

 // Versiones del contenido
 const packageList=panel.querySelector('#package-list');
 const packageStatus=panel.querySelector('#package-status');
 async function loadPackages(){
  if(!packageList)return;
  try{
   const {data,error}=await client.rpc('list_module_packages');if(error)throw error;
   packageList.replaceChildren();
   const visible=(data||[]).filter(p=>p.publication_state!=='archived');
   const archived=(data||[]).length-visible.length;
   if(!visible.length){packageList.textContent='No hay versiones cargadas.';return;}
   const {wrap,body}=table(['Versión','Estado','Actividades','Actualizada','Acciones']);
   for(const pkg of visible){
    const tr=document.createElement('tr');
    tr.append(cell(`${pkg.version_label} · ${pkg.package_id}`),cell(stateLabels[pkg.publication_state]||pkg.publication_state),cell(String(pkg.lessons)),cell(date(pkg.updated_at)));
    const actions=document.createElement('td');
    if(pkg.publication_state==='testing'){
     const view=document.createElement('button');view.type='button';view.className='button secondary';view.textContent='Revisar como alumno';
     view.addEventListener('click',()=>options.enterClassroom?.());
     const publish=document.createElement('button');publish.type='button';publish.className='button primary';publish.textContent='Publicar para los alumnos';
     publish.addEventListener('click',async()=>{
      const ok=confirm(`¿Publicar la versión ${pkg.version_label}? Todos los alumnos con matrícula activa verán este contenido de inmediato y la versión publicada anterior quedará archivada.`);
      if(!ok)return;
      publish.disabled=true;packageStatus.textContent='Publicando…';
      try{const {error}=await client.rpc('publish_module_package',{requested_package:pkg.package_id});if(error)throw error;packageStatus.textContent=`Versión ${pkg.version_label} publicada. Los alumnos la verán al ingresar.`;await loadPackages();}
      catch(e){packageStatus.textContent='No se pudo publicar: '+(e.message||'revisa tu sesión.');publish.disabled=false;}
     });
     actions.append(view,publish);
    }else actions.textContent='—';
    tr.append(actions);body.append(tr);
   }
   packageList.append(wrap);
   if(archived){const p=document.createElement('p');p.className='admin-note';p.textContent=`${archived} versión(es) anterior(es) archivada(s).`;packageList.append(p);}
  }catch{packageList.textContent='No se pudieron cargar las versiones.';}
 }

 // Seguimiento de alumnos
 const studentList=panel.querySelector('#student-list');
 const studentsStatus=panel.querySelector('#students-status');
 async function loadStudents(){
  if(!studentList)return;
  studentsStatus.textContent='Cargando seguimiento…';
  try{
   const {data,error}=await client.rpc('admin_course_overview',{requested_course:courseId});if(error)throw error;
   studentList.replaceChildren();
   const students=(data||[]).filter(s=>s.access_kind==='student');
   const {wrap,body}=table(['Correo','Tipo','Estado','Vigencia','Actividades completadas','Mejor nota del examen','Intentos','Último ingreso','Acción']);
   for(const s of data||[]){
    const best=s.best_scores&&s.best_scores['m1-evaluacion-v2-1'];
    const tr=document.createElement('tr');
    tr.append(cell(s.email),cell(s.access_kind==='staff'?'Docente (pruebas)':'Alumno'),
     cell(s.status==='active'&&s.payment_confirmed?'Activa':'Suspendida'),cell(s.valid_until?date(s.valid_until):'Sin vencimiento'),
     cell(String(s.completed)),cell(best==null?'—':`${Number(best)}/100`),cell(String(s.attempts)),cell(date(s.last_sign_in_at)));
    const actions=document.createElement('td');
    if(s.access_kind==='student'){
     const activeNow=s.status==='active'&&s.payment_confirmed;
     const toggle=document.createElement('button');toggle.type='button';toggle.className='button secondary';toggle.textContent=activeNow?'Suspender':'Reactivar';
     toggle.addEventListener('click',async()=>{
      let note='';
      if(!activeNow){note=prompt('Referencia del pago verificado para reactivar:')||'';if(note.trim().length<3)return;}
      else if(!confirm(`¿Suspender el acceso de ${s.email}? Su progreso y notas se conservan.`))return;
      toggle.disabled=true;
      try{await setEnrollment(s.email,activeNow?'suspended':'active',s.valid_until&&Date.parse(s.valid_until)>Date.now()?s.valid_until:null,note);await loadStudents();}
      catch(e){studentsStatus.textContent=e.message;toggle.disabled=false;}
     });
     actions.append(toggle);
    }else actions.textContent='—';
    tr.append(actions);
    body.append(tr);
   }
   studentList.append(wrap);
   studentsStatus.textContent=students.length?`${students.length} alumno(s) matriculado(s).`:'Aún no hay alumnos matriculados. Tu cuenta docente aparece para que verifiques el registro de tus pruebas.';
  }catch{studentsStatus.textContent='No se pudo cargar el seguimiento.';}
 }
 panel.querySelector('#students-refresh')?.addEventListener('click',()=>loadStudents());

 // Matrícula: invitación por correo (función de servidor) y activación con referencia de pago
 const enrollForm=panel.querySelector('#enroll-form');
 const enrollStatus=panel.querySelector('#enroll-status');
 async function setEnrollment(email,status,until,payment){
  const {error}=await client.rpc('admin_set_enrollment',{p_email:email,p_status:status,p_valid_until:until,p_payment_note:payment});
  if(error)throw new Error(error.message);
 }
 enrollForm?.addEventListener('submit',async event=>{
  event.preventDefault();
  const action=event.submitter?.value||'invite';
  const email=enrollForm.elements.email.value.trim().toLowerCase();
  const payment=enrollForm.elements.payment.value.trim();
  const until=enrollForm.elements.until.value?new Date(enrollForm.elements.until.value+'T23:59:59-05:00').toISOString():null;
  if(payment.length<3){enrollStatus.textContent='Indica la referencia del pago verificado antes de activar.';return;}
  if(!confirm(`¿Confirmas que verificaste el pago de ${email} y deseas ${action==='invite'?'enviarle la invitación y activar':'activar'} su matrícula?`))return;
  enrollForm.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   if(action==='invite'){
    enrollStatus.textContent='Enviando invitación…';
    const {data,error}=await client.functions.invoke('admin-invite',{body:{email}});
    if(error){
     let detail='';try{detail=(await error.context?.json())?.error||'';}catch{}
     if(!/ya existe/.test(detail))throw new Error(detail||'No se pudo enviar la invitación.');
    }
   }
   enrollStatus.textContent='Activando matrícula…';
   await setEnrollment(email,'active',until,payment);
   enrollStatus.textContent=action==='invite'?`Invitación enviada y matrícula activa para ${email}. El alumno debe abrir el correo y crear su contraseña.`:`Matrícula activa para ${email}.`;
   enrollForm.reset();await loadStudents();
  }catch(e){enrollStatus.textContent=e.message;}
  finally{enrollForm.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });

 // Solicitudes de inscripción
 const status=panel.querySelector('#requests-status')||panel.querySelector('[role="status"]');
 const list=panel.querySelector('#registration-list');
 let page=0,rows=[],loading=false;
 const size=30;
 function render(){
  list.replaceChildren();
  if(!rows.length){const p=document.createElement('p');p.textContent='No hay solicitudes con este filtro.';list.append(p);return;}
  for(const row of rows){
   const card=document.createElement('article');card.className='request-card';
   const title=document.createElement('h3');title.textContent=row.full_name;
   const email=document.createElement('a');email.href='mailto:'+encodeURIComponent(row.email);email.textContent=row.email;
   const org=document.createElement('p');org.textContent=row.organization||'Sin empresa o institución';
   const when=document.createElement('small');when.textContent='Solicitud: '+date(row.created_at)+' · Hora de Perú';
   const label=document.createElement('label');label.textContent='Estado de seguimiento';
   const select=document.createElement('select');select.setAttribute('aria-label','Estado de '+row.full_name);
   for(const [value,text]of Object.entries(labels)){select.add(new Option(text,value));} select.value=row.status;
   const save=document.createElement('button');save.type='button';save.className='button secondary';save.textContent='Guardar estado';
   save.addEventListener('click',async()=>{
    save.disabled=true;status.textContent='Guardando estado…';
    try{const {error}=await client.rpc('set_registration_status',{p_id:row.id,p_status:select.value});if(error)throw error;await load();status.textContent='Estado guardado. Este cambio no confirma pagos ni activa matrículas.';}
    catch{status.textContent='No se pudo guardar. Comprueba tu sesión e intenta nuevamente.';}
    finally{save.disabled=false;}
   });
   label.append(select);card.append(title,email,org,when,label,save);list.append(card);
  }
 }
 async function load(){
  if(loading)return;loading=true;status.textContent='Cargando solicitudes…';
  panel.querySelectorAll('.admin-toolbar button').forEach(b=>b.disabled=true);
  try{
   const {data:allowed,error:permission}=await client.rpc('is_academy_admin');if(permission||!allowed)throw new Error();
   let query=client.from('registration_requests').select('id,full_name,email,organization,status,created_at',{count:'exact'}).order('created_at',{ascending:false}).order('id').range(page*size,(page+1)*size-1);
   const filter=panel.querySelector('#registration-filter').value;
   if(filter)query=query.eq('status',filter);
   const {data,error,count}=await query;if(error)throw error;
   rows=data;render();panel.querySelector('#request-count').textContent=`${count} solicitudes · Página ${page+1}`;
   panel.querySelector('#admin-prev').disabled=page===0;panel.querySelector('#admin-next').disabled=(page+1)*size>=count;
   status.textContent='Solicitudes actualizadas. Una solicitud no equivale a una matrícula pagada.';
  }catch{rows=[];list.replaceChildren();status.textContent='No se pudieron cargar las solicitudes. Revisa que tu cuenta tenga permiso de administrador.';}
  finally{loading=false;panel.querySelector('#admin-refresh').disabled=false;}
 }
 panel.querySelector('#admin-refresh').addEventListener('click',()=>load());
 panel.querySelector('#registration-filter').addEventListener('change',()=>{page=0;load();});
 panel.querySelector('#admin-prev').addEventListener('click',()=>{if(page>0){page--;load();}});
 panel.querySelector('#admin-next').addEventListener('click',()=>{page++;load();});
 panel.querySelector('#admin-logout').addEventListener('click',async()=>{try{sessionStorage.removeItem('energeticos-academia-mode');}catch{}try{await client.auth.signOut();}finally{location.replace(new URL('.',location.href).href);}});
 return {
  async open(email){
   document.querySelector('#public-view').hidden=true;document.querySelector('#classroom').hidden=true;panel.hidden=false;
   panel.querySelector('#admin-email').textContent=email;
   await Promise.all([load(),loadPackages(),loadStudents()]);
  },
  clear(){rows=[];list.replaceChildren();panel.hidden=true;}
 };
}
