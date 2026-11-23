import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function StudentCertificatesPage() {
  const user = await requireUser();
  const locale = await getLocale(user.preferredLocale);
  const isEs = locale === "es";

  const certsRes = await query<{
    id: string;
    verification_code: string;
    metadata_snapshot: {
      course_title_es: string;
      course_title_en: string;
      final_grade_pct: number;
    };
    issued_at: Date;
    revoked_at: Date | null;
  }>(
    `SELECT id, verification_code, metadata_snapshot, issued_at, revoked_at
     FROM certificates WHERE student_id = $1 ORDER BY issued_at DESC`,
    [user.id]
  );

  return (
    <AppShell user={user} locale={locale} activePortal="learn">
      <div className="stack">
        <div className="row">
          <Link href="/learn" className="btn">← {isEs ? "Mi Aprendizaje" : "My Learning"}</Link>
        </div>
        <section className="card">
          <h1>{isEs ? "Mis Certificados y Notas Finales" : "My Certificates & Final Grades"}</h1>
        </section>

        {certsRes.rows.length === 0 ? (
          <div className="card">
            <p>
              {isEs
                ? "Completa el 100 % de las lecciones y aprueba las evaluaciones de un curso para emitir tu certificado PDF automáticamente."
                : "Complete 100% of lessons and pass course assessments to automatically issue your PDF certificate."}
            </p>
          </div>
        ) : (
          <div className="grid-2">
            {certsRes.rows.map((cert) => (
              <article key={cert.id} className="card stack">
                <div>
                  <span className="badge badge-success">
                    {isEs ? `Nota final: ${cert.metadata_snapshot.final_grade_pct}%` : `Final grade: ${cert.metadata_snapshot.final_grade_pct}%`}
                  </span>
                  <h2 style={{ marginTop: "8px" }}>
                    {isEs ? cert.metadata_snapshot.course_title_es : cert.metadata_snapshot.course_title_en}
                  </h2>
                  <p className="hint">
                    {isEs ? "Código:" : "Code:"} <code>{cert.verification_code}</code>
                  </p>
                </div>
                <div className="row">
                  <a href={`/api/learn/certificates/${cert.id}/pdf`} className="btn btn-primary">
                    {isEs ? "Descargar certificado PDF" : "Download PDF certificate"}
                  </a>
                  <Link href={`/verify/${cert.verification_code}`} className="btn">
                    {isEs ? "Ver verificación pública" : "Public verification"}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
