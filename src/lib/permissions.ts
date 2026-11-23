import { query } from "./db";
import type { SessionUser } from "./auth";

export async function canManageCourse(user: SessionUser, courseId: string): Promise<boolean> {
  if (user.role === "superadmin") return true;
  if (user.role !== "teacher") return false;
  const res = await query(
    `SELECT 1 FROM course_teachers WHERE course_id = $1 AND teacher_id = $2 LIMIT 1`,
    [courseId, user.id]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function canAccessCourseAsStudent(user: SessionUser, courseId: string): Promise<boolean> {
  if (user.role === "superadmin") return true;
  if (user.role === "teacher") {
    return canManageCourse(user, courseId);
  }
  const res = await query(
    `SELECT 1 FROM enrollments WHERE course_id = $1 AND student_id = $2 AND status <> 'dropped' LIMIT 1`,
    [courseId, user.id]
  );
  return (res.rowCount ?? 0) > 0;
}
