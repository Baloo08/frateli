import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  generateLessonDraft,
  generateQuizDraft,
  generateVideoPracticePack,
  generateVideoScript,
  generateVideoSupportPack,
  isAiConfigured,
} from "@/lib/ai";
import { canManageCourse } from "@/lib/permissions";

const aiRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("lesson"),
    courseId: z.string().uuid().optional(),
    topic: z.string().trim().min(3).max(500),
    audience: z.string().trim().default("Estudiantes universitarios y profesionales"),
    tone: z.string().trim().default("Claro, práctico y accesible"),
    locale: z.enum(["es", "en"]).default("es"),
  }),
  z.object({
    mode: z.literal("quiz"),
    courseId: z.string().uuid().optional(),
    topic: z.string().trim().min(3).max(500),
    questionCount: z.coerce.number().int().min(2).max(15).default(5),
    locale: z.enum(["es", "en"]).default("es"),
  }),
  z.object({
    mode: z.literal("video_script"),
    courseId: z.string().uuid().optional(),
    topic: z.string().trim().min(3).max(500),
    durationMinutes: z.coerce.number().min(1).max(20).default(5),
    locale: z.enum(["es", "en"]).default("es"),
  }),
  z.object({
    mode: z.literal("video_support_pack"),
    courseId: z.string().uuid(),
    lessonId: z.string().uuid(),
    topicHint: z.string().trim().max(500).optional(),
    locale: z.enum(["es", "en"]).default("es"),
    generateImages: z.boolean().default(true),
  }),
  z.object({
    mode: z.literal("video_practice_pack"),
    courseId: z.string().uuid(),
    lessonId: z.string().uuid(),
    topicHint: z.string().trim().max(500).optional(),
    questionCount: z.coerce.number().int().min(3).max(12).default(5),
    locale: z.enum(["es", "en"]).default("es"),
  }),
]);

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "superadmin" && user.role !== "teacher")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isAiConfigured())) {
    return NextResponse.json(
      {
        error:
          "No hay clave de Gemini API configurada. El superadministrador debe agregarla en /admin/resources (BYOK).",
      },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = aiRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid AI generation request" }, { status: 400 });
  }

  try {
    const d = parsed.data;

    if (d.mode === "video_support_pack") {
      if (!(await canManageCourse(user, d.courseId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const pack = await generateVideoSupportPack({
        userId: user.id,
        courseId: d.courseId,
        lessonId: d.lessonId,
        topicHint: d.topicHint,
        locale: d.locale,
        generateImages: d.generateImages,
      });
      return NextResponse.json({ ok: true, mode: d.mode, pack });
    }

    if (d.mode === "video_practice_pack") {
      if (!(await canManageCourse(user, d.courseId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const pack = await generateVideoPracticePack({
        userId: user.id,
        courseId: d.courseId,
        lessonId: d.lessonId,
        topicHint: d.topicHint,
        questionCount: d.questionCount,
        locale: d.locale,
      });
      return NextResponse.json({ ok: true, mode: d.mode, pack });
    }

    if (d.mode === "lesson") {
      const draft = await generateLessonDraft({
        userId: user.id,
        courseId: d.courseId,
        topic: d.topic,
        audience: d.audience,
        tone: d.tone,
        locale: d.locale,
      });
      return NextResponse.json({ ok: true, mode: "lesson", draft });
    }

    if (d.mode === "quiz") {
      const draft = await generateQuizDraft({
        userId: user.id,
        courseId: d.courseId,
        topic: d.topic,
        questionCount: d.questionCount,
        locale: d.locale,
      });
      return NextResponse.json({ ok: true, mode: "quiz", draft });
    }

    const draft = await generateVideoScript({
      userId: user.id,
      courseId: d.courseId,
      topic: d.topic,
      durationMinutes: d.durationMinutes,
      locale: d.locale,
    });
    return NextResponse.json({ ok: true, mode: "video_script", draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI generation failed" },
      { status: 500 }
    );
  }
}
