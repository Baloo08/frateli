"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n";
import { NapkinVisualDiagram, type VisualAidView } from "./NapkinVisualDiagram";

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
  support_md_es: string | null;
  support_md_en: string | null;
  visual_aids: VisualAidView[];
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

interface EasyPracticeItem {
  questionType: "single_choice" | "true_false" | "short_answer";
  promptEs: string;
  options: string[];
  correctAnswer: number | string;
  explanationEs: string;
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
  initialSuggestedLessonId,
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
  initialSuggestedLessonId: string | null;
  locale: Locale;
}) {
  const router = useRouter();
  const isEs = locale === "es";

  const initialLesson =
    lessons.find((l) => l.id === initialSuggestedLessonId) || lessons[0] || null;

  const [modEs, setModEs] = useState("");
  const [modEn, setModEn] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState(modules[0]?.id || "");
  const [lessonTitleEs, setLessonTitleEs] = useState("");
  const [lessonTitleEn, setLessonTitleEn] = useState("");
  const [lessonMdEs, setLessonMdEs] = useState("");
  const [lessonMdEn, setLessonMdEn] = useState("");
  const [targetLessonId, setTargetLessonId] = useState(initialLesson?.id || "");

  // Post-video-upload suggestion state
  const [suggestedLessonId, setSuggestedLessonId] = useState<string | null>(
    initialSuggestedLessonId || (initialLesson?.video_asset_id ? initialLesson.id : null)
  );
  const [aiTopicHint, setAiTopicHint] = useState("");
  const [easyModeTab, setEasyModeTab] = useState<"support" | "practice">("support");

  // Manual Easy Support & Napkin Diagram Builder state
  const activeTargetLesson = lessons.find((l) => l.id === targetLessonId) || null;
  const [supportMdEs, setSupportMdEs] = useState(activeTargetLesson?.support_md_es || "");
  const [supportMdEn, setSupportMdEn] = useState(activeTargetLesson?.support_md_en || "");
  const [diagTitle, setDiagTitle] = useState("");
  const [diagKind, setDiagKind] = useState<"flow" | "pillars" | "cycle">("flow");
  const [diagCaption, setDiagCaption] = useState("");
  const [diagNodes, setDiagNodes] = useState([
    { label: "Concepto 1", detail: "Idea clave" },
    { label: "Concepto 2", detail: "Aplicación" },
    { label: "Concepto 3", detail: "Resultado" },
  ]);

  // Manual Easy Practice Builder state
  const [practiceTitle, setPracticeTitle] = useState("");
  const [practiceType, setPracticeType] = useState<"practice" | "graded">("practice");
  const [practiceItems, setPracticeItems] = useState<EasyPracticeItem[]>([
    {
      questionType: "single_choice",
      promptEs: "",
      options: ["Opción A", "Opción B", "Opción C"],
      correctAnswer: 0,
      explanationEs: "",
    },
  ]);

  // General AI & Google Workspace state
  const [aiTopic, setAiTopic] = useState("");
  const [aiSlideOutline, setAiSlideOutline] = useState<{ heading: string; bullets: string[] }[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [calTitle, setCalTitle] = useState("");
  const [calStart, setCalStart] = useState("");
  const [calEnd, setCalEnd] = useState("");

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleSelectTargetLesson(newId: string) {
    setTargetLessonId(newId);
    const found = lessons.find((l) => l.id === newId);
    if (found) {
      setSupportMdEs(found.support_md_es || "");
      setSupportMdEn(found.support_md_en || "");
      if (found.video_asset_id) {
        setSuggestedLessonId(found.id);
      }
    }
  }

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

  async function uploadLocalFile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!targetLessonId) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
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
      form.reset();
      if (data.kind === "video") {
        setSuggestedLessonId(targetLessonId);
        setStatusMsg(
          isEs
            ? "¡Video subido! Revisa las sugerencias de IA arriba para crear el texto de apoyo estilo Napkin y la práctica automática."
            : "Video uploaded! Use the AI suggestions above to create Napkin-style study material and automatic practice items."
        );
      } else {
        setStatusMsg(isEs ? "Archivo subido a la lección." : "File uploaded to lesson.");
      }
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload error");
    } finally {
      setBusy(false);
    }
  }

  async function runAiSupportFromVideo(lessonId: string) {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(
      isEs
        ? "Analizando video con Gemini IA y generando guía de apoyo + diagramas estilo Napkin..."
        : "Analyzing video with Gemini AI and generating study guide + Napkin-style diagrams..."
    );
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "video_support_pack",
          courseId: course.id,
          lessonId,
          topicHint: aiTopicHint || undefined,
          locale,
          generateImages: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSupportMdEs(data.pack.supportMdEs);
      setSupportMdEn(data.pack.supportMdEn);
      setStatusMsg(
        isEs
          ? `Texto de apoyo y ${data.pack.visualAids.length} diagramas visuales estilo Napkin guardados en la lección.`
          : `Study guide and ${data.pack.visualAids.length} Napkin-style visual diagrams saved to the lesson.`
      );
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "AI support error");
    } finally {
      setBusy(false);
    }
  }

  async function runAiPracticeFromVideo(lessonId: string) {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(
      isEs
        ? "Analizando video y creando práctica con ítems automáticos..."
        : "Analyzing video and generating automatic practice items..."
    );
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "video_practice_pack",
          courseId: course.id,
          lessonId,
          topicHint: aiTopicHint || undefined,
          questionCount: 5,
          locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatusMsg(
        isEs
          ? `Práctica automática creada ("${data.pack.titleEs}") con ${data.pack.count} ítems.`
          : `Automatic practice created ("${data.pack.titleEn}") with ${data.pack.count} items.`
      );
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "AI practice error");
    } finally {
      setBusy(false);
    }
  }

  async function saveEasySupport(e: React.FormEvent) {
    e.preventDefault();
    if (!targetLessonId) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const visualAids = diagTitle.trim()
        ? [
            {
              titleEs: diagTitle,
              titleEn: diagTitle,
              captionEs: diagCaption,
              captionEn: diagCaption,
              altEs: diagTitle,
              altEn: diagTitle,
              diagramKind: diagKind,
              nodes: diagNodes
                .filter((n) => n.label.trim())
                .map((n) => ({
                  labelEs: n.label,
                  labelEn: n.label,
                  detailEs: n.detail,
                  detailEn: n.detail,
                })),
            },
          ]
        : undefined;

      const res = await fetch(`/api/teach/courses/${course.id}/lessons/${targetLessonId}/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supportMdEs,
          supportMdEn: supportMdEn || supportMdEs,
          visualAids,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatusMsg(
        isEs
          ? "Texto de apoyo y esquema visual guardados correctamente."
          : "Study text and visual diagram saved."
      );
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error saving support material");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDiagramImage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!targetLessonId) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/teach/courses/${course.id}/lessons/${targetLessonId}/support`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      form.reset();
      setStatusMsg(isEs ? "Imagen agregada al material de apoyo." : "Image added to study support.");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload error");
    } finally {
      setBusy(false);
    }
  }

  async function saveEasyPractice(e: React.FormEvent) {
    e.preventDefault();
    if (!practiceTitle.trim() || practiceItems.length === 0) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/teach/courses/${course.id}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_assessment",
          assessmentType: practiceType,
          lessonId: targetLessonId || null,
          titleEs: practiceTitle,
          titleEn: practiceTitle,
          passingScorePct: 70,
          questions: practiceItems.map((item) => ({
            questionType: item.questionType,
            promptEs: item.promptEs,
            promptEn: item.promptEs,
            optionsEs:
              item.questionType === "true_false"
                ? ["Verdadero", "Falso"]
                : item.questionType === "short_answer"
                ? []
                : item.options,
            optionsEn:
              item.questionType === "true_false"
                ? ["True", "False"]
                : item.questionType === "short_answer"
                ? []
                : item.options,
            correctAnswer: item.correctAnswer,
            explanationEs: item.explanationEs,
            explanationEn: item.explanationEs,
            points: 1,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPracticeTitle("");
      setPracticeItems([
        {
          questionType: "single_choice",
          promptEs: "",
          options: ["Opción A", "Opción B", "Opción C"],
          correctAnswer: 0,
          explanationEs: "",
        },
      ]);
      setStatusMsg(
        isEs
          ? "Práctica / evaluación guardada y publicada para estudiantes."
          : "Practice / assessment saved and published to students."
      );
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Practice error");
    } finally {
      setBusy(false);
    }
  }

  async function generateAiLesson() {
    if (!aiTopic.trim()) return;
    setBusy(true);
    setErrorMsg(null);
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
      setStatusMsg(isEs ? "Borrador bilingüe generado con Gemini IA." : "Bilingual draft generated with Gemini AI.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "AI error");
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
      setErrorMsg(err instanceof Error ? err.message : "Drive error");
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
      setStatusMsg(`Google Doc: ${data.webViewLink}`);
      router.refresh();
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
      setStatusMsg(`Google Slides: ${data.webViewLink}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function scheduleSession(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
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
      if (res.ok) {
        setCalTitle("");
        setStatusMsg(isEs ? "Sesión agendada en Google Calendar." : "Session scheduled.");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const suggestedLesson = lessons.find((l) => l.id === suggestedLessonId) || activeTargetLesson;

  return (
    <div className="stack">
      <section className="card">
        <h1>{isEs ? course.title_es : course.title_en}</h1>
        <div aria-live="polite">
          {errorMsg && <div className="alert alert-error" role="alert">{errorMsg}</div>}
          {statusMsg && <div className="alert alert-success">{statusMsg}</div>}
        </div>
      </section>

      {/* Post-Video AI Suggestions Banner */}
      {suggestedLesson && (
        <section
          className="card stack"
          style={{ border: "2px solid var(--brand)", background: "#EFF6FF" }}
          aria-label={isEs ? "Sugerencias inteligentes para el video" : "Smart suggestions for your video"}
        >
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, color: "#0F172A" }}>
              {isEs
                ? `Sugerencias para la lección: "${suggestedLesson.title_es}"`
                : `Suggestions for lesson: "${suggestedLesson.title_en}"`}
            </h2>
            <span className="badge badge-success">
              {suggestedLesson.video_asset_id
                ? isEs
                  ? "Video listo"
                  : "Video ready"
                : isEs
                ? "Lección activa"
                : "Active lesson"}
            </span>
          </div>
          <p style={{ margin: 0, color: "#334155" }}>
            {isEs
              ? "Tras subir o grabar el video, puedes pedirle a la IA (usando la clave BYOK configurada por el superadmin) que genere automáticamente el material de apoyo visual estilo Napkin y las prácticas interactivas, o crearlos tú mismo en Modo Fácil."
              : "After uploading or recording your video, ask AI (via Superadmin BYOK key) to generate Napkin-style visual study support and automatic practice items, or build them easily yourself."}
          </p>

          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="ai-hint" style={{ color: "#0F172A" }}>
              {isEs ? "Enfoque o instrucciones opcionales para la IA" : "Optional topic focus for AI"}
            </label>
            <input
              id="ai-hint"
              value={aiTopicHint}
              onChange={(e) => setAiTopicHint(e.target.value)}
              placeholder={isEs ? "Ej. Enfatizar los 3 pasos prácticos y nivel principiante..." : "E.g. Focus on beginner takeaways..."}
            />
          </div>

          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !aiConfigured}
              onClick={() => runAiSupportFromVideo(suggestedLesson.id)}
            >
              {isEs
                ? "IA: Crear texto de apoyo + imágenes estilo Napkin"
                : "AI: Create study text + Napkin-style visuals"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !aiConfigured}
              onClick={() => runAiPracticeFromVideo(suggestedLesson.id)}
            >
              {isEs
                ? "IA: Crear práctica con ítems automáticos"
                : "AI: Create practice with auto items"}
            </button>
            <a href="#constructor-facil" className="btn">
              {isEs ? "Crear manualmente (Modo fácil)" : "Create manually (Easy mode)"}
            </a>
          </div>
          {!aiConfigured && (
            <span className="hint" style={{ color: "#B45309" }}>
              {isEs
                ? "Nota: El superadministrador aún no configura la clave BYOK de Gemini en /admin/resources; puedes usar el Modo Fácil manual aquí abajo."
                : "Note: Superadmin has not configured the BYOK Gemini key in /admin/resources yet; you can still use the Easy Manual Builder below."}
            </span>
          )}
        </section>
      )}

      {/* Upload Video / Resource + Drive Import */}
      <section className="grid-2">
        <div className="card stack">
          <h2>{isEs ? "Subir video o archivo a la lección" : "Upload Video or File to Lesson"}</h2>
          <div className="field">
            <label htmlFor="res-lesson">{isEs ? "Lección destino" : "Target lesson"}</label>
            <select
              id="res-lesson"
              value={targetLessonId}
              onChange={(e) => handleSelectTargetLesson(e.target.value)}
            >
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>{isEs ? l.title_es : l.title_en}</option>
              ))}
            </select>
          </div>

          <form onSubmit={uploadLocalFile} className="stack">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="up-file">
                {isEs ? "Subir video (MP4/WebM) o material (PDF/DOCX)" : "Upload video (MP4/WebM) or file"}
              </label>
              <input id="up-file" name="file" type="file" required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !targetLessonId}>
              {isEs ? "Subir a lección" : "Upload to lesson"}
            </button>
          </form>

          <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)" }} />

          <div className="stack">
            <button type="button" className="btn" onClick={fetchDriveFiles} disabled={busy || !googleConnected}>
              {googleConnected
                ? isEs
                  ? "Importar desde Google Drive"
                  : "Import from Google Drive"
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
                        {isEs ? "Importar" : "Import"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Easy Manual Builder ("Modo Fácil") */}
        <div id="constructor-facil" className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0 }}>{isEs ? "Modo Fácil (Creación Manual)" : "Easy Manual Builder"}</h2>
            <div className="row" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={easyModeTab === "support"}
                className={`btn ${easyModeTab === "support" ? "btn-primary" : ""}`}
                onClick={() => setEasyModeTab("support")}
              >
                {isEs ? "Texto + Diagrama Napkin" : "Text + Napkin Diagram"}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={easyModeTab === "practice"}
                className={`btn ${easyModeTab === "practice" ? "btn-primary" : ""}`}
                onClick={() => setEasyModeTab("practice")}
              >
                {isEs ? "Práctica (Ítems)" : "Practice (Items)"}
              </button>
            </div>
          </div>

          {easyModeTab === "support" ? (
            <div className="stack">
              <form onSubmit={saveEasySupport} className="stack">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="easy-sup-es">{isEs ? "Texto de apoyo (ES)" : "Study support text (ES)"}</label>
                  <textarea
                    id="easy-sup-es"
                    value={supportMdEs}
                    onChange={(e) => setSupportMdEs(e.target.value)}
                    placeholder={isEs ? "Resumen claro, puntos clave y ejemplos para tus estudiantes..." : "Clear summary and takeaways..."}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="easy-sup-en">{isEs ? "Texto de apoyo (EN, opcional)" : "Study support text (EN, optional)"}</label>
                  <textarea
                    id="easy-sup-en"
                    value={supportMdEn}
                    onChange={(e) => setSupportMdEn(e.target.value)}
                  />
                </div>

                <fieldset style={{ border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "12px" }}>
                  <legend style={{ fontWeight: 700 }}>
                    {isEs ? "Agregar diagrama visual estilo Napkin (opcional)" : "Add Napkin-style visual diagram (optional)"}
                  </legend>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor="diag-t">{isEs ? "Título del esquema" : "Diagram title"}</label>
                      <input id="diag-t" value={diagTitle} onChange={(e) => setDiagTitle(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="diag-k">{isEs ? "Estilo visual" : "Visual layout"}</label>
                      <select id="diag-k" value={diagKind} onChange={(e) => setDiagKind(e.target.value as "flow" | "pillars" | "cycle")}>
                        <option value="flow">{isEs ? "Flujo paso a paso" : "Step-by-step flow"}</option>
                        <option value="pillars">{isEs ? "Pilares clave" : "Key pillars"}</option>
                        <option value="cycle">{isEs ? "Ciclo iterativo" : "Cycle"}</option>
                      </select>
                    </div>
                  </div>
                  <div className="stack" style={{ gap: "8px" }}>
                    {diagNodes.map((n, idx) => (
                      <div key={idx} className="row">
                        <input
                          aria-label={`Nodo ${idx + 1} título`}
                          value={n.label}
                          onChange={(e) => {
                            const copy = [...diagNodes];
                            copy[idx] = { ...copy[idx], label: e.target.value };
                            setDiagNodes(copy);
                          }}
                          style={{ flex: 1, minHeight: "38px", padding: "6px 10px" }}
                        />
                        <input
                          aria-label={`Nodo ${idx + 1} detalle`}
                          value={n.detail}
                          onChange={(e) => {
                            const copy = [...diagNodes];
                            copy[idx] = { ...copy[idx], detail: e.target.value };
                            setDiagNodes(copy);
                          }}
                          style={{ flex: 2, minHeight: "38px", padding: "6px 10px" }}
                        />
                      </div>
                    ))}
                    <div className="row">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setDiagNodes([...diagNodes, { label: `Concepto ${diagNodes.length + 1}`, detail: "" }])}
                      >
                        + {isEs ? "Agregar bloque" : "Add block"}
                      </button>
                    </div>
                  </div>
                  <div className="field" style={{ marginTop: "10px", marginBottom: 0 }}>
                    <label htmlFor="diag-cap">{isEs ? "Pie de esquema" : "Caption"}</label>
                    <input id="diag-cap" value={diagCaption} onChange={(e) => setDiagCaption(e.target.value)} />
                  </div>
                </fieldset>

                <button type="submit" className="btn btn-primary" disabled={busy || !targetLessonId}>
                  {isEs ? "Guardar apoyo y esquema" : "Save support & diagram"}
                </button>
              </form>

              <form onSubmit={uploadDiagramImage} className="row">
                <input name="image" type="file" accept="image/*" required />
                <button type="submit" className="btn" disabled={busy || !targetLessonId}>
                  {isEs ? "Subir imagen propia" : "Upload custom image"}
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={saveEasyPractice} className="stack">
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="ep-title">{isEs ? "Título de la práctica" : "Practice title"}</label>
                  <input id="ep-title" required value={practiceTitle} onChange={(e) => setPracticeTitle(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="ep-type">{isEs ? "Modalidad" : "Mode"}</label>
                  <select id="ep-type" value={practiceType} onChange={(e) => setPracticeType(e.target.value as "practice" | "graded")}>
                    <option value="practice">{isEs ? "Práctica con feedback inmediato" : "Practice with instant feedback"}</option>
                    <option value="graded">{isEs ? "Evaluación calificada" : "Graded assessment"}</option>
                  </select>
                </div>
              </div>

              {practiceItems.map((item, idx) => (
                <fieldset key={idx} style={{ border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "12px" }}>
                  <legend style={{ fontWeight: 700 }}>{isEs ? `Ítem ${idx + 1}` : `Item ${idx + 1}`}</legend>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor={`it-type-${idx}`}>{isEs ? "Tipo" : "Type"}</label>
                      <select
                        id={`it-type-${idx}`}
                        value={item.questionType}
                        onChange={(e) => {
                          const copy = [...practiceItems];
                          const nextType = e.target.value as EasyPracticeItem["questionType"];
                          copy[idx] = {
                            ...copy[idx],
                            questionType: nextType,
                            correctAnswer: nextType === "short_answer" ? "" : 0,
                          };
                          setPracticeItems(copy);
                        }}
                      >
                        <option value="single_choice">{isEs ? "Opción única" : "Multiple choice"}</option>
                        <option value="true_false">{isEs ? "Verdadero / Falso" : "True / False"}</option>
                        <option value="short_answer">{isEs ? "Respuesta corta" : "Short answer"}</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`it-prompt-${idx}`}>{isEs ? "Pregunta / Consigna" : "Prompt"}</label>
                      <input
                        id={`it-prompt-${idx}`}
                        required
                        value={item.promptEs}
                        onChange={(e) => {
                          const copy = [...practiceItems];
                          copy[idx] = { ...copy[idx], promptEs: e.target.value };
                          setPracticeItems(copy);
                        }}
                      />
                    </div>
                  </div>

                  {item.questionType === "single_choice" && (
                    <div className="stack" style={{ gap: "6px" }}>
                      {item.options.map((opt, oIdx) => (
                        <div key={oIdx} className="row">
                          <input
                            type="radio"
                            name={`correct-${idx}`}
                            checked={item.correctAnswer === oIdx}
                            onChange={() => {
                              const copy = [...practiceItems];
                              copy[idx] = { ...copy[idx], correctAnswer: oIdx };
                              setPracticeItems(copy);
                            }}
                            aria-label={`Marcar opción ${oIdx + 1} como correcta`}
                          />
                          <input
                            value={opt}
                            onChange={(e) => {
                              const copy = [...practiceItems];
                              const opts = [...copy[idx].options];
                              opts[oIdx] = e.target.value;
                              copy[idx] = { ...copy[idx], options: opts };
                              setPracticeItems(copy);
                            }}
                            style={{ flex: 1, minHeight: "38px", padding: "6px 10px" }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {item.questionType === "true_false" && (
                    <div className="row">
                      <label className="row">
                        <input
                          type="radio"
                          name={`tf-${idx}`}
                          checked={item.correctAnswer === 0}
                          onChange={() => {
                            const copy = [...practiceItems];
                            copy[idx] = { ...copy[idx], correctAnswer: 0 };
                            setPracticeItems(copy);
                          }}
                        />
                        <span>{isEs ? "Verdadero" : "True"}</span>
                      </label>
                      <label className="row">
                        <input
                          type="radio"
                          name={`tf-${idx}`}
                          checked={item.correctAnswer === 1}
                          onChange={() => {
                            const copy = [...practiceItems];
                            copy[idx] = { ...copy[idx], correctAnswer: 1 };
                            setPracticeItems(copy);
                          }}
                        />
                        <span>{isEs ? "Falso" : "False"}</span>
                      </label>
                    </div>
                  )}

                  <div className="field" style={{ marginTop: "8px", marginBottom: 0 }}>
                    <label htmlFor={`it-exp-${idx}`}>{isEs ? "Explicación automática para el alumno" : "Auto-feedback explanation"}</label>
                    <input
                      id={`it-exp-${idx}`}
                      value={item.explanationEs}
                      onChange={(e) => {
                        const copy = [...practiceItems];
                        copy[idx] = { ...copy[idx], explanationEs: e.target.value };
                        setPracticeItems(copy);
                      }}
                    />
                  </div>
                </fieldset>
              ))}

              <div className="row">
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    setPracticeItems([
                      ...practiceItems,
                      {
                        questionType: "single_choice",
                        promptEs: "",
                        options: ["Opción A", "Opción B", "Opción C"],
                        correctAnswer: 0,
                        explanationEs: "",
                      },
                    ])
                  }
                >
                  + {isEs ? "Agregar ítem" : "Add item"}
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {isEs ? "Guardar y publicar práctica" : "Save & publish practice"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Preview of active lesson's Napkin diagrams */}
      {activeTargetLesson && activeTargetLesson.visual_aids.length > 0 && (
        <section className="card stack">
          <h2>{isEs ? "Vista previa de diagramas de apoyo en la lección" : "Lesson Visual Aids Preview"}</h2>
          <div className="grid-2">
            {activeTargetLesson.visual_aids.map((aid) => (
              <NapkinVisualDiagram key={aid.id} aid={aid} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {/* AI Lesson Draft + Google Docs/Slides */}
      <section className="card stack">
        <h2>{isEs ? "Generador de Lección Completa con IA + Google Docs/Slides" : "AI Full Lesson Draft + Google Docs/Slides"}</h2>
        <div className="row">
          <input
            aria-label={isEs ? "Tema de la nueva lección" : "New lesson topic"}
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            placeholder={isEs ? "Tema de la lección..." : "Lesson topic..."}
            style={{ flex: 1, minHeight: "44px", padding: "8px 12px" }}
          />
          <button type="button" className="btn btn-primary" disabled={busy || !aiConfigured} onClick={generateAiLesson}>
            {isEs ? "Generar borrador bilingüe IA" : "Generate AI bilingual draft"}
          </button>
        </div>
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
          <h2>{isEs ? "2. Crear lección" : "2. Create Lesson"}</h2>
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
                        {l.video_asset_id && <span className="badge badge-success">Video</span>}
                        {l.visual_aids.length > 0 && (
                          <span className="badge badge-success">{l.visual_aids.length} Napkin</span>
                        )}
                      </div>
                      <div className="row">
                        <button type="button" className="btn" onClick={() => handleSelectTargetLesson(l.id)}>
                          {isEs ? "Gestionar apoyo" : "Manage support"}
                        </button>
                        <button type="button" className="btn" disabled={idx === 0} onClick={() => moveLesson(l.id, "up")}>↑</button>
                        <button type="button" className="btn" disabled={idx === modLessons.length - 1} onClick={() => moveLesson(l.id, "down")}>↓</button>
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

      {/* Google Calendar & Resources */}
      <section className="grid-2">
        <div className="card stack">
          <h2>{isEs ? "Recursos vinculados" : "Attached resources"}</h2>
          {resources.length === 0 ? (
            <p className="hint">{isEs ? "Sin recursos adjuntos aún." : "No resources yet."}</p>
          ) : (
            <ul>
              {resources.map((r) => (
                <li key={r.id}>
                  {isEs ? r.title_es : r.title_en} <span className="badge">{r.source_provider}</span>
                </li>
              ))}
            </ul>
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
                  {ev.meet_link && <> — <a href={ev.meet_link} target="_blank" rel="noreferrer">Meet</a></>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
