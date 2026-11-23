import { query } from "../lib/db";
import { hashPassword } from "../lib/crypto";
import { runMigrations } from "./migrate";

async function seed() {
  await runMigrations();

  const adminPass = await hashPassword("FrateliAdmin2026!");
  const teacherPass = await hashPassword("FrateliTeacher2026!");
  const studentPass = await hashPassword("FrateliStudent2026!");

  const adminRes = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role, status, preferred_locale, video_editor_enabled)
     VALUES ('admin@frateli.edu', $1, 'Superadmin Frateli', 'superadmin', 'active', 'es', true)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [adminPass]
  );
  const adminId = adminRes.rows[0].id;

  const teacherRes = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role, status, preferred_locale, video_editor_enabled, created_by)
     VALUES ('docente@frateli.edu', $1, 'Profa. Sofía Méndez', 'teacher', 'active', 'es', false, $2)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [teacherPass, adminId]
  );
  const teacherId = teacherRes.rows[0].id;

  await query(
    `INSERT INTO teacher_profiles (user_id, bio_es, bio_en, specialty_es, specialty_en, can_publish_courses)
     VALUES ($1, 'Especialista en diseño instruccional.', 'Instructional design specialist.', 'Educación Digital', 'Digital Education', true)
     ON CONFLICT (user_id) DO NOTHING`,
    [teacherId]
  );

  const studentRes = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role, status, preferred_locale, video_editor_enabled, created_by)
     VALUES ('estudiante@frateli.edu', $1, 'Carlos Navarro', 'student', 'active', 'es', false, $2)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [studentPass, adminId]
  );
  const studentId = studentRes.rows[0].id;

  const courseRes = await query<{ id: string }>(
    `INSERT INTO courses (slug, title_es, title_en, description_es, description_en, content_locale, status, passing_grade_pct, created_by, enabled_by, enabled_at)
     VALUES (
       'fundamentos-diseno-accesible',
       'Fundamentos de Diseño Web Accesible',
       'Foundations of Accessible Web Design',
       'Aprende a construir experiencias digitales inclusivas con WCAG 2.1 AA.',
       'Learn to build inclusive digital experiences with WCAG 2.1 AA.',
       'es',
       'published',
       70.00,
       $1,
       $1,
       now()
     )
     ON CONFLICT (slug) DO UPDATE SET status = 'published'
     RETURNING id`,
    [adminId]
  );
  const courseId = courseRes.rows[0].id;

  await query(
    `INSERT INTO course_teachers (course_id, teacher_id, is_primary, assigned_by)
     VALUES ($1, $2, true, $1)
     ON CONFLICT (course_id, teacher_id) DO NOTHING`,
    [courseId, teacherId]
  );

  const modRes = await query<{ id: string }>(
    `INSERT INTO modules (course_id, title_es, title_en, sort_order, is_published)
     VALUES ($1, 'Módulo 1: Principios WCAG', 'Module 1: WCAG Principles', 0, true)
     ON CONFLICT (course_id, sort_order) DO UPDATE SET title_es = EXCLUDED.title_es
     RETURNING id`,
    [courseId]
  );
  const moduleId = modRes.rows[0].id;

  await query(
    `INSERT INTO lessons (module_id, lesson_type, title_es, title_en, content_md_es, content_md_en, content_locale, sort_order, is_published)
     VALUES (
       $1,
       'article',
       'Introducción a los 4 principios POUR',
       'Introduction to the 4 POUR Principles',
       '## Perceptible, Operable, Comprensible y Robusto\n\nLa accesibilidad comienza con HTML semántico y contraste adecuado.',
       '## Perceivable, Operable, Understandable, and Robust\n\nAccessibility starts with semantic HTML and proper contrast.',
       'es',
       0,
       true
     )
     ON CONFLICT (module_id, sort_order) DO NOTHING`,
    [moduleId]
  );

  await query(
    `INSERT INTO enrollments (student_id, course_id, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (student_id, course_id) DO NOTHING`,
    [studentId, courseId]
  );

  console.log("[seed] Demo users and course seeded.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exit(1);
  });
