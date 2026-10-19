const labels={pending:'Pendiente',contacted:'Contactado',closed:'Cerrado'};
export function createAdminPanel(client) {
 const panel=document.querySelector('#admin-view');
 const previewLoad=panel.querySelector('#preview-load');
 const previewSelect=panel.querySelector('#preview-lesson');
 const previewControls=panel.querySelector('#preview-controls');
 const previewBody=panel.querySelector('#preview-body');
 const previewStatus=panel.querySelector('#preview-status');
 let previewLessons=[];
 function showPreviewLesson(){
   const lesson=previewLessons.find(l=>l.id===previewSelect.value);
   if(!lesson)return;
   previewBody.replaceChildren();
   const title=document.createElement('h3');title.textContent=lesson.title;
   const description=document.createElement('p');description.textContent='Vista docente sin calificaciones ni progreso.';
   const rendered=document.createElement('div');rendered.className='admin-preview-content';
   // Material del paquete controlado por administración; sanitizar toda etiqueta y atributo no seguro.
   const raw=new DOMParser().parseFromString(String(lesson.html||''),'text/html');
   const safeTags=new Set(['H2','H3','P','STRONG','EM','BR','UL','OL','LI','ASIDE']);
   for(const element of [...raw.body.querySelectorAll('*')]){
     if(!safeTags.has(element.tagName)){element.replaceWith(document.createTextNode(element.textContent||''));continue;}
     for(const attr of [...element.attributes])element.removeAttribute(attr.name);
   }
   rendered.innerHTML=raw.body.innerHTML;
   previewBody.append(title,description,rendered);
 }
 previewSelect?.addEventListener('change',showPreviewLesson);
 previewLoad?.addEventListener('click',async()=>{
   if(!client){previewStatus.textContent='Sin conexión al campus.';return;}
   previewLoad.disabled=true;previewStatus.textContent='Verificando el permiso administrativo…';
   try{
     const {data:allowed,error:permission}=await client.rpc('is_academy_admin');
     if(permission||!allowed)throw new Error('Solo el administrador autorizado puede abrir la vista previa.');
     const {data,error}=await client.rpc('get_module_package',{requested_package:'m1-pedagogico-v2-2-test'});
     if(error||!Array.isArray(data?.lessons))throw new Error('No se pudo leer el paquete del módulo.');
     previewLessons=data.lessons;
     previewSelect.replaceChildren();
     for(const lesson of previewLessons){const o=document.createElement('option');o.value=lesson.id;o.textContent=lesson.title;previewSelect.add(o);}
     previewSelect.disabled=false;previewControls.hidden=false;showPreviewLesson();
     previewStatus.textContent=previewLessons.length+' actividades privadas cargadas. Modo docente de solo lectura.';
   }catch(e){previewStatus.textContent=e.message||'Vista previa no disponible.';}
   finally{previewLoad.disabled=false;}
 });

 const status=panel.querySelector('[role="status"]');
 const list=panel.querySelector('#registration-list');
 let page=0,rows=[],loading=false;
 const size=30;
 const date=value=>new Intl.DateTimeFormat('es-PE',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(value));
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
 panel.querySelector('#admin-logout').addEventListener('click',async()=>{try{await client.auth.signOut();}finally{location.replace(new URL('.',location.href).href);}});
 return {async open(email){document.querySelector('#public-view').hidden=true;document.querySelector('#classroom').hidden=true;panel.hidden=false;panel.querySelector('#admin-email').textContent=email;await load();},clear(){rows=[];list.replaceChildren();panel.hidden=true;}};
}
