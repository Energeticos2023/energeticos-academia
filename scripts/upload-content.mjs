import {adminClient, COURSE_ID} from './admin-client.mjs';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../private-course/',import.meta.url));
const types={'.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
try {
 const client=await adminClient();
 const {data:bucket,error}=await client.storage.getBucket('course-private');
 if(error||!bucket||bucket.public)throw new Error('El depósito course-private no existe o no es privado. Ejecuta setup.sql antes de subir materiales.');
 async function upload(dir){
  for(const file of await readdir(dir,{withFileTypes:true})){
   const full=path.join(dir,file.name);if(file.isDirectory()){await upload(full);continue;}
   const relative=path.relative(root,full).replaceAll('\\','/');
   if(!relative.startsWith(COURSE_ID+'/')||!types[path.extname(full)])throw new Error('Archivo inesperado en el paquete privado.');
   const {error}=await client.storage.from('course-private').upload(relative,await readFile(full),{upsert:true,contentType:types[path.extname(full)],cacheControl:'0'});
   if(error)throw new Error('No se pudo cargar '+file.name+'. Verifica permisos y límites del proyecto.');
   console.log('Cargado:',file.name);
  }
 }
 await upload(root);console.log('Materiales cargados en almacenamiento privado.');
}catch(error){console.error(error.message);process.exitCode=1;}
