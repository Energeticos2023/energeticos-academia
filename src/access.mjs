export function validateConfig(config) {
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) return false;
  const url = new URL(config.supabaseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('La URL del servicio debe ser HTTPS y no contener credenciales ni rutas.');
  const key = config.supabasePublishableKey;
  if (key.startsWith('sb_secret_')) throw new Error('Se detectó una clave privada en la configuración pública.');
  if (!key.startsWith('sb_publishable_')) {
    try {
      const payload = JSON.parse(globalThis.atob(key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
      if (payload.role !== 'anon') throw new Error('invalid');
    } catch { throw new Error('Utiliza únicamente la clave pública publishable o anon.'); }
  }
  if (config.bucket !== 'course-private' || config.courseId !== 'flotas-electricas-peru') throw new Error('Configuración de curso no válida.');
  return true;
}

// Estas comprobaciones son de UX. La autorización definitiva vive en las políticas RLS.
export function enrollmentIsActive(enrollment, now = Date.now()) {
  return enrollment?.status === 'active' && enrollment.payment_confirmed === true &&
    (enrollment.valid_until === null || (typeof enrollment.valid_until === 'string' && Date.parse(enrollment.valid_until) > now));
}

export function isPrivateMaterialPath(path, courseId) {
  return typeof path === 'string' && path.startsWith(courseId + '/') &&
    !path.includes('..') && !path.includes('\\') && !path.includes('//') && !/[?#\x00-\x1f]/.test(path);
}
