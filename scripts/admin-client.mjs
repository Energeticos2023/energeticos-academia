import {createClient} from '@supabase/supabase-js';
import {createInterface} from 'node:readline/promises';
export const COURSE_ID='flotas-electricas-peru';
export async function ask(question) {
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{return (await rl.question(question)).trim();}finally{rl.close();}
}
async function secret(question) {
 if(!process.stdin.isTTY)throw new Error('Usa una terminal interactiva o configura la clave privada en la variable de entorno del proceso.');
 process.stdout.write(question);process.stdin.setRawMode(true);process.stdin.resume();
 return await new Promise((resolve,reject)=>{
  let value='';const done=()=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
  const read=buf=>{for(const char of buf.toString('utf8')){
   if(char==='\r'||char==='\n'){done();resolve(value);return;}
   if(char==='\u0003'){done();reject(new Error('Operación cancelada.'));return;}
   if(char==='\u007f'||char==='\b'){value=value.slice(0,-1);continue;}
   if(char>=' ')value+=char;
  }};process.stdin.on('data',read);
 });
}
export async function adminClient() {
 const url=process.env.SUPABASE_URL||await ask('URL del proyecto Supabase: ');
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/')throw new Error('URL no válida.');
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY||await secret('Clave privada del proyecto (no se mostrará): ');
 if(!key)throw new Error('Falta la clave privada.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
