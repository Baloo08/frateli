# Frateli Campus Virtual (Frateli LMS)

Plataforma LMS modular bilingüe (**ES/EN**), accesible (**WCAG 2.1 AA**), con cuatro portales interconectados, apoyo de **Gemini IA**, integración con **Google Workspace / Drive** y despliegue preparado para **Hostinger VPS KVM 2 + EasyPanel**.

## Portales
- **`/admin`** — Superadministrador: creación/invitación de docentes, habilitación de cursos, gobierno de `/studio`, configuración Google/IA/SMTP y bitácora de auditoría inmutable (`audit_logs`).
- **`/teach`** — Docente: currículo bilingüe, generador de lecciones/quizzes con Gemini IA (`gemini-3.8-flash`), importación desde Google Drive, creación en Google Docs/Slides, Google Calendar + Meet, evaluaciones y Q&A/mensajes 1:1.
- **`/learn`** — Estudiante: cursos, reproductor accesible con WebVTT, evaluaciones, notas y certificados PDF con código QR y verificación pública en `/verify/[code]`.
- **`/studio`** — Video Studio: grabación en navegador con respaldo OPFS, teleprompter con IA, recorte temporal no destructivo, subtítulos WebVTT y publicación directa a lecciones. Inicialmente exclusivo para `superadmin`; habilitable por docente desde `/admin/studio-access`.

## Imágenes recomendadas en EasyPanel
- **PostgreSQL:** `postgres:16-alpine`
- **Redis:** `redis:7-alpine` (si usas una sola instancia Redis, ejecuta con `--maxmemory 256mb --maxmemory-policy noeviction --appendonly yes --appendfsync everysec`)

## Despliegue en EasyPanel desde GitHub
1. Conecta el servicio **`frateli-web`** apuntando a este repositorio (`Builder: Dockerfile`, puerto `3000`).
2. Opcional pero recomendado para video/correos asíncronos: crea un segundo servicio **`frateli-worker`** apuntando al mismo repositorio con `Dockerfile.worker`.
3. Configura en la pestaña **Environment** (en *runtime*, nunca en git) las variables de `.env.example`:
   - `NEXT_PUBLIC_APP_URL` (tu dominio HTTPS de EasyPanel)
   - `DATABASE_URL` y `REDIS_URL`
   - `SESSION_SECRET` e `INTEGRATION_ENCRYPTION_KEY` (64 chars hex)
   - `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` (crea el primer `superadmin` automáticamente al arrancar)
   - `STORAGE_DRIVER=local` (con volumen `/var/lib/frateli/media`) o `STORAGE_DRIVER=s3` (Cloudflare R2)
   - `SMTP_USER`, `SMTP_APP_PASSWORD`, `SMTP_FROM`
   - `GEMINI_API_KEY`
   - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
