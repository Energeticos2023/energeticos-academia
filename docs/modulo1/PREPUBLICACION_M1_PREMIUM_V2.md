# Módulo 1 Premium v2 — Entrega académica en preparación

**Estado:** revisión académica y staging; prohibida la publicación comercial y la certificación hasta pruebas E2E.

## Destino del módulo
- Sitio existente: https://energeticos2023.github.io/energeticos-academia/
- Proyecto Supabase existente: Energeticos_Academia.
- Bucket privado: `course-private`.
- Ruta temporal versionada: `flotas-electricas-peru/module-1-v2-draft/`.
- NO sobrescribir `flotas-electricas-peru/module-1/` mientras no se implementen todos los cambios de compatibilidad.

## Alcance académico del archivo de autor
- Siete capítulos originales y diez horas estimadas, lecciones totalmente asincrónicas.
- Caso didáctico de flota institucional de 10 vehículos en Áncash.
- Manual del alumno en PDF con bibliografía de AAP, MINEM, MTC, INACAL, UNECE, ISO, IEA y BID.
- Banco docente privado con 50 preguntas, del que se tomarán 20 para la evaluación oficial de tres intentos.
- Hoja de cálculo docente para balance energético, matriz multicriterio y registro de evidencias.
- Material audiovisual y seguimiento académico certificado todavía por implementar.

## Carga segura
1. Guardar el manual editable y las respuestas de evaluaciones fuera del bucket de estudiantes.
2. Subir `course-data.json` y el PDF a un prefijo versionado del bucket privado; no al repositorio público.
3. Adaptar sanitización HTML para bibliografía enlazada, sin conceder capacidad de inyectar scripts.
4. Cambiar el controlador de navegación que actualmente asume cinco unidades y siete horas.
5. Cambiar enlace de recursos para permitir descargar exclusivamente PDF autorizado, protegido por matrícula vigente.
6. Crear `assessment_catalog` para `m1-evaluacion-v2`, `max_attempts=3`, e ingresar de forma segura el banco de preguntas en `academy_private.assessment_questions`.
7. Implementar registro de progreso académico confiable en servidor; el botón local «Marcar completado» no habilita diplomas.
8. Ejecutar pruebas con cuentas ficticias y verificar documento, preguntas, calificaciones y aislamiento de datos.
9. Aprobar contenidos, derechos de imágenes y fuentes, y registrar control de versión antes de activar.

**Precaución:** se preparó un paquete ZIP para revisión, con banco docente privado; **NO subir ese ZIP completo** a Storage ni a GitHub.

## Brecha de consistencia
El manual previo tenia cinco unidades y siete horas; la web publica una malla de siete capítulos y diez horas. El módulo v2 formaliza siete capítulos en 600 minutos, incluyendo un examen de 60 minutos. La evaluación modular se define como 20 preguntas seleccionadas de un banco de 50, escala 0-100 y 70 de aprobación. Los datos de estudio de mercado provienen de AAP y no prueban demanda de formación ni reconocimiento académico externo.
