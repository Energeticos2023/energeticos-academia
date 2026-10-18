import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,enrollmentIsActive,isPrivateMaterialPath} from '../src/access.mjs';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const config={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_example',bucket:'course-private',courseId:'flotas-electricas-peru'};
test('El sitio no abre el aula sin configuración y rechaza claves privilegiadas',()=>{
 assert.equal(validateConfig({...config,supabaseUrl:''}),false);
 assert.throws(()=>validateConfig({...config,supabasePublishableKey:'sb_secret_not_allowed'}));
 const token='header.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature';
 assert.throws(()=>validateConfig({...config,supabasePublishableKey:token}));
 assert.throws(()=>validateConfig({...config,supabaseUrl:'http://example.supabase.co'}));
 assert.equal(validateConfig(config),true);
});
test('Cuenta creada, pago pendiente, suspensión y vencimiento no habilitan acceso',()=>{
 const now=Date.parse('2026-10-18T00:00:00Z');const active={status:'active',payment_confirmed:true,valid_until:null};
 assert.equal(enrollmentIsActive(null,now),false);
 assert.equal(enrollmentIsActive({...active,payment_confirmed:false},now),false);
 assert.equal(enrollmentIsActive({...active,status:'suspended'},now),false);
 assert.equal(enrollmentIsActive({...active,valid_until:'2026-10-18T00:00:00Z'},now),false);
 assert.equal(enrollmentIsActive({...active,valid_until:'invalid'},now),false);
 assert.equal(enrollmentIsActive({...active,valid_until:'2026-10-19T00:00:00Z'},now),true);
 assert.equal(enrollmentIsActive(active,now),true);
});
test('Las rutas de descarga no admiten otro curso ni recorrido fuera del depósito',()=>{
 const course='flotas-electricas-peru';
 assert.equal(isPrivateMaterialPath(course+'/module-1/materiales/manual-modulo-1.docx',course),true);
 for(const file of ['otro-curso/manual.docx',course+'/../secreto',course+'/a\\b',course+'//archivo',course+'/archivo?public=true'])assert.equal(isPrivateMaterialPath(file,course),false);
});
test('El despliegue público no incluye lecciones, imágenes académicas ni documentos de pago',async()=>{
 async function scan(dir){for(const file of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,file.name);if(file.isDirectory())await scan(full);else {assert.ok(!/\.(docx|pptx|pdf|xlsx|zip|gz)$/i.test(file.name),full);assert.ok(!/^course-data\./.test(file.name),full);assert.ok(!/^image\d+\./.test(file.name),full);}}}
 await scan('web');
 const html=await readFile('web/index.html','utf8');assert.ok(html.includes('id="classroom" hidden'));assert.ok(!html.includes('src="course-data.js"'));
 const config=await readFile('web/config.js','utf8');assert.ok(!config.includes('sb_secret_'));
});
