"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";

interface ModuleItem {
  id: string;
  title_es: string;
  title_en: string;
  sort_order: number;
}

interface LessonItem {
  id: string;
  module_id: string;
  lesson_type: string;
  title_es: string;
  title_en: string;
  sort_order: number;
  video_asset_id: string | null;
}

interface ResourceItem {
  id: string;
  lesson_id: string;
  title_es: string;
  title_en: string;
  source_provider: string;
  external_web_url: string | null;
}

interface CalendarEventItem {
  id: string;
  title: string;
  starts_at: string;
  meet_link: string | null;
  html_link: string | null;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export function TeacherCourseClient({
  course,
  modules,
  lessons,
  resources,
  calendarEvents,
  aiConfigured,
  googleConnected,
  canStudio,
  locale,
}: {
  course: { id: string; title_es: string; title_en: string };
  modules: ModuleItem[];
  lessons: LessonItem[];
  resources: ResourceItem[];
  calendarEvents: CalendarEventItem[];
  aiConfigured: boolean;
  googleConnected: boolean;
  canStudio: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const isEs = locale === "es";

  const [modEs, setModEs] = useState("");
  const [modEn, setModEn] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState(modules[0]?.id || "");
  const [lessonTitleEs, setLessonTitleEs] = useState("");
  const [lessonTitleEn, setLessonTitleEn] = useState("");
  const [lessonMdEs, setLessonMdEs] = useState("");
  const [lessonMdEn, setLessonMdEn] = useState("");
  const [targetLessonId, setTargetLessonId] = useState(lessons[0]?.id || "");

  // AI assistant state
  const [aiTopic, setAiTopic] = useState("");
  const [aiSlideOutline, setAiSlideOutline] = useState<{ heading: string; bullets: string[] }[]>([]);
  const [aiQuizPreview, setAiQuizPreview] = useState<{
    titleEs: string;
    titleEn: string;
    questions: {
      questionType: "single_choice" | "true_false" | "short_answer";
      promptEs: string;
      promptEn: string;
      optionsEs: string[];
      optionsEn: string[];
      correctIndex: number | null;
      correctText: string | null;
      explanationEs: string;
      explanationEn: string;
    }[];
  } | null>(null);

  // Google Drive browser & Calendar
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [calTitle, setCalTitle] = useState("");
  const [calStart, setCalStart] = useState("");
  const [calEnd, setCalEnd] = useState("");

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addModule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/teach/courses/${course.id}/curriculum`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_module", titleEs: modEs, titleEn: modEn || modEs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setModEs("");
      setModEn("");
      if (!selectedModuleId) setSelectedModuleId(data.moduleId);
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function addLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedModuleId) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/teach/courses/${course.id}/curriculum`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_lesson",
          moduleId: selectedModuleId,
          lessonType: "article",
          titleEs: lessonTitleEs,
          titleEn: lessonTitleEn || lessonTitleEs,
          contentMdEs: lessonMdEs,
          contentMdEn: lessonMdEn || lessonMdEs,
          contentLocale: locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLessonTitleEs("");
      setLessonTitleEn("");
      setLessonMdEs("");
      setLessonMdEn("");
      setTargetLessonId(data.lessonId);
      setStatusMsg(isEs ? "Lección creada." : "Lesson created.");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function moveLesson(lessonId: string, direction: "up" | "down") {
    await fetch(`/api/teach/courses/${course.id}/curriculum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move_lesson", lessonId, direction }),
    });
    router.refresh();
  }

  async function generateAiLesson() {
    if (!aiTopic.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "lesson", courseId: course.id, topic: aiTopic, locale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLessonTitleEs(data.draft.titleEs);
      setLessonTitleEn(data.draft.titleEn);
      setLessonMdEs(data.draft.contentMdEs);
      setLessonMdEn(data.draft.contentMdEn);
      setAiSlideOutline(data.draft.slideOutline || []);
      setStatusMsg(
        isEs
          ? "Borrador bilingüe generado con Gemini IA. Puedes guardarlo como lección o exportarlo a Google Docs/Slides."
          : "Bilingual draft generated with Gemini AI. Save it as a lesson or export to Google Docs/Slides."
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "AI error");
    } finally {
      setBusy(false);
    }
  }

  async function generateAiQuiz() {
    if (!aiTopic.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "quiz", courseId: course.id, topic: aiTopic, questionCount: 5, locale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiQuizPreview(data.draft);
      setStatusMsg(isEs ? "Evaluación generada con IA lista para publicar." : "AI quiz draft ready to publish.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "AI error");
    } finally {
      setBusy(false);
    }
  }

  async function publishAiQuiz() {
    if (!aiQuizPreview) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/teach/courses/${course.id}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_assessment",
          titleEs: aiQuizPreview.titleEs,
          titleEn: aiQuizPreview.titleEn,
          passingScorePct: 70,
          questions: aiQuizPreview.questions.map((q) => ({
            questionType: q.questionType,
            promptEs: q.promptEs,
            promptEn: q.promptEn,
            optionsEs: q.optionsEs,
            optionsEn: q.optionsEn,
            correctAnswer: q.questionType === "short_answer" ? q.correctText : q.correctIndex,
            explanationEs: q.explanationEs,
            explanationEn: q.explanationEn,
            points: 1,
          })),
        }),
      });
      if (res.ok) {
        setAiQuizPreview(null);
        setStatusMsg(isEs ? "Evaluación publicada en el curso." : "Assessment published to course.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function uploadLocalFile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!targetLessonId) return;
    const formData = new FormData(e.currentTarget);
    formData.set("lessonId", targetLessonId);
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/teach/courses/${course.id}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatusMsg(isEs ? "Archivo subido a la lección." : "File uploaded to lesson.");
      e.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload error");
    } finally {
      setBusy(false);
    }
  }

  async function fetchDriveFiles() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/integrations/google/drive");
      const data = await res.json();
      if (!data.connected) {
        setErrorMsg(isEs ? "Conecta Google Drive en /admin/resources." : "Connect Google Drive in /admin/resources.");
        return;
      }
      setDriveFiles(data.files || []);
    } finally {
      setBusy(false);
    }
  }

  async function importFromDrive(fileId: string) {
    if (!targetLessonId) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/integrations/google/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import_file", lessonId: targetLessonId, fileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatusMsg(isEs ? `Importado desde Drive: ${data.fileName}` : `Imported from Drive: ${data.fileName}`);
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Drive import error");
    } finally {
      setBusy(false);
    }
  }

  async function exportToGoogleDoc() {
    if (!targetLessonId || !lessonTitleEs) return;
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/google/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_doc",
          lessonId: targetLessonId,
          title: isEs ? lessonTitleEs : lessonTitleEn,
          bodyText: isEs ? lessonMdEs : lessonMdEn,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatusMsg(isEs ? `Google Doc creado: ${data.webViewLink}` : `Google Doc created: ${data.webViewLink}`);
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Google Docs error");
    } finally {
      setBusy(false);
    }
  }

  async function exportToGoogleSlides() {
    if (!targetLessonId || aiSlideOutline.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/google/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_slides",
          lessonId: targetLessonId,
          title: lessonTitleEs || aiTopic,
          slides: aiSlideOutline,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatusMsg(isEs ? `Google Slides creado: ${data.webViewLink}` : `Google Slides created: ${data.webViewLink}`);
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Google Slides error");
    } finally {
      setBusy(false);
    }
  }

  async function scheduleSession(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/integrations/google/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule_calendar",
          courseId: course.id,
          summary: calTitle,
          startIso: new Date(calStart).toISOString(),
          endIso: new Date(calEnd).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCalTitle("");
      setStatusMsg(isEs ? "Sesión agendada en Google Calendar." : "Session scheduled in Google Calendar.");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Calendar error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>{isEs ? course.title_es : course.title_en}</h1>
        <div aria-live="polite">
          {errorMsg && <div className="alert alert-error" role="alert">{errorMsg}</div>}
          {statusMsg && <div className="alert alert-success">{statusMsg}</div>}
        </div>
      </section>

      {/* AI + Google Authoring Bar */}
      <section className="card stack">
        <h2>{isEs ? "Asistente IA (Gemini) + Herramientas de Google" : "Gemini AI Assistant + Google Tools"}</h2>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="ai-topic">
            {isEs ? "Tema de la lección o evaluación a generar con IA" : "Topic for AI lesson or quiz generation"}
          </label>
          <input
            id="ai-topic"
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            placeholder={isEs ? "Ej. Principios de Diseño Universal en la Web" : "E.g. Universal Design Principles for the Web"}
          />
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={busy || !aiConfigured} onClick={generateAiLesson}>
            {isEs ? "Generar lección bilingüe + esquema Slides" : "Generate bilingual lesson + Slides outline"}
          </button>
          <button type="button" className="btn" disabled={busy || !aiConfigured} onClick={generateAiQuiz}>
            {isEs ? "Generar Quiz (5 preguntas)" : "Generate Quiz (5 questions)"}
          </button>
          {!aiConfigured && (
            <span className="hint">{isEs ? "Configura GEMINI_API_KEY en EasyPanel." : "Configure GEMINI_API_KEY in EasyPanel."}</span>
          )}
        </div>

        {aiQuizPreview && (
          <div className="card stack" style={{ background: "var(--bg-muted)" }}>
            <strong>{isEs ? aiQuizPreview.titleEs : aiQuizPreview.titleEn}</strong>
            <ol>
              {aiQuizPreview.questions.map((q, idx) => (
                <li key={idx}>{isEs ? q.promptEs : q.promptEn}</li>
              ))}
            </ol>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={publishAiQuiz} disabled={busy}>
                {isEs ? "Publicar evaluación en el curso" : "Publish assessment to course"}
              </button>
              <button type="button" className="btn" onClick={() => setAiQuizPreview(null)}>
                {isEs ? "Descartar" : "Discard"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Curriculum Creation */}
      <section className="grid-2">
        <div className="card stack">
          <h2>{isEs ? "1. Crear módulo" : "1. Create Module"}</h2>
          <form onSubmit={addModule}>
            <div className="field">
              <label htmlFor="m-es">{isEs ? "Título (ES)" : "Title (ES)"}</label>
              <input id="m-es" required value={modEs} onChange={(e) => setModEs(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="m-en">{isEs ? "Título (EN)" : "Title (EN)"}</label>
              <input id="m-en" value={modEn} onChange={(e) => setModEn(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {isEs ? "Agregar módulo" : "Add module"}
            </button>
          </form>
        </div>

        <div className="card stack">
          <h2>{isEs ? "2. Crear lección (manual o desde borrador IA)" : "2. Create Lesson (manual or AI draft)"}</h2>
          <form onSubmit={addLesson}>
            <div className="field">
              <label htmlFor="l-mod">{isEs ? "Módulo" : "Module"}</label>
              <select id="l-mod" value={selectedModuleId} onChange={(e) => setSelectedModuleId(e.target.value)}>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>{isEs ? m.title_es : m.title_en}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="l-tes">{isEs ? "Título lección (ES)" : "Lesson title (ES)"}</label>
              <input id="l-tes" required value={lessonTitleEs} onChange={(e) => setLessonTitleEs(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="l-ten">{isEs ? "Título lección (EN)" : "Lesson title (EN)"}</label>
              <input id="l-ten" value={lessonTitleEn} onChange={(e) => setLessonTitleEn(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="l-mdes">{isEs ? "Contenido Markdown (ES)" : "Markdown content (ES)"}</label>
              <textarea id="l-mdes" value={lessonMdEs} onChange={(e) => setLessonMdEs(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="l-mden">{isEs ? "Contenido Markdown (EN)" : "Markdown content (EN)"}</label>
              <textarea id="l-mden" value={lessonMdEn} onChange={(e) => setLessonMdEn(e.target.value)} />
            </div>
            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={busy || modules.length === 0}>
                {isEs ? "Guardar lección" : "Save lesson"}
              </button>
              {googleConnected && targetLessonId && (
                <>
                  <button type="button" className="btn" onClick={exportToGoogleDoc} disabled={busy || !lessonTitleEs}>
                    {isEs ? "Crear Google Doc" : "Create Google Doc"}
                  </button>
                  {aiSlideOutline.length > 0 && (
                    <button type="button" className="btn" onClick={exportToGoogleSlides} disabled={busy}>
                      {isEs ? "Crear Google Slides" : "Create Google Slides"}
                    </button>
                  )}
                </>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* Curriculum List */}
      <section className="card stack">
        <h2>{isEs ? "Estructura actual del curso" : "Course Curriculum"}</h2>
        {modules.map((m) => {
          const modLessons = lessons.filter((l) => l.module_id === m.id);
          return (
            <div key={m.id} className="card stack" style={{ background: "var(--bg-muted)" }}>
              <h3>{isEs ? m.title_es : m.title_en}</h3>
              {modLessons.length === 0 ? (
                <p className="hint">{isEs ? "Sin lecciones aún." : "No lessons yet."}</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">
                  {modLessons.map((l, idx) => (
                    <li key={l.id} className="card row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <strong>{isEs ? l.title_es : l.title_en}</strong>{" "}
                        <span className="badge">{l.lesson_type}</span>
                        {l.video_asset_id && <span className="badge badge-success">Video listo</span>}
                      </div>
                      <div className="row">
                        <button type="button" className="btn" disabled={idx === 0} onClick={() => moveLesson(l.id, "up")}>
                          ↑
                        </button>
                        <button type="button" className="btn" disabled={idx === modLessons.length - 1} onClick={() => moveLesson(l.id, "down")}>
                          ↓
                        </button>
                        {canStudio && (
                          <Link href={`/studio?courseId=${course.id}&lessonId=${l.id}`} className="btn btn-primary">
                            {isEs ? "Grabar video" : "Record video"}
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      {/* Upload Local + Google Drive Import + Calendar */}
      <section className="grid-2">
        <div className="card stack">
          <h2>{isEs ? "Subir archivo o importar desde Google Drive" : "Upload File or Import from Google Drive"}</h2>
          <div className="field">
            <label htmlFor="res-lesson">{isEs ? "Lección destino" : "Target lesson"}</label>
            <select id="res-lesson" value={targetLessonId} onChange={(e) => setTargetLessonId(e.target.value)}>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>{isEs ? l.title_es : l.title_en}</option>
              ))}
            </select>
          </div>

          <form onSubmit={uploadLocalFile} className="stack">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="up-file">{isEs ? "Subir video (MP4/WebM) o PDF/documento" : "Upload video or PDF/doc"}</label>
              <input id="up-file" name="file" type="file" required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !targetLessonId}>
              {isEs ? "Subir archivo a lección" : "Upload file to lesson"}
            </button>
          </form>

          <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)" }} />

          <div className="stack">
            <button type="button" className="btn" onClick={fetchDriveFiles} disabled={busy || !googleConnected}>
              {googleConnected
                ? isEs
                  ? "Explorar Google Drive para importar"
                  : "Browse Google Drive to import"
                : isEs
                ? "Google Drive no conectado (/admin/resources)"
                : "Google Drive not connected (/admin/resources)"}
            </button>
            {driveFiles.length > 0 && (
              <ul style={{ paddingLeft: "18px" }}>
                {driveFiles.map((f) => (
                  <li key={f.id} style={{ marginBottom: "8px" }}>
                    <span>{f.name}</span>{" "}
                    {f.mimeType !== "application/vnd.google-apps.folder" && (
                      <button
                        type="button"
                        className="btn"
                        style={{ minHeight: "32px", padding: "2px 8px", marginLeft: "8px" }}
                        onClick={() => importFromDrive(f.id)}
                      >
                        {isEs ? "Importar a lección" : "Import to lesson"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {resources.length > 0 && (
            <div>
              <h3>{isEs ? "Recursos vinculados" : "Attached resources"}</h3>
              <ul>
                {resources.map((r) => (
                  <li key={r.id}>
                    {isEs ? r.title_es : r.title_en} <span className="badge">{r.source_provider}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card stack">
          <h2>{isEs ? "Agendar sesión en Google Calendar + Meet" : "Schedule Google Calendar + Meet Session"}</h2>
          <form onSubmit={scheduleSession}>
            <div className="field">
              <label htmlFor="cal-t">{isEs ? "Título de sesión" : "Session title"}</label>
              <input id="cal-t" required value={calTitle} onChange={(e) => setCalTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cal-s">{isEs ? "Inicio" : "Start"}</label>
              <input id="cal-s" type="datetime-local" required value={calStart} onChange={(e) => setCalStart(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cal-e">{isEs ? "Fin" : "End"}</label>
              <input id="cal-e" type="datetime-local" required value={calEnd} onChange={(e) => setCalEnd(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !googleConnected}>
              {isEs ? "Crear evento en Google Calendar" : "Create Google Calendar Event"}
            </button>
          </form>

          {calendarEvents.length > 0 && (
            <ul>
              {calendarEvents.map((ev) => (
                <li key={ev.id}>
                  <strong>{ev.title}</strong> ({ev.starts_at.slice(0, 16).replace("T", " ")})
                  {ev.meet_link && (
                    <> — <a href={ev.meet_link} target="_blank" rel="noreferrer">Meet</a></>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
