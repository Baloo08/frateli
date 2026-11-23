import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessCourseAsStudent } from "@/lib/permissions";
import { getLocale } from "@/i18n";
import { query } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { CourseInteractionsClient } from "@/components/CourseInteractionsClient";

export const dynamic = "force-dynamic";

export default async function StudentInteractionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id: courseId } = await params;
  if (!(await canAccessCourseAsStudent(user, courseId))) redirect("/learn");

  const locale = await getLocale(user.preferredLocale);
  const courseRes = await query<{ id: string; title_es: string; title_en: string }>(
    `SELECT id, title_es, title_en FROM courses WHERE id = $1`,
    [courseId]
  );
  const course = courseRes.rows[0];
  if (!course) notFound();

  const [postsRes, teachersRes, dmsRes] = await Promise.all([
    query<{ id: string; author_name: string; body: string; created_at: Date }>(
      `SELECT d.id, u.full_name AS author_name, d.body, d.created_at
       FROM course_discussions d JOIN users u ON u.id = d.author_id
       WHERE d.course_id = $1 ORDER BY d.created_at DESC LIMIT 40`,
      [courseId]
    ),
    query<{ id: string; full_name: string; email: string }>(
      `SELECT u.id, u.full_name, u.email
       FROM course_teachers ct JOIN users u ON u.id = ct.teacher_id
       WHERE ct.course_id = $1`,
      [courseId]
    ),
    query<{ id: string; sender_name: string; recipient_name: string; body: string; created_at: Date }>(
      `SELECT m.id, s.full_name AS sender_name, r.full_name AS recipient_name, m.body, m.created_at
       FROM direct_messages m
       JOIN users s ON s.id = m.sender_id
       JOIN users r ON r.id = m.recipient_id
       WHERE m.course_id = $1 AND (m.sender_id = $2 OR m.recipient_id = $2)
       ORDER BY m.created_at DESC LIMIT 30`,
      [courseId, user.id]
    ),
  ]);

  return (
    <AppShell user={user} locale={locale} activePortal="learn">
      <div className="stack">
        <div className="row">
          <Link href={`/learn/courses/${courseId}`} className="btn">
            ← {locale === "es" ? "Volver al curso" : "Back to course"}
          </Link>
        </div>
        <CourseInteractionsClient
          course={course}
          posts={postsRes.rows.map((p) => ({ ...p, created_at: p.created_at.toISOString() }))}
          recipients={teachersRes.rows}
          messages={dmsRes.rows.map((m) => ({ ...m, created_at: m.created_at.toISOString() }))}
          locale={locale}
        />
      </div>
    </AppShell>
  );
}
