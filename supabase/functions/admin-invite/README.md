# admin-invite

Función de servidor (Supabase Edge Function, `verify_jwt = true`) que envía la invitación por correo a un alumno.

- Solo responde si la sesión que la llama pertenece al administrador verificado (`is_academy_admin`).
- La clave `service_role` se usa únicamente dentro de la función; nunca llega al navegador.
- La activación de la matrícula se hace después con `admin_set_enrollment`, que exige la referencia del pago verificado y queda registrada en `academy_private.audit_events`.
- Requisito: SMTP propio configurado en Supabase (Authentication → Emails). Sin él, Supabase solo envía correos a miembros del equipo del proyecto.

El código desplegado está en `index.ts`.
