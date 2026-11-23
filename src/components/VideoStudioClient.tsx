"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n";

export function VideoStudioClient({
  courses,
  lessons,
  recentProjects,
  initialCourseId,
  initialLessonId,
  aiConfigured,
  locale,
}: {
  courses: { id: string; title_es: string; title_en: string }[];
  lessons: { id: string; course_id: string; title_es: string; title_en: string }[];
  recentProjects: { id: string; title: string; status: string; created_at: string }[];
  initialCourseId: string;
  initialLessonId: string;
  aiConfigured: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const isEs = locale === "es";

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [title, setTitle] = useState(isEs ? "Nueva video lección" : "New video lesson");
  const [courseId, setCourseId] = useState(initialCourseId);
  const [lessonId, setLessonId] = useState(initialLessonId);

  const [recordingState, setRecordingState] = useState<"idle" | "previewing" | "recording" | "recorded">("idle");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [trimStartSec, setTrimStartSec] = useState(0);
  const [trimEndSec, setTrimEndSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [vttText, setVttText] = useState("WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nBienvenidos a esta lección de Frateli.\n");

  const [aiTopic, setAiTopic] = useState("");
  const [teleprompter, setTeleprompter] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [publishedTarget, setPublishedTarget] = useState<{ courseId: string; lessonId: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const courseLessons = lessons.filter((l) => l.course_id === courseId);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, [recordedUrl]);

  async function saveChunkToOpfs(blob: Blob) {
    try {
      if (!("storage" in navigator) || !navigator.storage.getDirectory) return;
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle("frateli-studio-recovery.webm", { create: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch {
      // OPFS optional
    }
  }

  async function recoverFromOpfs() {
    try {
      if (!("storage" in navigator) || !navigator.storage.getDirectory) return;
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle("frateli-studio-recovery.webm");
      const file = await handle.getFile();
      if (file.size > 0) {
        loadRecordedBlob(file);
        setStatusMsg(isEs ? "Grabación recuperada desde OPFS." : "Recording recovered from OPFS.");
      }
    } catch {
      setErrorMsg(isEs ? "No hay grabación previa guardada en OPFS." : "No OPFS recovery file found.");
    }
  }

  function loadRecordedBlob(blob: Blob) {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    const url = URL.createObjectURL(blob);
    setRecordedBlob(blob);
    setRecordedUrl(url);
    setRecordingState("recorded");
  }

  async function startCapture(mode: "camera" | "screen") {
    setErrorMsg(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      let stream: MediaStream;
      if (mode === "camera") {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } else {
        const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream = new MediaStream([...display.getVideoTracks(), ...mic.getAudioTracks()]);
        } catch {
          stream = display;
        }
      }
      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
      }
      setRecordingState("previewing");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not access camera/screen");
    }
  }

  function startRecording() {
    if (!streamRef.current) return;
    setErrorMsg(null);
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) {
        chunksRef.current.push(ev.data);
        const partial = new Blob(chunksRef.current, { type: mimeType });
        void saveChunkToOpfs(partial);
      }
    };
    recorder.onstop = () => {
      const fullBlob = new Blob(chunksRef.current, { type: mimeType });
      loadRecordedBlob(fullBlob);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };

    recorderRef.current = recorder;
    recorder.start(3000);
    setRecordingState("recording");
  }

  function stopRecording() {
    recorderRef.current?.stop();
  }

  async function generateScript() {
    if (!aiTopic.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "video_script",
          courseId: courseId || undefined,
          topic: aiTopic,
          durationMinutes: 4,
          locale,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTeleprompter(data.draft.teleprompterScript);
      if (!title || title.startsWith("Nueva") || title.startsWith("New")) {
        setTitle(data.draft.title);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "AI script failed");
    } finally {
      setBusy(false);
    }
  }

  async function publishVideo() {
    if (!recordedBlob) {
      setErrorMsg(isEs ? "Primero graba o carga un video." : "Record or load a video first.");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      // 1. Create project
      const createRes = await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          courseId: courseId || null,
          lessonId: lessonId || null,
          contentLocale: locale,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error);
      const projectId = createData.projectId as string;

      // 2. Init upload
      const initRes = await fetch(`/api/studio/projects/${projectId}/uploads/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: recordedBlob.type || "video/webm",
          fileName: "recording.webm",
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error);

      const edl = {
        schemaVersion: 1,
        trimStartSec,
        trimEndSec: trimEndSec > trimStartSec ? trimEndSec : null,
      };

      // 3. Upload direct S3 presigned or local multipart
      if (initData.uploadMode === "s3_presigned" && initData.presignedPutUrl) {
        const putRes = await fetch(initData.presignedPutUrl, {
          method: "PUT",
          headers: { "Content-Type": recordedBlob.type || "video/webm" },
          body: recordedBlob,
        });
        if (!putRes.ok) throw new Error("Failed direct S3/R2 upload");

        const completeRes = await fetch(`/api/studio/projects/${projectId}/uploads/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId: initData.assetId,
            lessonId: lessonId || null,
            edl,
            vttText,
            durationSec,
          }),
        });
        if (!completeRes.ok) throw new Error("Failed to finalize video project");
      } else {
        const form = new FormData();
        form.append("file", recordedBlob, "recording.webm");
        form.append("assetId", initData.assetId);
        if (lessonId) form.append("lessonId", lessonId);
        form.append("edlJson", JSON.stringify(edl));
        form.append("vttText", vttText);
        form.append("durationSec", String(Math.round(durationSec)));

        const completeRes = await fetch(`/api/studio/projects/${projectId}/uploads/complete`, {
          method: "POST",
          body: form,
        });
        if (!completeRes.ok) throw new Error("Failed to save local video");
      }

      if (courseId && lessonId) {
        setPublishedTarget({ courseId, lessonId });
      }
      setStatusMsg(
        isEs
          ? "Video guardado, encolado para optimización FFmpeg y publicado en la lección."
          : "Video saved, queued for FFmpeg optimization, and published to lesson."
      );
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h1>{isEs ? "Frateli Video Studio — Grabación y Edición" : "Frateli Video Studio — Record & Edit"}</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
          {isEs
            ? "Graba cámara o pantalla con respaldo local OPFS, recorta tiempos con teclado, edita subtítulos WebVTT y publica directo al curso."
            : "Record camera or screen with OPFS crash recovery, trim via keyboard, edit WebVTT captions, and publish directly to your course."}
        </p>
        <div aria-live="polite" style={{ marginTop: "10px" }}>
          {errorMsg && <div className="alert alert-error" role="alert">{errorMsg}</div>}
          {statusMsg && (
            <div className="alert alert-success stack">
              <span>{statusMsg}</span>
              {publishedTarget && (
                <div>
                  <Link
                    href={`/teach/courses/${publishedTarget.courseId}?suggestedLessonId=${publishedTarget.lessonId}`}
                    className="btn btn-primary"
                  >
                    {isEs
                      ? "Sugerencias IA: Crear apoyo estilo Napkin y práctica automática →"
                      : "AI Suggestions: Create Napkin study support & auto practice →"}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="grid-2">
        {/* Recorder & Preview */}
        <div className="card stack">
          <h2>{isEs ? "1. Captura de video" : "1. Video Capture"}</h2>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => startCapture("camera")}>
              {isEs ? "Activar cámara y micrófono" : "Enable camera & mic"}
            </button>
            <button type="button" className="btn" onClick={() => startCapture("screen")}>
              {isEs ? "Capturar pantalla" : "Capture screen"}
            </button>
            <button type="button" className="btn" onClick={recoverFromOpfs}>
              {isEs ? "Recuperar OPFS" : "Recover OPFS"}
            </button>
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="studio-upload-local">
              {isEs ? "O cargar archivo de video existente" : "Or load an existing video file"}
            </label>
            <input
              id="studio-upload-local"
              type="file"
              accept="video/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadRecordedBlob(f);
              }}
            />
          </div>

          {(recordingState === "previewing" || recordingState === "recording") && (
            <div className="stack">
              <video
                ref={liveVideoRef}
                autoPlay
                muted
                playsInline
                style={{ width: "100%", borderRadius: "8px", background: "#000" }}
              />
              <div className="row">
                {recordingState === "previewing" ? (
                  <button type="button" className="btn btn-danger" onClick={startRecording}>
                    ● {isEs ? "Iniciar grabación" : "Start recording"}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={stopRecording}>
                    ■ {isEs ? "Detener grabación" : "Stop recording"}
                  </button>
                )}
              </div>
            </div>
          )}

          {recordingState === "recorded" && recordedUrl && (
            <div className="stack">
              <video
                ref={previewVideoRef}
                src={recordedUrl}
                controls
                onLoadedMetadata={(e) => {
                  const dur = e.currentTarget.duration || 0;
                  if (Number.isFinite(dur)) {
                    setDurationSec(dur);
                    setTrimEndSec(Number(dur.toFixed(1)));
                  }
                }}
                style={{ width: "100%", borderRadius: "8px", background: "#000" }}
              />
            </div>
          )}
        </div>

        {/* Teleprompter + AI Script */}
        <div className="card stack">
          <h2>{isEs ? "2. Teleprompter y Guion con Gemini IA" : "2. Teleprompter & Gemini AI Script"}</h2>
          <div className="row">
            <label htmlFor="ai-script-topic" className="visually-hidden">
              {isEs ? "Tema del guion" : "Script topic"}
            </label>
            <input
              id="ai-script-topic"
              placeholder={isEs ? "Tema para generar guion..." : "Topic for AI script..."}
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              style={{ flex: 1, minHeight: "44px", padding: "8px 12px" }}
            />
            <button type="button" className="btn btn-primary" onClick={generateScript} disabled={busy || !aiConfigured}>
              {isEs ? "Generar guion IA" : "Generate AI script"}
            </button>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="teleprompter-box">{isEs ? "Texto del Teleprompter" : "Teleprompter Script"}</label>
            <textarea
              id="teleprompter-box"
              style={{ minHeight: "220px", fontSize: "1.05rem", lineHeight: 1.7 }}
              value={teleprompter}
              onChange={(e) => setTeleprompter(e.target.value)}
              placeholder={isEs ? "Escribe o genera aquí el guion para leer mientras grabas..." : "Write or generate your script here..."}
            />
          </div>
        </div>
      </section>

      {/* Non-destructive Timeline Trim + Captions + Publish */}
      <section className="card stack">
        <h2>{isEs ? "3. Edición no destructiva, subtítulos WebVTT y publicación" : "3. Non-destructive Trim, WebVTT Captions & Publish"}</h2>
        <div className="grid-3">
          <div className="field">
            <label htmlFor="trim-start">{isEs ? "Inicio de recorte (seg)" : "Trim start (sec)"}</label>
            <input
              id="trim-start"
              type="number"
              step="0.5"
              min={0}
              value={trimStartSec}
              onChange={(e) => setTrimStartSec(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="trim-end">{isEs ? "Fin de recorte (seg)" : "Trim end (sec)"}</label>
            <input
              id="trim-end"
              type="number"
              step="0.5"
              min={0}
              value={trimEndSec}
              onChange={(e) => setTrimEndSec(Number(e.target.value))}
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "14px", gap: "8px" }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (previewVideoRef.current) setTrimStartSec(Number(previewVideoRef.current.currentTime.toFixed(1)));
              }}
            >
              {isEs ? "Marcar inicio" : "Set In"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (previewVideoRef.current) setTrimEndSec(Number(previewVideoRef.current.currentTime.toFixed(1)));
              }}
            >
              {isEs ? "Marcar fin" : "Set Out"}
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="vtt-editor">{isEs ? "Subtítulos accesibles (WebVTT)" : "Accessible Captions (WebVTT)"}</label>
          <textarea
            id="vtt-editor"
            value={vttText}
            onChange={(e) => setVttText(e.target.value)}
            style={{ fontFamily: "monospace", minHeight: "120px" }}
          />
        </div>

        <div className="grid-3">
          <div className="field">
            <label htmlFor="pub-title">{isEs ? "Título del proyecto" : "Project title"}</label>
            <input id="pub-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pub-course">{isEs ? "Curso destino" : "Target course"}</label>
            <select
              id="pub-course"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setLessonId("");
              }}
            >
              <option value="">{isEs ? "Solo guardar en Studio" : "Save in Studio only"}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{isEs ? c.title_es : c.title_en}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pub-lesson">{isEs ? "Lección destino" : "Target lesson"}</label>
            <select id="pub-lesson" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              <option value="">{isEs ? "Seleccionar lección..." : "Select lesson..."}</option>
              {courseLessons.map((l) => (
                <option key={l.id} value={l.id}>{isEs ? l.title_es : l.title_en}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <button type="button" className="btn btn-primary" disabled={busy || !recordedBlob} onClick={publishVideo}>
            {busy ? (isEs ? "Publicando..." : "Publishing...") : isEs ? "Renderizar y publicar video" : "Render & Publish Video"}
          </button>
        </div>
      </section>

      {recentProjects.length > 0 && (
        <section className="card stack">
          <h2>{isEs ? "Proyectos recientes de Video Studio" : "Recent Video Studio Projects"}</h2>
          <ul>
            {recentProjects.map((p) => (
              <li key={p.id}>
                <strong>{p.title}</strong> — <span className="badge">{p.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
