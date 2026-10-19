# ENERGÉTICOS Academia — Especificación funcional y técnica del campus MOOC
Versión: 1.0 | Fecha: 2026-10-18 | Estado: diseño para validación, NO AUTORIZADO PARA VENTAS.

## 1. Decisiones de negocio confirmadas
- Programa inicial: Gestión de Flotas y Operaciones de Vehículos Eléctricos en el Perú; seis módulos, 60 horas de dedicación estimada. Todos los contenidos del curso contratado estarán disponibles tras activar la matrícula.
- Modalidad: 100 % virtual y asincrónica, con lecciones de creación propia, autoevaluaciones, evaluaciones calificadas, examen final y recursos de investigación.
- Captación e inscripción: exclusivamente por el WhatsApp comercial oficial +51 942 899 919 (https://wa.me/51942899919). No habrá autoservicio de matrícula ni formulario público de inscripción.
- Confirmación de pago: manual y realizada fuera del campus por personal autorizado, confrontando el depósito/transferencia con los canales bancarios oficiales. Una captura de pantalla no prueba por sí sola el pago.
- Activación: exclusivamente por administrador; invitación de acceso al correo verificado del alumno. Nadie comparte ni conoce las contraseñas individuales.
- Lanzamiento: NO se aceptan pagos ni matrículas comerciales durante la fase de pruebas. La apertura requiere acta de aceptación técnica, académica y legal.
- Certificación: emisor institucional ENERGÉTICOS Academia hasta que exista convenio y autorización escrita con el Colegio de Ingenieros del Perú (CIP) o CARELEC. No usar nombres/logos de terceros como aval antes de formalizarlo.

## 2. Flujo del aspirante y del alumno
1. Visitante consulta la ficha pública del programa y solicita información por WhatsApp. Nunca obtiene acceso al contenido privado.
2. Responsable envía condiciones aprobadas: costo, alcance exacto, horas, requisitos, derechos, privacidad, política de devoluciones y procedimiento de pago. Mientras esté en pruebas se informa que NO hay matrícula habilitada.
3. Interesado confirma su decisión y proporciona nombre legal, correo, teléfono de contacto y consentimiento correspondiente por el canal establecido. Se registra en un panel administrativo (a construir), no mediante un formulario público.
4. Administrador confirma el abono comparándolo con un registro bancario auténtico, anota referencia, fecha, monto, moneda y quien verificó, evitando guardar datos bancarios sensibles innecesarios.
5. Administrador ejecuta la invitación de Supabase Auth desde un servicio confiable (Edge Function con verificación de rol; jamás service_role en el navegador); crea matrícula activa solo después de validar pago.
6. Alumno recibe invitación por correo, configura contraseña propia, inicia sesión y accede a todo el contenido habilitado del curso.
7. Alumno completa las actividades académicas, presenta hasta 3 intentos por examen calificado y consulta su progreso y notas.
8. El motor académico calcula elegibilidad, y el administrador valida/emite el diploma institucional con número único y verificación pública limitada a datos autorizados.

## 3. Roles
- Visitante: solo portada, programas, información de privacidad y enlace WhatsApp.
- Alumno activo: curso matriculado, lecciones, recursos permitidos, sus intentos, sus notas y su progreso; nunca ve claves, notas ajenas ni archivos internos.
- Alumno suspendido/vencido: no accede al contenido privado ni presenta pruebas nuevas; las evidencias académicas históricas se conservan según política de retención.
- Docente/revisor: consulta resultados y casos asignados según permiso, sin editar notas arbitrariamente.
- Administrador: gestiona invitaciones, matrículas, verificaciones de pago, contenido, excepciones documentadas y certificados, con trazabilidad de actuaciones.
- Auditor académico: vista de solo lectura de registros relevantes con acceso limitado.

## 4. Componentes de la plataforma
- Portada GitHub Pages: identidad institucional, temario actualizado, consulta WhatsApp y acceso al aula. Estado visible "En validación — matrículas cerradas" hasta la apertura.
- Supabase Auth: cuentas individuales, invitación administrativa, correo verificado, recuperación de clave, MFA para administradores y revocación de sesiones según riesgo.
- Supabase Postgres: matriculaciones, preguntas privadas, intentos, notas, actividades, finalizaciones verificadas, auditoría y certificados; RLS y mínimos privilegios.
- Storage privado: materiales de lecciones e imágenes bajo control de matrícula. PDF autorizados descargables. Archivos DOCX/PPTX solo para el autor en ubicación privada, nunca como descargas del aula.
- Vídeos: proveedor de streaming autenticado con enlaces de corta duración, sin botón de descarga, marca de agua cuando sea viable y cumplimiento de licencias. No es técnicamente posible impedir toda grabación de pantalla.
- Servicio seguro (Edge Functions o equivalente) para invitar usuarios, validar reglas académicas y emitir certificados con credenciales administrativas solo en servidor.
- Registro, métricas y alertas; copias de seguridad y prueba de restauración.

## 5. Progreso académico: especificación antifraude
- Conservar public.student_progress únicamente como preferencias, borradores y navegación del usuario; NO da derecho a certificación.
- Registrar las actividades obligatorias en academy_activities: curso, módulo, capítulo, tipo, versión, obligatoriedad y comprobación exigida.
- Registrar actividad finalizada en academic_completions (servidor): alumno, actividad, versión, evidencia, fecha y origen de validación. El alumno no podrá INSERT/UPDATE directamente.
- Las lecturas exigen una breve comprobación de comprensión, no solo hacer clic en "Leído" o desplazarse por la página. Ver tiempo de permanencia puede ayudar a detectar anomalías, pero no constituye prueba suficiente.
- Los vídeos obligatorios registrarán tramos reproducidos más una comprobación de comprensión. Reconocer que los eventos de reproductor del cliente pueden manipularse: la aprobación dependerá de evidencias evaluables.
- Los enlaces complementarios son optativos salvo que el sílabo los declare como actividad con evidencia; evitar obligar a abrir URLs externas que pueden fallar.
- Mostrar estados visibles: No iniciado / En desarrollo / Completado verificado / Pendiente de evaluación / Aprobado.

## 6. Motor de evaluaciones
- Cuestionario por módulo y examen integral final, además de prácticas no calificadas ilimitadas.
- Cada evaluación calificada tiene máximo 3 intentos válidos por estudiante, implementado en servidor, con idempotencia frente a reconexiones y protección ante envíos simultáneos.
- Nota en escala 0-100; aprobación propuesta >= 70/100 por módulo y en examen final.
- Tomar la mejor nota de los 3 intentos para el cómputo final. Mantener historial íntegro de los otros intentos.
- Ponderación propuesta: seis evaluaciones modulares, 10 % cada una (60 %), examen final 40 %.
- Preguntas y soluciones únicamente en esquema privado; el cliente recibe solo las seleccionadas para su intento. Aleatoriedad y preguntas equivalentes por versión. Guardar instantánea de preguntas por intento y versión del banco.
- Activar examen final solo después de aprobar los seis módulos; no bloquear la consulta de lecciones del curso.
- No calcular ni permitir editar notas desde el frontend. Los cambios excepcionales requieren administrador autorizado, justificación, auditoría y doble revisión cuando sea posible.
- La interrupción de red no debe gastar un intento por duplicidad del mismo envío. Diseñar inicio formal de intento y guardado parcial para recuperación responsable.

## 7. Certificados y potencial aval de terceros
- Emisión SOLO si: matrícula aprobada, 100 % de actividades obligatorias verificadas, todas las pruebas modulares >=70, examen final >=70, promedio ponderado >=70 y ausencia de bloqueo administrativo justificable.
- Identificador único; PDF con nombre verificado, título, fechas, horas, nota según política, versión curricular, emisor real, firma autorizada, QR a validación y mecanismo de revocación.
- Historial inmutable: quien emitió, cuándo, revisión, rectificación o anulación.
- No colocar logotipos, menciones de respaldo o firma de CIP/CARELEC hasta formalizar sus condiciones mediante documentación escrita. Configurar plantillas de emisor para evitar cambios en registros históricos.
- Validación pública por código que revele solo datos mínimos y legalmente permitidos.

## 8. Modelo de datos previsto
Ya existen (verificar en producción): course_enrollments, student_progress, assessment_catalog, assessment_attempts, academy_private.assessment_questions, academy_private.administrators, registration_requests, bucket course-private.

Agregar mediante migraciones revisadas y probadas en entorno separado:
- admin_whatsapp_leads: registro privado de prospectos atendidos manualmente y su consentimiento; sin lectura pública.
- payment_verifications: referencia, medio, estado, fecha, monto, validador y evidencia de auditoría mínima.
- academy_courses, academy_modules, academy_activities: contenido/versiones/obligatoriedad.
- academic_completions y activity_evidence: evidencias validadas en servidor; operaciones solo mediante RPC autorizadas.
- assessment_sessions (si se requiere sorteo y guardado de intentos): selección fija por intento, inicio y estado.
- course_grades o vista calculada de notas finales: no permitir modificación directa por alumno.
- certificate_eligibility, certificates, certificate_events: reglas, certificados emitidos y acciones auditables.
- audit_events: rastreo de altas, cambios de matrícula, overrides y diplomas.
No guardar contraseñas, claves administrativas, tokens de recuperación ni imágenes de banca personal.

## 9. Seguridad, continuidad y calidad
- Privilegios mínimos, RLS para todas las tablas expuestas, revisar políticas Storage y EXECUTE de funciones SECURITY DEFINER.
- Deshabilitar o restringir request_registration pública después de sustituir el formulario (conservar las 2 solicitudes históricas para seguimiento legítimo).
- Limitar abusos del canal público de contacto, evitar enumeración de usuarios, throttling, MFA admin, registro de sesiones y política de contraseñas.
- Nunca exponer service_role o sb_secret_ en frontend/GitHub Pages.
- Política de privacidad, consentimiento y retención conforme a legislación peruana aplicable; texto legal revisado antes del lanzamiento.
- Respaldos automáticos con ensayos de restauración y responsables definidos.
- Diseño adaptable a móvil y escritorio, accesibilidad WCAG 2.2 AA como objetivo de aceptación, subtítulos, transcripciones y navegación con teclado.
- Rendimiento, soporte, monitoreo, recuperación de fallos y capacidad de carga documentados.
- "100 % listo" significa pasar todas las pruebas críticas y una validación académica sin defectos críticos; ninguna plataforma promete disponibilidad absoluta.

## 10. Pruebas de aceptación Go/No-Go
1. Visitante/no matriculado no ve material ni prueba privados.
2. Enlace directo a objeto privado falla sin sesión y matrícula válida.
3. Usuario autenticado sin abono verificado no recibe matrícula ni acceso.
4. Alumno A no lee ni modifica matrícula, notas o progreso de B.
5. Alumno no modifica su propia nota ni finalización académica verificada.
6. Admin habilita matrícula solo tras verificación documentada del depósito.
7. Suspender o vencer una matrícula revoca nuevos accesos.
8. Todos los módulos/lecturas disponibles a alumno activo desde el inicio.
9. Progreso académico permanece tras cerrar sesión/cambiar dispositivo.
10. Marcar manualmente una página o alterar JavaScript no otorga finalización certificable.
11. Autoevaluaciones formativas pueden repetirse sin consumir intentos oficiales.
12. Primer, segundo y tercer intento se registran y califican correctamente.
13. Cuarto intento oficial es rechazado por servidor.
14. Reenvío de misma evaluación por error de red no duplica intento.
15. Las claves correctas no se exponen en API pública ni código entregado al alumno.
16. Examen final bloqueado hasta completar los seis módulos.
17. Fórmula de nota final y notas históricas comprobadas con casos conocidos.
18. Diploma bloqueado con una sola lectura obligatoria pendiente.
19. Diploma bloqueado si falta aprobar cualquier módulo o el examen final.
20. Diploma habilitado solo para el caso aprobado; QR verificable y revocable.
21. Descargables: solo PDF habilitados y enlaces de bibliografía; Word/PPTX privados.
22. Vídeos por streaming privado, sin descarga ofrecida; revisión de accesos.
23. Recuperación de contraseña sin exponer si un correo está inscrito.
24. Pruebas en Android, iOS, Windows y navegadores principales.
25. Simulación de caída de red y restauración de respaldo.
26. Accesibilidad y requisitos de privacidad verificados.
27. Prueba de carga escalonada antes de definir cupos comerciales.
28. Contenido completo, enlaces verificados, evaluación académica y título de certificación aprobados.

No lanzar si falla cualquiera de las pruebas críticas 1-21 o si no está publicado el contenido completo prometido.

## 11. Estado real auditado (18/10/2026)
- Supabase Energeticos_Academia activo; 0 usuarios Auth, 0 matrículas, 0 administradores del aula, 2 solicitudes previas pendientes, 0 intentos, 0 registros de progreso.
- 6 evaluaciones activas del Módulo 1, 35 preguntas privadas; max_attempts NULL en las seis evaluaciones.
- 9 objetos de Storage privado: 6 JPG, 1 JSON, 1 DOCX y 1 PPTX. Aún no hay PDF ni vídeos.
- Política sobre student_progress permite edición propia de estado JSON: seguimiento NO válido como evidencia certificable.
- Hallazgos de linter SECURITY DEFINER por revisar y mejoras de índices por aplicar.
- Rama main se publica por GitHub Pages y no cuenta con protección de rama observada.

## 12. Plan de implementación por entregas
E0. Esta especificación y cambio de portada al estado "En validación" + WhatsApp. Mantener matrícula cerrada.
E1. Autenticación administrativa: crear cuenta administrativa, MFA, panel seguro de leads/abonos/invitaciones; deshabilitar registro público y conservar historial.
E2. Modelo de contenido: seis módulos, PDF autorizados, streaming y control de acceso.
E3. Evaluaciones: 3 intentos y mecanismo de sesión/sorteo seguro; pruebas de resiliencia.
E4. Finalización académica: nuevas tablas, checkpoints y reglas verificadas en servidor.
E5. Motor de certificado y QR con emisor institucional configurable; no avales pendientes.
E6. Pruebas E2E con cuentas ficticias y auditoría seguridad/privacidad/accesibilidad.
E7. Comité académico valida las seis unidades de aprendizaje y materiales completos.
E8. Aprobación formal Go/No-Go y apertura manual de matrículas comerciales.

No ejecutar cambios de esquema ni desplegar a producción como parte de este documento.