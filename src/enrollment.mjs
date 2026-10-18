// Prepara una solicitud en el correo del visitante; no envía ni almacena datos.
const form = document.querySelector('#enrollment-form');
form?.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const clean = value => value.trim().replace(/[\r\n]+/g, ' ');
  const name = clean(form.elements.name.value);
  const email = clean(form.elements.email.value);
  if (!name) {
    form.elements.name.setCustomValidity('Escribe tus nombres y apellidos.');
    form.elements.name.reportValidity();
    return;
  }
  const organization = clean(form.elements.organization.value);
  const subject = 'Solicitud de inscripción · Gestión de Flotas Eléctricas – Perú';
  const body = [
    'Estimado Ing. José Rafael Zeña Peche:',
    '',
    'Deseo información para inscribirme en el curso Gestión de Flotas Eléctricas y Operaciones de Electromovilidad – Perú.',
    '',
    `Nombres y apellidos: ${name}`,
    `Correo para mi matrícula: ${email}`,
    ...(organization ? [`Empresa o institución: ${organization}`] : []),
    '',
    'Por favor, indíqueme la inversión, forma de pago, currícula completa, módulos incluidos, disponibilidad y vigencia del acceso.',
    '',
    'Entiendo que la matrícula se activa después de verificar el pago y que recibiré una invitación para definir mi propia contraseña.'
  ].join('\r\n');
  document.querySelector('#enrollment-email-link').href =
    `mailto:jose.zena.p@uni.pe?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  document.querySelector('#enrollment-result').hidden = false;
});
form?.elements.name.addEventListener('input', () => form.elements.name.setCustomValidity(''));
form?.addEventListener('input', () => {
  document.querySelector('#enrollment-result').hidden = true;
  document.querySelector('#enrollment-email-link').removeAttribute('href');
});
