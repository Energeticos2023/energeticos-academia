// Paquete local para el SQL Editor del propietario. Contiene claves de examen:
// artifacts/ permanece ignorado por Git y no debe desplegarse como sitio.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const files=['supabase/setup.sql','supabase/assessments.sql','supabase/registration.sql','private-assessments/seed.sql'];
const parts=[];
for(const file of files){const sql=await readFile(file,'utf8');parts.push('-- '+file+'\n'+sql.replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,''));}
await writeFile('artifacts/Instalar_Academia.sql','-- Configuración de ENERGÉTICOS Academia. Ejecutar como propietario.\nbegin;\n'+parts.join('\n')+'\ncommit;\n');
console.log('Paquete local de instalación preparado. No contiene contraseñas ni claves API.');
