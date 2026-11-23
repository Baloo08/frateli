import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { buildCertificateHash } from "@/lib/crypto";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await getCurrentUser().catch(() => null);
  const locale = await getLocale(user?.preferredLocale);
  const isEs = locale === "es";

  const certRes = await query<{
    id: string;
    student_id: string;
    course_id: string;
    verification_code: string;
    verification_hash: string;
    metadata_snapshot: {
      student_full_name: string;
      course_title_es: string;
      course_title_en: string;
      primary_teacher_name: string;
      final_grade_pct: number;
    };
    issued_at: Date;
    revoked_at: Date | null;
    revocation_reason: string | null;
  }>(`SELECT * FROM certificates WHERE verification_code = $1 LIMIT 1`, [code]).catch(() => ({
    rows: [],
  }));

  const cert = certRes.rows[0];
  let hashValid = false;
  if (cert) {
    const expected = buildCertificateHash({
      certificateId: cert.id,
      courseId: cert.course_id,
      finalGradePct: Number(cert.metadata_snapshot.final_grade_pct).toFixed(2),
      issuedAt: cert.issued_at.toISOString(),
      studentId: cert.student_id,
    });
    hashValid = expected === cert.verification_hash;
  }

  return (
    <AppShell user={user} locale={locale}>
      <section className="card stack" style={{ maxWidth: "680px", margin: "24px auto" }}>
        <h1>{isEs ? "Verificación de Certificado" : "Certificate Verification"}</h1>
        {!cert ? (
          <div className="alert alert-error" role="alert">
            {isEs ? `No existe ningún certificado con el código ${code}.` : `No certificate found for code ${code}.`}
          </div>
        ) : cert.revoked_at ? (
          <div className="alert alert-error" role="alert">
            <strong>{isEs ? "Certificado REVOCADO" : "Certificate REVOKED"}</strong>
            <p>{cert.revocation_reason}</p>
          </div>
        ) : (
          <div className="stack">
            <div className="alert alert-success">
              <strong>
                {hashValid
                  ? isEs
                    ? "Certificado auténtico y verificado (SHA-256 válido)"
                    : "Authentic verified certificate (valid SHA-256)"
                  : isEs
                  ? "Registro verificado"
                  : "Verified record"}
              </strong>
            </div>
            <dl>
              <dt><strong>{isEs ? "Estudiante" : "Student"}</strong></dt>
              <dd>{cert.metadata_snapshot.student_full_name}</dd>
              <dt><strong>{isEs ? "Curso" : "Course"}</strong></dt>
              <dd>{isEs ? cert.metadata_snapshot.course_title_es : cert.metadata_snapshot.course_title_en}</dd>
              <dt><strong>{isEs ? "Docente" : "Instructor"}</strong></dt>
              <dd>{cert.metadata_snapshot.primary_teacher_name}</dd>
              <dt><strong>{isEs ? "Calificación" : "Grade"}</strong></dt>
              <dd>{cert.metadata_snapshot.final_grade_pct}%</dd>
              <dt><strong>{isEs ? "Código" : "Code"}</strong></dt>
              <dd><code>{cert.verification_code}</code></dd>
              <dt><strong>SHA-256</strong></dt>
              <dd style={{ wordBreak: "break-all" }}><code>{cert.verification_hash}</code></dd>
            </dl>
          </div>
        )}
      </section>
    </AppShell>
  );
}
