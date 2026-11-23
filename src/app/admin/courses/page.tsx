import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { AdminCoursesClient } from "@/components/AdminCoursesClient";

export const dynamic = "force-dynamic";

export default async function AdminCoursesPage() {
  const user = await requireRole(["superadmin"]);
  const locale = await getLocale(user.preferredLocale);

  const [coursesRes, teachersRes] = await Promise.all([
    query<{
      id: string;
      slug: string;
      title_es: string;
      title_en: string;
      status: string;
      passing_grade_pct: string;
    }>(`SELECT id, slug, title_es, title_en, status, passing_grade_pct::text FROM courses ORDER BY created_at DESC`),
    query<{ id: string; full_name: string; email: string }>(
      `SELECT id, full_name, email FROM users WHERE role = 'teacher' AND status = 'active' ORDER BY full_name ASC`
    ),
  ]);

  return (
    <AppShell user={user} locale={locale} activePortal="admin">
      <div className="stack">
        <div className="row">
          <Link href="/admin" className="btn">← {locale === "es" ? "Volver a Admin" : "Back to Admin"}</Link>
        </div>
        <AdminCoursesClient
          initialCourses={coursesRes.rows}
          teachers={teachersRes.rows}
          locale={locale}
        />
      </div>
    </AppShell>
  );
}
