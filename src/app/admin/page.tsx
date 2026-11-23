import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const user = await requireRole(["superadmin"]);
  const locale = await getLocale(user.preferredLocale);
  const isEs = locale === "es";

  const [teachersCount, coursesCount, pendingReqCount, auditCount] = await Promise.all([
    query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM users WHERE role = 'teacher'`),
    query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM courses`),
    query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM capability_requests WHERE status = 'pending'`),
    query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM audit_logs`),
  ]);

  return (
    <AppShell user={user} locale={locale} activePortal="admin">
      <div className="stack">
        <section className="card">
          <h1>{isEs ? "Portal Superadministrativo" : "Superadmin Portal"}</h1>
          <p style={{ color: "var(--text-secondary)" }}>
            {isEs
              ? "Gestiona docentes, habilita cursos, controla el acceso al Video Studio, conecta Google Workspace/Drive y audita toda la actividad."
              : "Manage teachers, enable courses, govern Video Studio access, connect Google Workspace/Drive, and audit all activity."}
          </p>
        </section>

        <section className="grid-3">
          <div className="card">
            <h2>{teachersCount.rows[0]?.c ?? "0"}</h2>
            <p>{isEs ? "Docentes registrados" : "Registered teachers"}</p>
            <Link href="/admin/teachers" className="btn btn-primary">
              {isEs ? "Gestionar docentes" : "Manage teachers"}
            </Link>
          </div>
          <div className="card">
            <h2>{coursesCount.rows[0]?.c ?? "0"}</h2>
            <p>{isEs ? "Cursos totales" : "Total courses"}</p>
            <Link href="/admin/courses" className="btn btn-primary">
              {isEs ? "Gestionar cursos" : "Manage courses"}
            </Link>
          </div>
          <div className="card">
            <h2>{pendingReqCount.rows[0]?.c ?? "0"}</h2>
            <p>{isEs ? "Solicitudes Video Studio" : "Video Studio requests"}</p>
            <Link href="/admin/studio-access" className="btn btn-primary">
              {isEs ? "Controlar Video Studio" : "Govern Video Studio"}
            </Link>
          </div>
        </section>

        <section className="grid-3">
          <div className="card stack">
            <h3>{isEs ? "Recursos, Google Drive, IA y SMTP" : "Resources, Google Drive, AI & SMTP"}</h3>
            <p style={{ color: "var(--text-secondary)" }}>
              {isEs
                ? "Conecta la cuenta de Google Drive/Docs/Slides/Calendar, verifica Gemini IA y prueba el correo Google SMTP."
                : "Connect Google Drive/Docs/Slides/Calendar, check Gemini AI, and test Google SMTP email."}
            </p>
            <Link href="/admin/resources" className="btn">
              {isEs ? "Abrir configuración" : "Open settings"}
            </Link>
          </div>

          <div className="card stack">
            <h3>{isEs ? "Auditoría Inmutable" : "Immutable Audit Log"}</h3>
            <p style={{ color: "var(--text-secondary)" }}>
              {isEs
                ? `${auditCount.rows[0]?.c ?? "0"} eventos registrados con bloqueo append-only en PostgreSQL.`
                : `${auditCount.rows[0]?.c ?? "0"} events logged with append-only PostgreSQL protection.`}
            </p>
            <Link href="/admin/audit" className="btn">
              {isEs ? "Ver bitácora" : "View audit log"}
            </Link>
          </div>

          <div className="card stack">
            <h3>{isEs ? "Video Studio (Superadmin)" : "Video Studio (Superadmin)"}</h3>
            <p style={{ color: "var(--text-secondary)" }}>
              {isEs
                ? "Graba y edita lecciones en video directamente desde tu portal de edición."
                : "Record and edit video lessons directly inside the editing studio."}
            </p>
            <Link href="/studio" className="btn btn-primary">
              {isEs ? "Entrar a Video Studio" : "Open Video Studio"}
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
