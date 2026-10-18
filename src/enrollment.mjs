export function initEnrollment(client) {
 const form=document.querySelector('#enrollment-form');
 const message=document.querySelector('#enrollment-message');
 let busy=false;
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||!form.reportValidity())return;
  if(form.elements.website.value)return;
  if(!client){message.textContent='No se pudo conectar. Intenta más tarde o escribe a jose.zena.p@uni.pe.';return;}
  busy=true;form.querySelector('button').disabled=true;
  message.textContent='Guardando tu solicitud…';message.dataset.type='info';
  try{
   const {data,error}=await client.rpc('request_registration',{
    p_name:form.elements.name.value.trim(),p_email:form.elements.email.value.trim(),
    p_organization:form.elements.organization.value.trim(),p_consent:form.elements.consent.checked
   });
   if(error||data?.received!==true)throw new Error();
   message.textContent='Solicitud registrada. El docente podrá revisarla y contactarte al correo indicado para confirmar las condiciones de matrícula. Esto todavía no activa tu acceso al curso.';
   message.dataset.type='success';form.reset();
  }catch{
   message.textContent='No pudimos confirmar el registro. Intenta nuevamente; no se duplicará tu solicitud si usas el mismo correo. También puedes escribir a jose.zena.p@uni.pe.';
   message.dataset.type='error';
  }finally{busy=false;form.querySelector('button').disabled=false;}
 });
}
