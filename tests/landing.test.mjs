import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile('web/index.html','utf8');
const source=await readFile('src/public.html','utf8');
test('La portada publicada se compila desde el fuente y declara los seis módulos',()=>{
 assert.ok(html.includes(source),'La portada en web/index.html debe coincidir con src/public.html');
 for(let n=1;n<=6;n++)assert.match(html,new RegExp('MÓDULO '+String(n).padStart(2,'0')));
 assert.equal((source.match(/class="premium-chapters"/g)||[]).length,6);
 assert.equal((source.match(/<li><span>0[1-6]\\.[1-7]<\\/span>/g)||[]).length,42);
});
test('WhatsApp es el canal público y no existe matrícula automática',()=>{
 assert.ok(source.includes('wa.me/51942899919'));
 assert.ok(!source.includes('id="enrollment-form"'));
 assert.ok(source.includes('MATRÍCULAS CERRADAS'));
 assert.ok(!source.includes('certificados avalados por'));
});
test('La web incluye información clara de exámenes, accesibilidad y certificación',()=>{
 for(const x of ['id="evaluaciones"','id="biblioteca"','id="certificacion"','id="preguntas"','Colegio de Ingenieros del Perú','CARELEC','examen final'])assert.ok(source.toLowerCase().includes(x.toLowerCase()),'Falta '+x);
});
