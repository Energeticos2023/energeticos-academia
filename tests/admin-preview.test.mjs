import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Invitación obligatoria antes del primer acceso',async()=>{
 const publicHtml=await readFile('src/public.html','utf8');
 const auth=await readFile('src/auth.mjs','utf8');
 assert.match(publicHtml,/primero debes recibir una invitación|cuentas invitadas/);
 assert.match(auth,/No se pudo iniciar sesión\. Debes haber recibido una invitación/);
});
test('El panel docente entra al aula como alumno, publica versiones y no activa matrículas',async()=>{
 const panel=await readFile('src/admin.mjs','utf8');
 const page=await readFile('src/public.html','utf8');
 const auth=await readFile('src/auth.mjs','utf8');
 for(const id of ['enter-classroom','package-list','student-list','registration-list'])assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(panel,/list_module_packages/);assert.match(panel,/publish_module_package/);assert.match(panel,/admin_course_overview/);
 assert.match(panel,/confirm\(/,'publicar exige confirmación');
 assert.doesNotMatch(panel,/course_enrollments.*upsert|payment_confirmed.*true/);
 assert.match(auth,/get_current_module/);assert.doesNotMatch(auth,/m1-pedagogico-v2-2-test/);
});
test('El aula solo admite enlaces HTTPS y abre las fuentes externas en otra pestaña',async()=>{
 const {safeExternalUrl}=await import('../src/access.mjs');
 assert.equal(safeExternalUrl('https://www.gob.pe/x'),'https://www.gob.pe/x');
 for(const bad of ['javascript:alert(1)','http://example.com','data:text/html,x','https://user:pass@example.com','/relativa'])assert.equal(safeExternalUrl(bad),null);
});
