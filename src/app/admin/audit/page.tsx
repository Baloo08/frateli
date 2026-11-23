import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const user = await requireRole(["superadmin"]);
  const locale = await getLocale(user.preferredLocale);
  const isEs = locale === "es";

  const logsRes = await query<{
    id: string;
    portal_context: string;
    action: string;
    resource_type: string;
    resource_id: string;
    reason: string | null;
    actor_email: string | null;
    created_at: Date;
  }>(
    `SELECT a.id::text, a.portal_context, a.action, a.resource_type, a.resource_id,
            a.reason, u.email AS actor_email, a.created_at
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC
     LIMIT 100`
  );

  return (
    <AppShell user={user} locale={locale} activePortal="admin">
      <div className="stack">
        <div className="row">
          <Link href="/admin" className="btn">← {isEs ? "Volver a Admin" : "Back to Admin"}</Link>
        </div>

        <section className="card">
          <h1>{isEs ? "Bitácora de Auditoría Inmutable" : "Immutable Audit Log"}</h1>
          <p className="hint">
            {isEs
              ? "Últimos 100 eventos protegidos contra edición o borrado en PostgreSQL."
              : "Latest 100 events protected against modification or deletion in PostgreSQL."}
          </p>
        </section>

        <div className="table-wrapper" tabIndex={0} role="region" aria-labelledby="audit-cap">
          <table>
            <caption id="audit-cap">{isEs ? "Registros de auditoría" : "Audit entries"}</caption>
            <thead>
              <tr>
                <th scope="col">{isEs ? "Fecha" : "Timestamp"}</th>
                <th scope="col">{isEs ? "Portal" : "Portal"}</th>
                <th scope="col">{isEs ? "Acción" : "Action"}</th>
                <th scope="col">{isEs ? "Actor" : "Actor"}</th>
                <th scope="col">{isEs ? "Motivo" : "Reason"}</th>
              </tr>
            </thead>
            <tbody>
              {logsRes.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.created_at.toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td><span className="badge">{row.portal_context}</span></td>
                  <td><code>{row.action}</code></td>
                  <td>{row.actor_email || "system"}</td>
                  <td>{row.reason || row.resource_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
