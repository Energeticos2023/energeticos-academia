import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('Invitación obligatoria antes del primer acceso',async()=>{
 const publicHtml=await readFile('src/public.html','utf8');
 const auth=await readFile('src/auth.mjs','utf8');
 assert.match(publicHtml,/primero debes recibir una invitación|cuentas invitadas/);
 assert.match(auth,/No se pudo iniciar sesión\. Debes haber recibido una invitación/);
});
test('La vista previa docente es solo lectura y requiere permiso',async()=>{
 const panel=await readFile('src/admin.mjs','utf8');
 const page=await readFile('src/public.html','utf8');
 assert.match(page,/id="admin-course-preview"/);
 assert.match(panel,/is_academy_admin/);
 assert.match(panel,/get_module_package/);
 assert.match(panel,/m1-pedagogico-v2-2-test/);
 assert.doesNotMatch(panel,/course_enrollments.*upsert|payment_confirmed.*true/);
});