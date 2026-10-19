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

## Solicitudes de inscripción y panel privado

El formulario guarda nombre, correo, institución opcional y constancia de autorización mediante `request_registration`. Una respuesta correcta confirma persistencia en Supabase; no depende de abrir una aplicación de correo. El mismo correo y curso no se duplican ni permiten sobrescribir la solicitud original desde el formulario público. Las solicitudes anteriores preparadas por correo no se importan automáticamente.

Aplicar `supabase/registration.sql` después del esquema base. Los visitantes solo ejecutan la función de registro; no pueden leer solicitudes ni insertar directamente. Los estudiantes tampoco ven datos ajenos. Solo las cuentas incluidas en `academy_private.administrators` pueden ver y cambiar el estado de seguimiento. No hay una clave administrativa en el navegador.

Acceso del titular: abrir `https://energeticos2023.github.io/energeticos-academia/#administracion` e ingresar con su cuenta del aula. La cuenta de Supabase Dashboard/GitHub es distinta de la cuenta de Supabase Auth del aula. La migración vincula `jose.zena.p@uni.pe` únicamente si ya existe y tiene el correo confirmado. Después de aceptar una invitación pendiente, volver a ejecutar solo el `insert into academy_private.administrators ... select ...` del final del archivo para vincular el ID verificado. No conceder acceso basándose en datos editables de un perfil o en un correo escrito en el formulario.

El panel permite filtrar, paginar, actualizar y marcar solicitudes como pendientes, contactadas o cerradas. Estos estados no confirman pagos ni activan matrículas. El cobro, la invitación de estudiantes y la activación continúan en el flujo administrativo documentado arriba.

La currícula pública detalla las cinco unidades del Módulo 1. Los siguientes módulos figuran en preparación hasta recibir el temario aprobado del autor.

## Campus v2 (octubre 2026)

Migración: `supabase/campus-v2.sql` (aplicada en producción por partes el 18/10/2026; probada con `tests/campus-v2.test.mjs`).

- **Contenido por versiones.** Cada módulo es un paquete en `academy_private.module_packages` con estado `testing`, `approved` o `archived`. Los alumnos reciben solo la versión aprobada (`get_current_module`); el administrador y los revisores (`access_kind = 'staff'`) ven además la versión en revisión. El botón **Publicar para los alumnos** del panel (`publish_module_package`) aprueba la versión y archiva la anterior, con registro en `academy_private.audit_events`.
- **Acceso del autor como alumno.** La cuenta administradora tiene una matrícula `staff`: no es una matrícula pagada ni cuenta para certificados. Desde el panel, **Entrar al aula como alumno** abre el aula y **Volver a administración** regresa.
- **Evaluación del Módulo 1** (`m1-evaluacion-v2-1`): 20 preguntas sorteadas por capítulo (2 del 1.1 y 3 de cada uno del 1.2 al 1.7) de un banco privado de 50, 45 minutos, 3 intentos y 70/100. Iniciar consume un intento (`start_assessment`); el envío se califica en el servidor y admite preguntas sin responder. Un intento que vence sin envío cuenta como utilizado. Las claves nunca salen de `academy_private`.
- **Matrículas desde el panel.** *Invitar y activar* usa la función de servidor `admin-invite` (ver `supabase/functions/admin-invite`) y `admin_set_enrollment`, que exige la referencia del pago verificado. También se puede suspender o reactivar.
- **Requisito para invitar alumnos reales:** configurar un SMTP propio en Supabase (Authentication → Emails). Sin él, Supabase solo envía correos a los miembros del equipo del proyecto.
- **Descargas.** Solo PDF del depósito privado `course-private`, con matrícula vigente. Word y PowerPoint permanecen deshabilitados.
