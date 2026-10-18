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
  if(lesson.finalAssessmentId){
   const section=document.createElement('section');section.className='assessment-panel assessment-final';
   section.innerHTML=`<span class="eyebrow">EVALUACIÓN CON REGISTRO EN TU CUENTA</span><h2>${id==='evaluacion-final'?'Evaluación final del módulo':'Evaluación de cierre del capítulo'}</h2><p>Las respuestas se revisan en el servidor. La nota corresponde a esta evaluación y no sustituye la rúbrica ni la calificación ponderada del módulo.</p><button type="button" class="button primary load-assessment">Cargar evaluación →</button><div class="official-assessment-body"></div><p class="official-status" role="status"></p>`;
   host.append(section);const load=section.querySelector('.load-assessment');const output=section.querySelector('.official-status');
   load.addEventListener('click',async()=>{
    load.disabled=true;output.textContent='Cargando preguntas y verificando tu matrícula…';
    try{
     const {data,error}=await client.rpc('get_assessment',{requested_assessment:lesson.finalAssessmentId});
     if(error||!data?.questions)throw new Error('No se pudo cargar la evaluación. Verifica tu acceso o consulta al docente.');
     if(!section.isConnected)return;
     const body=section.querySelector('.official-assessment-body');
     const limit=data.max_attempts===null?'Sin límite configurado':`${data.attempts}/${data.max_attempts} intentos utilizados`;
     body.innerHTML=`<p class="assessment-meta">${data.questions.length} preguntas · Referencia de aprobación: ${escape(data.pass_score)}/100 · ${escape(limit)}</p>`;
     if(data.max_attempts!==null&&data.attempts>=data.max_attempts){output.textContent='Alcanzaste el límite de intentos. Consulta al docente.';load.hidden=true;return;}
     const form=document.createElement('form');form.innerHTML=questionFields(data.questions,'final')+'<button type="submit" class="button primary submit-official">Enviar evaluación para calificar →</button>';
     body.append(form);load.hidden=true;output.textContent='';
     const requestKey=crypto.randomUUID();
     form.addEventListener('submit',async event=>{
      event.preventDefault();if(!form.reportValidity())return;
      const submit=form.querySelector('.submit-official');submit.disabled=true;output.textContent='Enviando respuestas…';
      try{
       const answers=readAnswers(form,data.questions,'final').map((choice,i)=>({id:data.questions[i].id,choice}));
       const {data:result,error}=await client.rpc('submit_assessment',{requested_assessment:lesson.finalAssessmentId,submitted_answers:answers,request_key:requestKey});
       if(error||!result?.attempt_id)throw new Error('No se pudo registrar el envío. Reintenta; el mismo envío no consume otro intento. Si persiste, consulta al docente.');
       form.querySelectorAll('input,button').forEach(el=>el.disabled=true);
       output.className='official-status assessment-result';output.textContent=`Nota registrada: ${result.score}/100 · ${result.correct_count}/${result.question_count} respuestas correctas · Intento ${result.attempt_number}. ${result.passed?'Superaste la referencia de aprobación.':'Repasa el capítulo antes de un nuevo intento.'}`;
       if(data.max_attempts===null||result.attempt_number<data.max_attempts){const retry=document.createElement('button');retry.className='button secondary';retry.type='button';retry.textContent='Preparar un nuevo intento';retry.addEventListener('click',()=>{body.innerHTML='';output.textContent='';load.hidden=false;load.disabled=false;});body.append(retry);}
      }catch(error){output.textContent=error.message;submit.disabled=false;}
     });
     const history=await client.from('assessment_attempts').select('score,passed,attempt_number,submitted_at').eq('user_id',getUserId()).eq('assessment_id',lesson.finalAssessmentId).order('attempt_number',{ascending:false}).limit(3);
     if(!history.error&&history.data.length&&section.isConnected){const historyNode=document.createElement('p');historyNode.className='assessment-history';historyNode.textContent='Últimos resultados: '+history.data.map(r=>`intento ${r.attempt_number}: ${r.score}/100`).join(' · ');body.prepend(historyNode);}
    }catch(error){output.textContent=error.message;load.disabled=false;}
   });
  }
 };
}
