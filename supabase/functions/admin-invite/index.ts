// Invitación de alumnos por correo. Solo para el administrador verificado de ENERGÉTICOS Academia.
// La clave de servicio vive únicamente en el servidor; el navegador envía la sesión del administrador.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SITE = 'https://energeticos2023.github.io/energeticos-academia/';
const cors = {
  'Access-Control-Allow-Origin': 'https://energeticos2023.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? '';
  const caller = createClient(url, publicKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminError } = await caller.rpc('is_academy_admin');
  if (adminError || isAdmin !== true) return json({ error: 'Solo el administrador puede invitar alumnos.' }, 403);
  let email = '';
  try { email = String((await req.json()).email ?? '').trim().toLowerCase(); } catch { /* cuerpo inválido */ }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Correo no válido.' }, 400);
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: SITE });
  if (error) {
    const message = /already|registered|exists/i.test(error.message)
      ? 'Esa cuenta ya existe: actívala directamente o pídele al alumno usar «Recuperar contraseña».'
      : /not authorized|smtp|sending/i.test(error.message)
        ? 'Supabase no pudo enviar el correo. Configura un servidor SMTP propio en Authentication → Emails; sin él solo se envía a miembros del equipo del proyecto.'
        : 'No se pudo enviar la invitación: ' + error.message;
    return json({ error: message, existing: /already|registered|exists/i.test(error.message) }, 400);
  }
  return json({ invited: data.user?.email ?? email });
});
