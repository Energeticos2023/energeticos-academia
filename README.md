# ENERGÉTICOS Academia

Portal público y aula para el curso de pago **Gestión de Flotas Eléctricas y Operaciones de Electromovilidad – Perú**, de José Rafael Zeña Peche, Ingeniero Mecánico Electricista, CIP 85540.

## Arquitectura

- **GitHub Pages**: portada, programa, perfil del autor e interfaz de ingreso.
- **Supabase Auth**: cuentas por correo y contraseña, invitación y recuperación de acceso.
- **Postgres con RLS**: matrícula activa, pago confirmado y vigencia. Los alumnos no pueden modificar su matrícula.
- **Supabase Storage privado**: lecciones, ilustraciones y documentos. Cada descarga exige una sesión y una matrícula autorizadas en el servidor.
- **Progreso por estudiante**: guardado en base de datos con acceso limitado a su propietario. Es seguimiento personal, no una calificación certificada.

El código público no incluye las lecciones completas, respuestas de práctica, documentos Word, PowerPoint ni imágenes académicas. El paquete privado se conserva localmente en `private-course/`, ignorado por Git. No debe subirse a GitHub ni al directorio publicado `web/`.

## Estado actual

La interfaz está lista para GitHub Pages. Mientras `web/config.js` esté sin configurar, el acceso de estudiantes permanece deshabilitado. La autenticación, las matrículas, los correos de recuperación y la protección de materiales no se consideran operativos hasta configurar Supabase y aprobar las pruebas de integración.

El cobro es manual: el responsable verifica el pago antes de activar cada matrícula. No se incluye una pasarela de pago ni se publica un precio no confirmado.

## Configuración del servicio

1. Crear un proyecto Supabase dedicado a la academia. El titular debe completar cualquier contratación y aceptación de términos de la plataforma.
2. Ejecutar `supabase/setup.sql` y después `supabase/assessments.sql` en el SQL Editor. Crean matrículas, progreso, políticas RLS, el depósito privado `course-private`, el banco de preguntas privado y las funciones de calificación en servidor. El proyecto verificado es `Energeticos_Academia`, referencia `fgjxrbnehjwkzcousdtp`.
3. En Authentication, habilitar correo y contraseña y **deshabilitar el registro público de usuarios**. Crear cuentas mediante invitación administrativa. No crear políticas que permitan a los estudiantes escribir en `course_enrollments`.
4. Configurar Site URL y Redirect URLs con `https://energeticos2023.github.io/energeticos-academia/`. Configurar SMTP propio para el envío real de invitaciones y recuperación; el servicio de correo de prueba de Supabase tiene restricciones.
5. En las Variables de GitHub Actions del repositorio, definir `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Son valores públicos. **Nunca usar una clave secret ni service_role en variables que se integren en el navegador.**
6. Cargar los materiales privados con `node scripts/upload-content.mjs`. La URL y la clave administrativa se solicitan por terminal; la clave no se muestra ni se guarda. También puede utilizarse `SUPABASE_SERVICE_ROLE_KEY` solo en el entorno temporal del proceso local.
7. Aplicar el banco desde el archivo LOCAL `private-assessments/seed.sql`. No subir ese archivo a GitHub ni a Storage: contiene las claves de los exámenes. Ejecutar `tests/rls.integration.mjs` con las credenciales del proyecto en el entorno temporal. Verificar que usuarios anónimos, no matriculados, impagos, suspendidos y vencidos no pueden descargar ni acceder al examen; un alumno tampoco puede activar su propia matrícula, modificar una nota ni consultar resultados ajenos.
8. Ejecutar nuevamente el workflow de GitHub Pages. Probar una invitación y el ingreso con una cuenta propia antes de matricular estudiantes reales.

## Matricular estudiantes

Con las dependencias instaladas:

```text
node scripts/manage-students.mjs invitar
node scripts/manage-students.mjs activar
node scripts/manage-students.mjs suspender
```

`invitar` solicita correo, URL del curso, confirmación de pago y confirmación del envío. Envía una invitación para que el estudiante defina su propia contraseña. `activar` habilita una cuenta ya existente; `suspender` impide nuevas descargas y guarda el progreso. Se puede fijar una fecha de vencimiento sin imponer un plazo predeterminado.

La contraseña no se almacena en GitHub ni en una lista del docente. No es necesario conocer ni enviar la contraseña personal del alumno.

La autorización de nuevas solicitudes se revoca en el servidor. Como en cualquier plataforma educativa, no es posible recuperar archivos que un alumno ya descargó durante su matrícula.

## Desarrollo y actualizaciones

```text
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
pnpm test
```

El workflow solo publica `web/`. `src/auth.mjs` se compila localmente, sin cargar librerías de autenticación desde un CDN en el navegador.

La generación inicial `scripts/prepare-content.py` utiliza la versión local hermana `energeticos-academia/dist`. Ejecutarla al actualizar el manual: produce el JSON privado, copia las imágenes y los documentos solo a `private-course/` y prepara la interfaz pública. Requiere Python. Después ejecutar `node scripts/build-assessments.mjs`, compilar, verificar y cargar los materiales privados. En otra computadora se deben recuperar los documentos originales y el banco privado desde el archivo del autor; no desde GitHub.

## Evaluaciones del Módulo 1

- Cinco autoevaluaciones, una por unidad, con tres preguntas y retroalimentación cada una: 15 preguntas formativas. El resultado se sincroniza como progreso personal.
- Cinco evaluaciones de cierre, una por unidad, con cinco preguntas cada una: 25 preguntas calificadas en servidor.
- Una evaluación integradora al final del módulo, con diez preguntas calificadas en servidor.
- Cada envío guarda alumno, evaluación, respuestas, instantánea de las preguntas sin claves, nota, referencia de aprobación y fecha. La repetición de un mismo envío por fallo de red no crea un intento adicional.
- Las respuestas correctas de los exámenes se almacenan en `academy_private.assessment_questions`, sin acceso directo para alumnos ni usuarios anónimos. El cliente recibe solo enunciados y opciones. Las notas son de solo lectura para el estudiante.
- La referencia inicial es 70/100, tomada de la sugerencia del manual. No hay límite de intentos configurado por defecto. Ambos parámetros pueden ajustarse en `assessment_catalog`. Una nota de examen no sustituye la rúbrica del caso ni la nota ponderada global, y no genera certificados automáticamente.
- El informe local `private-assessments/Banco_Evaluaciones_Modulo_1.html` permite al docente revisar todas las preguntas y soluciones. Al cambiar sustancialmente una evaluación, incrementar la versión del banco para conservar la trazabilidad de los intentos anteriores.
- La evaluación final del curso completo se elaborará cuando estén disponibles los siguientes módulos; no se presenta la evaluación del Módulo 1 como evaluación de todo el programa.

## Pruebas y límites

Las pruebas unitarias cubren el cierre del acceso sin configuración, el rechazo de claves privilegiadas en configuración pública, estados y vencimiento de matrícula, rutas de descarga y ausencia de material pagado en el despliegue. Las pruebas de integración requieren un proyecto real: no se sustituyen por un formulario de ingreso simulado.

`tests/database.test.mjs` ejecuta los mismos esquemas y funciones SQL en PostgreSQL local mediante PGlite. Comprueba permisos RLS, aislamiento de resultados, calificación en servidor, idempotencia de envíos, límites de intentos y bloqueo por suspensión o vencimiento. Esta prueba no reemplaza la comprobación final de Auth, Storage y correos en el proyecto Supabase real.

`node scripts/prepare-install.mjs` reúne los esquemas y el banco en `artifacts/Instalar_Academia.sql`, un archivo local reservado al propietario para aplicar la configuración de forma transaccional. Contiene soluciones de examen y permanece fuera de Git y del sitio publicado.

## Referencias

- [Autenticación con contraseña](https://supabase.com/docs/guides/auth/passwords)
- [Control de acceso al almacenamiento](https://supabase.com/docs/guides/storage/security/access-control)
- [GitHub Pages](https://docs.github.com/en/pages)

## Solicitudes de inscripción y currícula pública

La portada incluye enlaces a `#inscripcion`, `#programa` y `#como-acceder`. La solicitud prepara un correo al docente con nombre, correo de matrícula y empresa opcional. El visitante revisa y envía el mensaje desde su aplicación de correo; no se guarda una solicitud en Supabase ni se envía automáticamente. La página ofrece el correo directo como alternativa. No se solicita contraseña ni se cobra desde el formulario.

Flujo del docente: responder con precio, condiciones, alcance y vigencia; verificar el pago; ejecutar `scripts/manage-students.mjs invitar` o activar una cuenta existente. El alumno define su contraseña mediante invitación o recuperación. Antes de usarlo con estudiantes reales, completar la configuración de Auth/SMTP y probar una invitación real con una cuenta propia. Las credenciales administrativas nunca deben publicarse en GitHub ni compartirse con alumnos.

La currícula pública detalla las cinco unidades, el caso aplicado y las evaluaciones del Módulo 1. Los siguientes módulos están señalados como en preparación hasta incorporar el temario aprobado del autor. No se promete una fecha, precio o contenido de módulos todavía no aportados.
