import { build } from 'esbuild';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateConfig } from '../src/access.mjs';
await mkdir('web', { recursive: true });
if(process.env.SUPABASE_URL || process.env.SUPABASE_PUBLISHABLE_KEY) {
 const config={supabaseUrl:process.env.SUPABASE_URL||'',supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||'',courseId:'flotas-electricas-peru',bucket:'course-private'};
 if(!validateConfig(config))throw new Error('Falta completar la configuración pública de Supabase.');
 const {writeFile}=await import('node:fs/promises');
 await writeFile('web/config.js','window.ACADEMY_CONFIG = Object.freeze('+JSON.stringify(config)+');\n');
}
await build({ entryPoints:['src/auth.mjs'], bundle:true, minify:true, format:'esm', target:['es2022'], outfile:'web/auth.bundle.js', legalComments:'eof' });
async function scan(dir) {
 for (const file of await readdir(dir,{withFileTypes:true})) {
  const name=path.join(dir,file.name);
  if (file.isDirectory()) await scan(name);
  else {
   if (/\.(docx|pptx|pdf|xlsx|zip|tar|gz)$/i.test(file.name) || file.name==='course-data.js' || file.name==='course-data.json') throw new Error('Archivo de curso privado dentro de web: '+name);
   if (/\.(html|js|css|json)$/i.test(file.name)) {
    const content=await readFile(name,'utf8');
    if (content.includes('sb_secret_') && file.name==='config.js') throw new Error('Clave privada en config.js');
    if (/"role"\s*:\s*"service_role"/.test(content)) throw new Error('Credencial privada dentro del sitio');
   }
  }
 }
}
await scan('web');
console.log('Interfaz compilada. No hay documentos ni datos privados del curso en web/.');
