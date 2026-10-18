import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const privateDir=path.join(root,'private-assessments');
const bank=JSON.parse(await readFile(path.join(privateDir,'bank.json'),'utf8'));
const coursePath=path.join(root,'private-course/flotas-electricas-peru/module-1/course-data.json');
const course=JSON.parse(await readFile(coursePath,'utf8'));
// La práctica inicial se sustituye por las autoevaluaciones de cada capítulo.
course.questions=[];
const catalog=[],questions=[];
let selfCount=0;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function validate(q){
 if(!q.stem||!Array.isArray(q.options)||q.options.length!==4||!Number.isInteger(q.correct)||q.correct<0||q.correct>3||!q.explanation)throw new Error('Pregunta incompleta o sin clave válida.');
}
function addFinal(id,lessonId,title,items){
 catalog.push({id,course_id:'flotas-electricas-peru',lesson_id:lessonId,title,pass_score:70,max_attempts:null,active:true});
 items.forEach((q,i)=>{validate(q);questions.push({assessment_id:id,id:`q${String(i+1).padStart(2,'0')}`,ordinal:i+1,stem:q.stem,options:q.options,correct_index:q.correct,explanation:q.explanation});});
}
for(const unit of bank.units){
 if(unit.self.length!==3||unit.final.length!==5)throw new Error('Cada unidad debe tener tres preguntas formativas y cinco de cierre.');
 unit.self.forEach(validate);selfCount+=unit.self.length;
 const lesson=course.lessons.find(l=>l.id===unit.lessonId);if(!lesson)throw new Error('No se encontró la unidad '+unit.lessonId);
 const id='m1-'+unit.lessonId.replace('unidad-','u')+'-final-v'+bank.version;
 lesson.selfAssessment=unit.self;
 lesson.finalAssessmentId=id;
 addFinal(id,lesson.id,'Evaluación de cierre · '+unit.label,unit.final);
}
if(bank.moduleFinal.length!==10)throw new Error('La evaluación final del módulo debe contener diez preguntas.');
const finalId='m1-final-v'+bank.version;
const moduleFinal={id:'evaluacion-final',title:'Evaluación final del Módulo 1',label:'Integración del aprendizaje',finalAssessmentId:finalId,html:'<h2>Integra los conceptos del módulo</h2><p>Resuelve diez preguntas sobre tecnologías, batería, autonomía y selección profesional. La evaluación se califica en el servidor y el resultado se conserva en tu cuenta.</p><aside class="callout">La nota corresponde a esta evaluación. No sustituye la rúbrica del caso de Áncash ni el cálculo ponderado de la calificación del módulo. La referencia inicial de aprobación es 70/100 y puede ajustarse por el docente.</aside>'};
const current=course.lessons.findIndex(l=>l.id===moduleFinal.id);if(current>=0)course.lessons[current]=moduleFinal;else course.lessons.splice(course.lessons.findIndex(l=>l.id==='cierre'),0,moduleFinal);
addFinal(finalId,moduleFinal.id,'Evaluación final del Módulo 1',bank.moduleFinal);
await writeFile(coursePath,JSON.stringify(course));
const literal=(value,tag)=>{const s=JSON.stringify(value);if(s.includes('$'+tag+'$'))throw new Error('Delimitador inesperado en el banco.');return '$'+tag+'$'+s+'$'+tag+'$::jsonb';};
const seed=`-- Banco privado v${bank.version}. NO subir a GitHub ni al depósito de materiales.\nbegin;\ninsert into public.assessment_catalog(id,course_id,lesson_id,title,pass_score,max_attempts,active)\nselect id,course_id,lesson_id,title,pass_score,max_attempts,active from jsonb_to_recordset(${literal(catalog,'catalog')})\nas x(id text,course_id text,lesson_id text,title text,pass_score numeric,max_attempts integer,active boolean)\non conflict(id) do update set title=excluded.title,pass_score=excluded.pass_score,max_attempts=excluded.max_attempts,active=excluded.active;\ninsert into academy_private.assessment_questions(assessment_id,id,ordinal,stem,options,correct_index,explanation)\nselect assessment_id,id,ordinal,stem,options,correct_index,explanation from jsonb_to_recordset(${literal(questions,'questions')})\nas q(assessment_id text,id text,ordinal integer,stem text,options jsonb,correct_index integer,explanation text)\non conflict(assessment_id,id) do update set ordinal=excluded.ordinal,stem=excluded.stem,options=excluded.options,correct_index=excluded.correct_index,explanation=excluded.explanation;\ncommit;\n`;
await mkdir(privateDir,{recursive:true});await writeFile(path.join(privateDir,'seed.sql'),seed);
const report=items=>items.map((q,i)=>`<article><h3>${i+1}. ${escape(q.stem)}</h3><ol type="A">${q.options.map((o,j)=>`<li${j===q.correct?' class="correct"':''}>${escape(o)}${j===q.correct?' ✓':''}</li>`).join('')}</ol><p>${escape(q.explanation)}</p></article>`).join('');
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><title>Banco de evaluaciones · Módulo 1 · Uso del docente</title><style>body{font:16px/1.6 system-ui;max-width:950px;margin:40px auto;padding:20px;color:#19354c}h1,h2{line-height:1.3}h2{margin-top:50px}h3{font-size:16px}article{border-bottom:1px solid #ddd;padding:18px 0}.correct{color:#17755e;font-weight:bold}p{color:#607787}header{background:#edf5f5;padding:25px;border-radius:12px}</style><header><h1>Banco de evaluaciones del Módulo 1</h1><p>Gestión de Flotas Eléctricas y Operaciones de Electromovilidad – Perú<br>Autor del curso: José Rafael Zeña Peche · CIP 85540</p><p>Uso del docente. ${selfCount} preguntas formativas y ${questions.length} preguntas de evaluación. Elaboradas a partir del manual aportado por el autor. Las claves de las evaluaciones se mantienen fuera del repositorio público.</p></header>${bank.units.map(u=>`<h2>${escape(u.label)} · ${escape(u.title)}</h2><h3>Autoevaluación</h3>${report(u.self)}<h3>Evaluación de cierre</h3>${report(u.final)}`).join('')}<h2>Evaluación integradora del Módulo 1</h2>${report(bank.moduleFinal)}</html>`;
await writeFile(path.join(privateDir,'Banco_Evaluaciones_Modulo_1.html'),html);
console.log(`Preparadas ${selfCount} preguntas formativas y ${questions.length} preguntas calificables en ${catalog.length} evaluaciones. Las claves de evaluación permanecen fuera de Git y del almacenamiento del alumno.`);
