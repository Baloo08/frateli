"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";

interface CourseRow {
  id: string;
  slug: string;
  title_es: string;
  title_en: string;
  status: string;
  passing_grade_pct: string;
}

interface TeacherOption {
  id: string;
  full_name: string;
  email: string;
}

export function AdminCoursesClient({
  initialCourses,
  teachers,
  locale,
}: {
  initialCourses: CourseRow[];
  teachers: TeacherOption[];
  locale: Locale;
}) {
  const router = useRouter();
  const isEs = locale === "es";
  const [titleEs, setTitleEs] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [slug, setSlug] = useState("");
  const [descriptionEs, setDescriptionEs] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [teacherId, setTeacherId] = useState(teachers[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const normalizedSlug =
        slug.trim() ||
        titleEs
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: normalizedSlug,
          titleEs,
          titleEn: titleEn || titleEs,
          descriptionEs,
          descriptionEn: descriptionEn || descriptionEs,
          teacherId: teacherId || undefined,
          publishNow: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create course");
        return;
      }
      setTitleEs("");
      setTitleEn("");
      setSlug("");
      setDescriptionEs("");
      setDescriptionEn("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(courseId: string, status: "published" | "archived" | "draft") {
    await fetch("/api/admin/courses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, status }),
    });
    router.refresh();
  }

  return (
    <div className="stack">
      <section className="card stack">
        <h1>{isEs ? "Habilitación y Gestión de Cursos" : "Course Governance"}</h1>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form onSubmit={handleCreate} className="grid-2">
          <div className="field">
            <label htmlFor="c-tes">{isEs ? "Título (Español)" : "Title (Spanish)"}</label>
            <input id="c-tes" required value={titleEs} onChange={(e) => setTitleEs(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-ten">{isEs ? "Título (Inglés)" : "Title (English)"}</label>
            <input id="c-ten" required value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-slug">Slug URL</label>
            <input id="c-slug" placeholder="ej-curso-marketing" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-teacher">{isEs ? "Docente asignado" : "Assigned teacher"}</label>
            <select id="c-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">{isEs ? "Sin asignar aún" : "Unassigned"}</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} ({t.email})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-des">{isEs ? "Descripción (ES)" : "Description (ES)"}</label>
            <textarea id="c-des" required value={descriptionEs} onChange={(e) => setDescriptionEs(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-den">{isEs ? "Descripción (EN)" : "Description (EN)"}</label>
            <textarea id="c-den" required value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} />
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? (isEs ? "Creando..." : "Creating...") : isEs ? "Crear y habilitar curso" : "Create & Enable Course"}
            </button>
          </div>
        </form>
      </section>

      <div className="table-wrapper" tabIndex={0} role="region" aria-labelledby="courses-cap">
        <table>
          <caption id="courses-cap">{isEs ? "Cursos registrados" : "Courses"}</caption>
          <thead>
            <tr>
              <th scope="col">{isEs ? "Curso" : "Course"}</th>
              <th scope="col">{isEs ? "Estado" : "Status"}</th>
              <th scope="col">{isEs ? "Nota mín." : "Passing"}</th>
              <th scope="col">{isEs ? "Acciones" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {initialCourses.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{isEs ? c.title_es : c.title_en}</strong>
                  <div className="hint">{c.slug}</div>
                </td>
                <td><span className="badge">{c.status}</span></td>
                <td>{c.passing_grade_pct}%</td>
                <td>
                  <div className="row">
                    <Link href={`/teach/courses/${c.id}`} className="btn">
                      {isEs ? "Editar contenido" : "Edit content"}
                    </Link>
                    {c.status !== "published" ? (
                      <button type="button" className="btn btn-primary" onClick={() => updateStatus(c.id, "published")}>
                        {isEs ? "Habilitar" : "Publish"}
                      </button>
                    ) : (
                      <button type="button" className="btn" onClick={() => updateStatus(c.id, "archived")}>
                        {isEs ? "Archivar" : "Archive"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
