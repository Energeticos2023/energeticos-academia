import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {evaluateSelf} from '../src/assessments.mjs';
const sample=[
 {stem:'Pregunta de prueba 1',options:['A','B','C','D'],correct:1,explanation:'Explicación uno'},
 {stem:'Pregunta de prueba 2',options:['A','B','C','D'],correct:3,explanation:'Explicación dos'},
 {stem:'Pregunta de prueba 3',options:['A','B','C','D'],correct:0,explanation:'Explicación tres'}
];
test('La autoevaluación muestra qué repasar y conserva la explicación correspondiente',()=>{
 const r=evaluateSelf(sample,[1,0,0]);assert.equal(r.correct,2);assert.equal(r.total,3);assert.equal(r.score,67);
 assert.deepEqual(r.feedback.map(f=>f.correct),[true,false,true]);assert.equal(r.feedback[1].explanation,'Explicación dos');
 assert.equal(evaluateSelf(sample,[1,3,0]).score,100);
});
test('No se presenta una nota formativa con preguntas incompletas u opciones manipuladas',()=>{
 for(const answers of [[1,3],[1,3,NaN],[1,3,4],[1,3,-1],[1,3,0.5]])assert.throws(()=>evaluateSelf(sample,answers));
});
let privateBank=false;try{await access('private-assessments/bank.json');privateBank=true;}catch{}
test('Los cinco capítulos y la evaluación final tienen su banco completo sin claves de examen en la web',{skip:!privateBank},async()=>{
 const bank=JSON.parse(await readFile('private-assessments/bank.json','utf8'));
 const course=JSON.parse(await readFile('private-course/flotas-electricas-peru/module-1/course-data.json','utf8'));
 assert.equal(bank.units.length,5);assert.equal(bank.moduleFinal.length,10);
 const publicCode=(await readFile('web/app.js','utf8'))+(await readFile('web/auth.bundle.js','utf8'))+(await readFile('web/index.html','utf8'));
 const studentData=JSON.stringify(course);
 for(const unit of bank.units){
  assert.equal(unit.self.length,3);assert.equal(unit.final.length,5);
  const lesson=course.lessons.find(l=>l.id===unit.lessonId);assert.ok(lesson?.selfAssessment?.length===3);assert.ok(lesson.finalAssessmentId);
  for(const q of unit.final){assert.ok(!publicCode.includes(q.stem));assert.ok(!studentData.includes(q.stem),'Una pregunta de examen no debe incluirse en el paquete descargable de lecciones');}
 }
 const final=course.lessons.find(l=>l.id==='evaluacion-final');assert.ok(final?.finalAssessmentId);
 for(const q of bank.moduleFinal){assert.ok(!publicCode.includes(q.stem));assert.ok(!studentData.includes(q.stem));}
});
