const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function evaluateSelf(questions,answers){
 if(!Array.isArray(questions)||!questions.length||answers.length!==questions.length)throw new Error('Responde todas las preguntas.');
 const feedback=questions.map((q,i)=>{
  if(!Number.isInteger(answers[i])||answers[i]<0||answers[i]>=q.options.length)throw new Error('Selecciona una respuesta válida en cada pregunta.');
  return {correct:answers[i]===q.correct,explanation:q.explanation};
 });
 const correct=feedback.filter(f=>f.correct).length;
 return {correct,total:questions.length,score:Math.round(correct*100/questions.length),feedback};
}
function questionFields(questions,prefix){return questions.map((q,i)=>`<fieldset class="assessment-question"><legend>${i+1}. ${escape(q.stem)}</legend>${q.options.map((option,j)=>`<label><input type="radio" name="${prefix}-${i}" value="${j}" required> <span>${escape(option)}</span></label>`).join('')}<p class="self-feedback" id="${prefix}-feedback-${i}" hidden></p></fieldset>`).join('');}
function readAnswers(form,questions,prefix){const data=new FormData(form);return questions.map((q,i)=>{const v=data.get(prefix+'-'+i);return v===null?NaN:Number(v);});}

export function createAssessmentMount(client,course,getUserId){
 return function mount(){
  const id=location.hash.split('/')[1];const lesson=course.lessons.find(l=>l.id===id);
  const main=document.querySelector('#main');if(!lesson||!main||main.querySelector('[data-assessment-mount]'))return;
  if(!lesson.selfAssessment&&!lesson.finalAssessmentId)return;
  const host=document.createElement('div');host.dataset.assessmentMount='true';
  const before=main.querySelector('.lesson-actions');if(before)before.before(host);else main.append(host);
  if(lesson.selfAssessment){
   const section=document.createElement('section');section.className='assessment-panel';
   section.innerHTML=`<span class="eyebrow">COMPRUEBA LO APRENDIDO</span><h2>Autoevaluación del capítulo</h2><p>Practica con tres preguntas y revisa sus explicaciones. Puedes repetirla para reforzar los conceptos; no asigna una nota oficial.</p><form class="self-assessment-form">${questionFields(lesson.selfAssessment,'self')}<div class="lesson-actions"><button class="button primary" type="submit">Revisar mi autoevaluación →</button><button class="button secondary" type="reset">Volver a practicar</button></div><p class="assessment-result" role="status" hidden></p></form>`;
   host.append(section);const form=section.querySelector('form');
   form.addEventListener('submit',event=>{
    event.preventDefault();if(!form.reportValidity())return;
    try{
     const answers=readAnswers(form,lesson.selfAssessment,'self');const result=evaluateSelf(lesson.selfAssessment,answers);
     result.feedback.forEach((f,i)=>{const p=section.querySelector('#self-feedback-'+i);p.hidden=false;p.className='self-feedback '+(f.correct?'correct':'incorrect');p.textContent=(f.correct?'✓ Correcto. ':'Revisa el concepto. ')+f.explanation;});
     const output=section.querySelector('.assessment-result');output.hidden=false;output.textContent=`Resultado formativo: ${result.correct}/${result.total} (${result.score} %).`;
     window.ACADEMY.onSelfResult?.(id,{answers,score:result.score,completedAt:new Date().toISOString()});
    }catch(error){const output=section.querySelector('.assessment-result');output.hidden=false;output.textContent=error.message;}
   });
   form.addEventListener('reset',()=>{section.querySelectorAll('.self-feedback,.assessment-result').forEach(el=>el.hidden=true);});
   const saved=window.ACADEMY.getSelfResult?.(id);
   if(saved&&Array.isArray(saved.answers)&&saved.answers.length===lesson.selfAssessment.length&&saved.answers.every(a=>Number.isInteger(a)&&a>=0&&a<4)){
    saved.answers.forEach((answer,i)=>{const input=form.querySelector(`input[name="self-${i}"][value="${answer}"]`);if(input)input.checked=true;});
    const output=section.querySelector('.assessment-result');output.hidden=false;output.textContent=`Última autoevaluación guardada: ${saved.score} %. Puedes volver a practicar.`;
   }
  }
  if(lesson.finalAssessmentId)mountGraded(client,host,lesson,getUserId);

 };
}

const pad=n=>String(n).padStart(2,'0');
function formatRemaining(ms){const t=Math.max(0,Math.floor(ms/1000));return `${pad(Math.floor(t/60))}:${pad(t%60)}`;}
function draftKey(sessionId){return 'energeticos-academia-exam:'+sessionId;}
function readDraft(sessionId){try{return JSON.parse(sessionStorage.getItem(draftKey(sessionId))||'{}')||{};}catch{return {};}}
function writeDraft(sessionId,draft){try{sessionStorage.setItem(draftKey(sessionId),JSON.stringify(draft));}catch{}}

// Evaluación calificada: modo «draw» (sorteo, tiempo límite e intentos controlados en
// servidor) o modo «fixed» (preguntas fijas). El cliente nunca recibe claves ni calcula notas.
function mountGraded(client,host,lesson,getUserId){
 const section=document.createElement('section');section.className='assessment-panel assessment-final';
 section.innerHTML=`<span class="eyebrow">EVALUACIÓN CALIFICADA · REGISTRO EN TU CUENTA</span><h2>${escape(lesson.title||'Evaluación del módulo')}</h2><div class="official-assessment-body"><p>Cargando la información de la evaluación…</p></div><p class="official-status" role="status" aria-live="polite"></p>`;
 host.append(section);
 const body=section.querySelector('.official-assessment-body');const output=section.querySelector('.official-status');
 let timer=null;
 const stop=()=>{if(timer){clearInterval(timer);timer=null;}};
 new MutationObserver(()=>{if(!section.isConnected)stop();}).observe(document.body,{childList:true,subtree:true});

 async function history(){
  const {data,error}=await client.from('assessment_attempts').select('score,passed,attempt_number,submitted_at').eq('user_id',getUserId()).eq('assessment_id',lesson.finalAssessmentId).order('attempt_number',{ascending:true});
  return error?[]:data;
 }
 async function refresh(message){
  stop();output.textContent=message||'';
  const {data,error}=await client.rpc('get_assessment',{requested_assessment:lesson.finalAssessmentId});
  if(error||!data){body.innerHTML='<p>No se pudo cargar la evaluación. Verifica tu matrícula o consulta al docente.</p>';return;}
  if(data.mode==='draw')return renderDraw(data,await history());
  return renderFixed(data,await history());
 }
 function summary(data,past){
  const used=data.attempts,max=data.max_attempts;
  const rows=past.map(r=>`<li>Intento ${r.attempt_number}: <strong>${escape(r.score)}/100</strong> · ${r.passed?'Aprobado':'No aprobado'}</li>`).join('');
  const best=data.best_score==null?'Sin nota registrada':`Mejor nota: ${escape(data.best_score)}/100 (se conserva la mayor)`;
  return `<div class="exam-summary"><p class="assessment-meta">${data.mode==='draw'?`${escape(data.draw_size)} preguntas sorteadas · ${escape(data.time_limit_minutes)} minutos · `:''}Nota mínima ${escape(data.pass_score)}/100 · Intentos usados: ${escape(used)}${max?` de ${escape(max)}`:''}</p><p><strong>${best}</strong></p>${rows?`<ul class="assessment-history">${rows}</ul>`:''}</div>`;
 }
 function renderDraw(data,past){
  const max=data.max_attempts;const left=max==null?Infinity:max-data.attempts;
  if(data.session)return renderSession(data,data.session);
  body.innerHTML=summary(data,past);
  if(past.length<data.attempts){const p=document.createElement('p');p.className='assessment-meta';p.textContent='Un intento sin envío venció por tiempo y cuenta como utilizado.';body.append(p);}
  if(left<=0){const p=document.createElement('p');p.textContent='Usaste todos los intentos disponibles. Consulta al docente si necesitas revisar tu situación.';body.append(p);return;}
  const start=document.createElement('button');start.type='button';start.className='button primary';
  start.textContent=`Comenzar intento ${data.attempts+1}${max?` de ${max}`:''} →`;
  start.addEventListener('click',async()=>{
   const ok=confirm(`Al comenzar se descuenta un intento y corren ${data.time_limit_minutes} minutos, aunque cierres la página. ¿Deseas comenzar ahora?`);
   if(!ok)return;
   start.disabled=true;output.textContent='Preparando tus preguntas…';
   const {data:started,error}=await client.rpc('start_assessment',{requested_assessment:lesson.finalAssessmentId});
   if(error||!started?.session){output.textContent=error?.message?.includes('intentos')?'Alcanzaste el número de intentos permitido.':'No se pudo iniciar la evaluación. Intenta nuevamente.';start.disabled=false;return;}
   output.textContent='';renderSession(started,started.session);
  });
  body.append(start);
 }
 function renderSession(data,session){
  const offset=Date.parse(data.server_time)-Date.now();
  const deadline=Date.parse(session.expires_at);
  const draft=readDraft(session.id);
  const requestKey=draft.requestKey||crypto.randomUUID();draft.requestKey=requestKey;writeDraft(session.id,draft);
  body.innerHTML=`<div class="exam-bar" role="timer" aria-live="off"><span>Intento ${escape(session.attempt_number)}${data.max_attempts?` de ${escape(data.max_attempts)}`:''}</span><strong class="exam-clock">--:--</strong><span class="exam-answered"></span></div>`;
  const form=document.createElement('form');form.className='exam-form';
  form.innerHTML=questionFields(session.questions,'exam')+'<button type="submit" class="button primary submit-official">Enviar evaluación para calificar →</button>';
  body.append(form);
  session.questions.forEach((q,i)=>{const saved=draft.answers?.[q.id];if(Number.isInteger(saved)){const input=form.querySelector(`input[name="exam-${i}"][value="${saved}"]`);if(input)input.checked=true;}});
  form.querySelectorAll('input[required]').forEach(input=>input.required=false);
  const answered=()=>session.questions.filter((q,i)=>form.querySelector(`input[name="exam-${i}"]:checked`)).length;
  const updateCount=()=>{section.querySelector('.exam-answered').textContent=`${answered()}/${session.questions.length} respondidas`;};
  form.addEventListener('change',()=>{
   draft.answers={};session.questions.forEach((q,i)=>{const c=form.querySelector(`input[name="exam-${i}"]:checked`);if(c)draft.answers[q.id]=Number(c.value);});
   writeDraft(session.id,draft);updateCount();
  });
  updateCount();
  let sending=false;
  async function send(auto){
   if(sending)return;sending=true;stop();
   const submit=form.querySelector('.submit-official');submit.disabled=true;
   output.textContent=auto?'Se terminó el tiempo. Enviando tus respuestas…':'Enviando respuestas…';
   const answers=session.questions.map((q,i)=>{const c=form.querySelector(`input[name="exam-${i}"]:checked`);return {id:q.id,choice:c?Number(c.value):null};});
   const {data:result,error}=await client.rpc('submit_assessment',{requested_assessment:lesson.finalAssessmentId,submitted_answers:answers,request_key:requestKey});
   if(error||!result?.attempt_id){
    sending=false;submit.disabled=false;
    output.textContent=error?.message?.includes('terminó')?'El tiempo del intento terminó sin envío; el intento cuenta como utilizado.':'No se pudo registrar el envío. Reintenta: el mismo envío no consume otro intento.';
    if(error?.message?.includes('terminó'))setTimeout(()=>refresh(output.textContent),1500);
    return;
   }
   try{sessionStorage.removeItem(draftKey(session.id));}catch{}
   window.ACADEMY?.onGradedResult?.(lesson.id,result);
   await refresh(`Nota registrada: ${result.score}/100 · ${result.correct_count}/${result.question_count} respuestas correctas · Intento ${result.attempt_number}. ${result.passed?'¡Aprobaste la evaluación!':'Repasa los capítulos antes de un nuevo intento.'}`);
  }
  form.addEventListener('submit',event=>{
   event.preventDefault();
   const missing=session.questions.length-answered();
   if(missing&&!confirm(`Tienes ${missing} pregunta(s) sin responder; se calificarán como incorrectas. ¿Enviar de todos modos?`))return;
   send(false);
  });
  const clock=section.querySelector('.exam-clock');
  const tick=()=>{const remaining=deadline-(Date.now()+offset);clock.textContent=formatRemaining(remaining);clock.classList.toggle('warning',remaining<5*60000);if(remaining<=0)send(true);};
  tick();timer=setInterval(tick,1000);
 }
 function renderFixed(data,past){
  body.innerHTML=summary(data,past);
  if(data.max_attempts!==null&&data.attempts>=data.max_attempts){const p=document.createElement('p');p.textContent='Alcanzaste el límite de intentos. Consulta al docente.';body.append(p);return;}
  const form=document.createElement('form');form.innerHTML=questionFields(data.questions,'final')+'<button type="submit" class="button primary submit-official">Enviar evaluación para calificar →</button>';
  body.append(form);
  const requestKey=crypto.randomUUID();
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(!form.reportValidity())return;
   const submit=form.querySelector('.submit-official');submit.disabled=true;output.textContent='Enviando respuestas…';
   const answers=readAnswers(form,data.questions,'final').map((choice,i)=>({id:data.questions[i].id,choice}));
   const {data:result,error}=await client.rpc('submit_assessment',{requested_assessment:lesson.finalAssessmentId,submitted_answers:answers,request_key:requestKey});
   if(error||!result?.attempt_id){output.textContent='No se pudo registrar el envío. Reintenta; el mismo envío no consume otro intento.';submit.disabled=false;return;}
   await refresh(`Nota registrada: ${result.score}/100 · Intento ${result.attempt_number}.`);
  });
 }
 refresh();
}
