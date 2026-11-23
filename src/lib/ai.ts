import crypto from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import * as z from "zod";
import { getEnv } from "./env";
import { query, withTransaction } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { getObjectBuffer, putObject } from "./storage";
import { logAudit } from "./audit";

export interface VisualAidItem {
  id: string;
  titleEs: string;
  titleEn: string;
  captionEs: string;
  captionEn: string;
  altEs: string;
  altEn: string;
  diagramKind: "flow" | "pillars" | "cycle";
  imageKey: string | null;
  storageDriver: "local" | "s3" | null;
  nodes: {
    labelEs: string;
    labelEn: string;
    detailEs: string;
    detailEn: string;
  }[];
}

const lessonDraftSchema = z.object({
  titleEs: z.string(),
  titleEn: z.string(),
  contentMdEs: z.string(),
  contentMdEn: z.string(),
  slideOutline: z.array(
    z.object({
      heading: z.string(),
      bullets: z.array(z.string()),
    })
  ),
});

const quizDraftSchema = z.object({
  titleEs: z.string(),
  titleEn: z.string(),
  questions: z.array(
    z.object({
      questionType: z.enum(["single_choice", "true_false", "short_answer"]),
      promptEs: z.string(),
      promptEn: z.string(),
      optionsEs: z.array(z.string()),
      optionsEn: z.array(z.string()),
      correctIndex: z.number().int().nullable(),
      correctText: z.string().nullable(),
      explanationEs: z.string(),
      explanationEn: z.string(),
    })
  ),
});

const videoScriptSchema = z.object({
  title: z.string(),
  hook: z.string(),
  teleprompterScript: z.string(),
  estimatedMinutes: z.number(),
  keyVisuals: z.array(z.string()),
});

const videoSupportSchema = z.object({
  supportMdEs: z.string(),
  supportMdEn: z.string(),
  diagrams: z.array(
    z.object({
      titleEs: z.string(),
      titleEn: z.string(),
      captionEs: z.string(),
      captionEn: z.string(),
      altEs: z.string(),
      altEn: z.string(),
      imagePrompt: z.string(),
      diagramKind: z.enum(["flow", "pillars", "cycle"]),
      nodes: z.array(
        z.object({
          labelEs: z.string(),
          labelEn: z.string(),
          detailEs: z.string(),
          detailEn: z.string(),
        })
      ),
    })
  ),
});

export type LessonDraftOutput = z.infer<typeof lessonDraftSchema>;
export type QuizDraftOutput = z.infer<typeof quizDraftSchema>;
export type VideoScriptOutput = z.infer<typeof videoScriptSchema>;
export type VideoSupportOutput = z.infer<typeof videoSupportSchema>;

export interface AiProviderStatus {
  configured: boolean;
  source: "byok" | "env" | "none";
  keyHint: string | null;
  textModel: string;
  imageModel: string;
}

function maskKeyHint(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.length <= 8) return "****";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export async function getAiProviderConfig(): Promise<{
  apiKey: string;
  textModel: string;
  imageModel: string;
  source: "byok" | "env";
}> {
  const rowRes = await query<{
    api_key_encrypted: string;
    text_model: string;
    image_model: string;
  }>(
    `SELECT api_key_encrypted, text_model, image_model
     FROM system_ai_configs
     WHERE provider = 'gemini' AND is_active = true
     LIMIT 1`
  ).catch(() => ({ rows: [] }));

  const row = rowRes.rows[0];
  if (row) {
    return {
      apiKey: decryptSecret(row.api_key_encrypted),
      textModel: row.text_model || "gemini-3.8-flash",
      imageModel: row.image_model || "gemini-nano-banana-2.1",
      source: "byok",
    };
  }

  const env = getEnv();
  if (env.GEMINI_API_KEY) {
    return {
      apiKey: env.GEMINI_API_KEY,
      textModel: env.GEMINI_MODEL || "gemini-3.8-flash",
      imageModel: "gemini-nano-banana-2.1",
      source: "env",
    };
  }

  throw new Error("No Gemini API key configured. Configure BYOK in /admin/resources.");
}

export async function getAiProviderStatus(): Promise<AiProviderStatus> {
  const rowRes = await query<{
    key_hint: string;
    text_model: string;
    image_model: string;
  }>(
    `SELECT key_hint, text_model, image_model
     FROM system_ai_configs
     WHERE provider = 'gemini' AND is_active = true
     LIMIT 1`
  ).catch(() => ({ rows: [] }));

  const row = rowRes.rows[0];
  if (row) {
    return {
      configured: true,
      source: "byok",
      keyHint: row.key_hint,
      textModel: row.text_model,
      imageModel: row.image_model,
    };
  }

  const env = getEnv();
  if (env.GEMINI_API_KEY) {
    return {
      configured: true,
      source: "env",
      keyHint: maskKeyHint(env.GEMINI_API_KEY),
      textModel: env.GEMINI_MODEL || "gemini-3.8-flash",
      imageModel: "gemini-nano-banana-2.1",
    };
  }

  return {
    configured: false,
    source: "none",
    keyHint: null,
    textModel: "gemini-3.8-flash",
    imageModel: "gemini-nano-banana-2.1",
  };
}

export async function isAiConfigured(): Promise<boolean> {
  const status = await getAiProviderStatus();
  return status.configured;
}

export async function saveByokGeminiKey(params: {
  apiKey?: string;
  textModel: string;
  imageModel: string;
  actorId: string;
}) {
  const cleanKey = params.apiKey?.trim();
  if (cleanKey) {
    const encrypted = encryptSecret(cleanKey);
    const hint = maskKeyHint(cleanKey);
    await query(
      `INSERT INTO system_ai_configs (provider, api_key_encrypted, key_hint, text_model, image_model, is_active, updated_by)
       VALUES ('gemini', $1, $2, $3, $4, true, $5)
       ON CONFLICT (provider)
       DO UPDATE SET
         api_key_encrypted = EXCLUDED.api_key_encrypted,
         key_hint = EXCLUDED.key_hint,
         text_model = EXCLUDED.text_model,
         image_model = EXCLUDED.image_model,
         is_active = true,
         updated_by = EXCLUDED.updated_by`,
      [encrypted, hint, params.textModel, params.imageModel, params.actorId]
    );
  } else {
    await query(
      `UPDATE system_ai_configs
       SET text_model = $1, image_model = $2, updated_by = $3
       WHERE provider = 'gemini'`,
      [params.textModel, params.imageModel, params.actorId]
    );
  }

  await logAudit({
    actorId: params.actorId,
    actorRole: "superadmin",
    portalContext: "admin",
    action: "ai.byok_updated",
    resourceType: "system_ai_config",
    resourceId: "gemini",
    afterState: {
      textModel: params.textModel,
      imageModel: params.imageModel,
      keyUpdated: Boolean(cleanKey),
    },
  });
}

export async function deleteByokGeminiKey(actorId: string) {
  await query(`DELETE FROM system_ai_configs WHERE provider = 'gemini'`);
  await logAudit({
    actorId,
    actorRole: "superadmin",
    portalContext: "admin",
    action: "ai.byok_removed",
    resourceType: "system_ai_config",
    resourceId: "gemini",
  });
}

export async function testByokGeminiKey(overrideKey?: string): Promise<{ ok: boolean; model: string; reply?: string; error?: string }> {
  try {
    let apiKey = overrideKey?.trim();
    let model = "gemini-3.8-flash";
    if (!apiKey) {
      const cfg = await getAiProviderConfig();
      apiKey = cfg.apiKey;
      model = cfg.textModel;
    }
    const client = new GoogleGenAI({ apiKey });
    const interaction = await client.interactions.create({
      model,
      input: "Reply with exactly: FRATELI_OK",
    });
    return { ok: true, model, reply: interaction.output_text || "OK" };
  } catch (err) {
    return {
      ok: false,
      model: "gemini-3.8-flash",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getClientWithConfig() {
  const cfg = await getAiProviderConfig();
  return {
    client: new GoogleGenAI({ apiKey: cfg.apiKey }),
    textModel: cfg.textModel,
    imageModel: cfg.imageModel,
  };
}

async function withLessonVideoInput<T>(
  client: GoogleGenAI,
  lessonId: string | undefined,
  textPrompt: string,
  fn: (input: string | Array<Record<string, unknown>>) => Promise<T>
): Promise<T> {
  if (!lessonId) {
    return fn(textPrompt);
  }

  const res = await query<{
    title_es: string;
    title_en: string;
    content_md_es: string | null;
    mp4_fallback_key: string | null;
    raw_object_key: string | null;
    storage_driver: "local" | "s3" | null;
    total_size_bytes: string | null;
  }>(
    `SELECT l.title_es, l.title_en, l.content_md_es,
            va.mp4_fallback_key, va.raw_object_key, va.storage_driver, va.total_size_bytes::text
     FROM lessons l
     LEFT JOIN video_assets va ON va.id = l.video_asset_id
     WHERE l.id = $1`,
    [lessonId]
  );

  const row = res.rows[0];
  if (!row) return fn(textPrompt);

  const enrichedPrompt = `Lesson title (ES/EN): "${row.title_es}" / "${row.title_en}".
Existing lesson notes: ${(row.content_md_es || "").slice(0, 1500)}
${textPrompt}`;

  const videoKey = row.mp4_fallback_key || row.raw_object_key;
  const sizeBytes = Number(row.total_size_bytes ?? "0");
  // Multimodal upload for videos up to 150 MB
  if (!videoKey || !row.storage_driver || sizeBytes > 150 * 1024 * 1024) {
    return fn(enrichedPrompt);
  }

  let uploadedName: string | null = null;
  try {
    const buffer = await getObjectBuffer(videoKey, row.storage_driver);
    const mimeType = videoKey.endsWith(".mp4") ? "video/mp4" : "video/webm";
    const uploaded = await client.files.upload({
      file: new Blob([new Uint8Array(buffer)], { type: mimeType }),
      config: { mimeType },
    });
    uploadedName = uploaded.name || null;

    let fileInfo = uploaded;
    let attempts = 0;
    while (fileInfo.state === "PROCESSING" && attempts < 24) {
      await new Promise((r) => setTimeout(r, 3000));
      fileInfo = await client.files.get({ name: fileInfo.name || "" });
      attempts++;
    }

    if (fileInfo.state === "ACTIVE" && fileInfo.uri) {
      return await fn([
        { type: "video", uri: fileInfo.uri, mime_type: fileInfo.mimeType || mimeType },
        { type: "text", text: enrichedPrompt },
      ]);
    }
    return await fn(enrichedPrompt);
  } catch (err) {
    console.warn("[ai] Video upload fallback to text context:", err);
    return await fn(enrichedPrompt);
  } finally {
    if (uploadedName) {
      await client.files.delete({ name: uploadedName }).catch(() => undefined);
    }
  }
}

export async function generateLessonDraft(params: {
  userId: string;
  courseId?: string;
  topic: string;
  audience: string;
  tone: string;
  locale: "es" | "en";
}): Promise<LessonDraftOutput> {
  const { client, textModel } = await getClientWithConfig();

  const prompt = `You are an instructional designer for Frateli Campus Virtual.
Create a complete bilingual (Spanish and English) LMS lesson about: "${params.topic}".
Target audience: "${params.audience}".
Tone: "${params.tone}".
Primary focus language: "${params.locale}".
Include clear Markdown headings, learning objectives, practical examples, and a 5-slide outline suitable for Google Slides.`;

  const jsonSchema = {
    type: "object",
    properties: {
      titleEs: { type: "string" },
      titleEn: { type: "string" },
      contentMdEs: { type: "string" },
      contentMdEn: { type: "string" },
      slideOutline: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            bullets: { type: "array", items: { type: "string" } },
          },
          required: ["heading", "bullets"],
        },
      },
    },
    required: ["titleEs", "titleEn", "contentMdEs", "contentMdEn", "slideOutline"],
  };

  const interaction = await client.interactions.create({
    model: textModel,
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: jsonSchema,
    },
  });

  if (!interaction.output_text) throw new Error("Empty response from Gemini API");
  const parsed = lessonDraftSchema.parse(JSON.parse(interaction.output_text));

  await query(
    `INSERT INTO ai_generations (user_id, course_id, generation_type, model, locale, prompt_summary, output_json, tokens_used)
     VALUES ($1, $2, 'lesson_draft', $3, $4, $5, $6, $7)`,
    [
      params.userId,
      params.courseId ?? null,
      textModel,
      params.locale,
      params.topic.slice(0, 300),
      JSON.stringify(parsed),
      interaction.usage?.total_tokens ?? 0,
    ]
  );

  return parsed;
}

export async function generateQuizDraft(params: {
  userId: string;
  courseId?: string;
  topic: string;
  questionCount: number;
  locale: "es" | "en";
}): Promise<QuizDraftOutput> {
  const { client, textModel } = await getClientWithConfig();
  const count = Math.min(Math.max(params.questionCount, 2), 15);

  const prompt = `Create a bilingual (Spanish and English) LMS assessment quiz with exactly ${count} questions about: "${params.topic}".
Use mostly single_choice (with 4 options in optionsEs and 4 matching options in optionsEn, and 0-based correctIndex) and true_false (2 options: Verdadero/Falso and True/False, with correctIndex 0 or 1). Include helpful explanations in both languages.`;

  const jsonSchema = {
    type: "object",
    properties: {
      titleEs: { type: "string" },
      titleEn: { type: "string" },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            questionType: { type: "string", enum: ["single_choice", "true_false", "short_answer"] },
            promptEs: { type: "string" },
            promptEn: { type: "string" },
            optionsEs: { type: "array", items: { type: "string" } },
            optionsEn: { type: "array", items: { type: "string" } },
            correctIndex: { type: ["integer", "null"] },
            correctText: { type: ["string", "null"] },
            explanationEs: { type: "string" },
            explanationEn: { type: "string" },
          },
          required: [
            "questionType",
            "promptEs",
            "promptEn",
            "optionsEs",
            "optionsEn",
            "correctIndex",
            "correctText",
            "explanationEs",
            "explanationEn",
          ],
        },
      },
    },
    required: ["titleEs", "titleEn", "questions"],
  };

  const interaction = await client.interactions.create({
    model: textModel,
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: jsonSchema,
    },
  });

  if (!interaction.output_text) throw new Error("Empty response from Gemini API");
  const parsed = quizDraftSchema.parse(JSON.parse(interaction.output_text));

  await query(
    `INSERT INTO ai_generations (user_id, course_id, generation_type, model, locale, prompt_summary, output_json, tokens_used)
     VALUES ($1, $2, 'quiz_draft', $3, $4, $5, $6, $7)`,
    [
      params.userId,
      params.courseId ?? null,
      textModel,
      params.locale,
      params.topic.slice(0, 300),
      JSON.stringify(parsed),
      interaction.usage?.total_tokens ?? 0,
    ]
  );

  return parsed;
}

export async function generateVideoScript(params: {
  userId: string;
  courseId?: string;
  topic: string;
  durationMinutes: number;
  locale: "es" | "en";
}): Promise<VideoScriptOutput> {
  const { client, textModel } = await getClientWithConfig();

  const prompt = `Write a teleprompter-ready educational video script in ${
    params.locale === "es" ? "Spanish" : "English"
  } about "${params.topic}", paced for approximately ${params.durationMinutes} minutes. Include a strong opening hook, clear spoken paragraphs for reading on a teleprompter, and key visual cues.`;

  const jsonSchema = {
    type: "object",
    properties: {
      title: { type: "string" },
      hook: { type: "string" },
      teleprompterScript: { type: "string" },
      estimatedMinutes: { type: "number" },
      keyVisuals: { type: "array", items: { type: "string" } },
    },
    required: ["title", "hook", "teleprompterScript", "estimatedMinutes", "keyVisuals"],
  };

  const interaction = await client.interactions.create({
    model: textModel,
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: jsonSchema,
    },
  });

  if (!interaction.output_text) throw new Error("Empty response from Gemini API");
  const parsed = videoScriptSchema.parse(JSON.parse(interaction.output_text));

  await query(
    `INSERT INTO ai_generations (user_id, course_id, generation_type, model, locale, prompt_summary, output_json, tokens_used)
     VALUES ($1, $2, 'video_script', $3, $4, $5, $6, $7)`,
    [
      params.userId,
      params.courseId ?? null,
      textModel,
      params.locale,
      params.topic.slice(0, 300),
      JSON.stringify(parsed),
      interaction.usage?.total_tokens ?? 0,
    ]
  );

  return parsed;
}

export async function generateVideoSupportPack(params: {
  userId: string;
  courseId: string;
  lessonId: string;
  topicHint?: string;
  locale: "es" | "en";
  generateImages?: boolean;
}): Promise<{ supportMdEs: string; supportMdEn: string; visualAids: VisualAidItem[] }> {
  const { client, textModel, imageModel } = await getClientWithConfig();

  const prompt = `Based on this video lesson (and optional hint: "${params.topicHint || ""}"), create:
1) A clear, student-friendly bilingual study support guide in Markdown (supportMdEs and supportMdEn) with key concepts, step-by-step summary, practical takeaways, and study tips.
2) Exactly 2 Napkin.ai-style visual diagram concepts ("diagrams") that explain the core ideas visually. Each diagram must have:
   - titleEs, titleEn, captionEs, captionEn, altEs, altEn
   - diagramKind: "flow" (sequential steps), "pillars" (key pillars), or "cycle" (iterative loop)
   - imagePrompt: concise English prompt for an educational clean whiteboard vector infographic on pure white background with cobalt blue & slate accents
   - nodes: 3 to 5 concise nodes with labelEs, labelEn, detailEs, detailEn.`;

  const jsonSchema = {
    type: "object",
    properties: {
      supportMdEs: { type: "string" },
      supportMdEn: { type: "string" },
      diagrams: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titleEs: { type: "string" },
            titleEn: { type: "string" },
            captionEs: { type: "string" },
            captionEn: { type: "string" },
            altEs: { type: "string" },
            altEn: { type: "string" },
            imagePrompt: { type: "string" },
            diagramKind: { type: "string", enum: ["flow", "pillars", "cycle"] },
            nodes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  labelEs: { type: "string" },
                  labelEn: { type: "string" },
                  detailEs: { type: "string" },
                  detailEn: { type: "string" },
                },
                required: ["labelEs", "labelEn", "detailEs", "detailEn"],
              },
            },
          },
          required: [
            "titleEs",
            "titleEn",
            "captionEs",
            "captionEn",
            "altEs",
            "altEn",
            "imagePrompt",
            "diagramKind",
            "nodes",
          ],
        },
      },
    },
    required: ["supportMdEs", "supportMdEn", "diagrams"],
  };

  const interaction = await withLessonVideoInput(client, params.lessonId, prompt, (input) =>
    client.interactions.create({
      model: textModel,
      input: input as never,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: jsonSchema,
      },
    })
  );

  if (!interaction.output_text) throw new Error("Empty response from Gemini API");
  const parsed = videoSupportSchema.parse(JSON.parse(interaction.output_text));

  const visualAids: VisualAidItem[] = [];
  for (const diag of parsed.diagrams.slice(0, 2)) {
    const aidId = crypto.randomUUID();
    let imageKey: string | null = null;
    let storageDriver: "local" | "s3" | null = null;

    if (params.generateImages !== false) {
      try {
        const imgInteraction = await client.interactions.create({
          model: imageModel,
          input: `Clean minimalist educational infographic diagram in Napkin.ai visual note style, pure white background, crisp flat vector shapes, clear hierarchy, high-contrast navy (#0F172A) and cobalt blue (#1D4ED8) accents, readable short labels in ${
            params.locale === "es" ? "Spanish" : "English"
          }: ${diag.imagePrompt}. Nodes: ${diag.nodes
            .map((n) => (params.locale === "es" ? n.labelEs : n.labelEn))
            .join(" -> ")}`,
        });

        const imgData = imgInteraction.output_image?.data;
        if (imgData) {
          const buf = Buffer.from(imgData, "base64");
          const stored = await putObject(
            `media/diagrams/${params.lessonId}/${aidId}.png`,
            buf,
            "image/png"
          );
          imageKey = stored.key;
          storageDriver = stored.driver;
        }
      } catch (imgErr) {
        console.warn("[ai] Napkin image generation fell back to SVG diagram:", imgErr);
      }
    }

    visualAids.push({
      id: aidId,
      titleEs: diag.titleEs,
      titleEn: diag.titleEn,
      captionEs: diag.captionEs,
      captionEn: diag.captionEn,
      altEs: diag.altEs,
      altEn: diag.altEn,
      diagramKind: diag.diagramKind,
      imageKey,
      storageDriver,
      nodes: diag.nodes,
    });
  }

  await query(
    `UPDATE lessons
     SET support_md_es = $2,
         support_md_en = $3,
         visual_aids_json = $4
     WHERE id = $1`,
    [params.lessonId, parsed.supportMdEs, parsed.supportMdEn, JSON.stringify(visualAids)]
  );

  await query(
    `INSERT INTO ai_generations (user_id, course_id, generation_type, model, locale, prompt_summary, output_json, tokens_used)
     VALUES ($1, $2, 'video_support_pack', $3, $4, $5, $6, $7)`,
    [
      params.userId,
      params.courseId,
      textModel,
      params.locale,
      (params.topicHint || params.lessonId).slice(0, 300),
      JSON.stringify({ visualAidsCount: visualAids.length }),
      interaction.usage?.total_tokens ?? 0,
    ]
  );

  return {
    supportMdEs: parsed.supportMdEs,
    supportMdEn: parsed.supportMdEn,
    visualAids,
  };
}

export async function generateVideoPracticePack(params: {
  userId: string;
  courseId: string;
  lessonId: string;
  topicHint?: string;
  questionCount?: number;
  locale: "es" | "en";
}): Promise<{ assessmentId: string; titleEs: string; titleEn: string; count: number }> {
  const { client, textModel } = await getClientWithConfig();
  const count = Math.min(Math.max(params.questionCount ?? 5, 3), 12);

  const prompt = `Based on this video lesson (and optional hint: "${params.topicHint || ""}"), create an interactive student practice activity with ${count} automatic items (mix of single_choice with 4 options and true_false with 2 options).
Provide bilingual prompts, options, 0-based correctIndex, and clear educational explanations for immediate self-study feedback.`;

  const jsonSchema = {
    type: "object",
    properties: {
      titleEs: { type: "string" },
      titleEn: { type: "string" },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            questionType: { type: "string", enum: ["single_choice", "true_false"] },
            promptEs: { type: "string" },
            promptEn: { type: "string" },
            optionsEs: { type: "array", items: { type: "string" } },
            optionsEn: { type: "array", items: { type: "string" } },
            correctIndex: { type: ["integer", "null"] },
            correctText: { type: ["string", "null"] },
            explanationEs: { type: "string" },
            explanationEn: { type: "string" },
          },
          required: [
            "questionType",
            "promptEs",
            "promptEn",
            "optionsEs",
            "optionsEn",
            "correctIndex",
            "correctText",
            "explanationEs",
            "explanationEn",
          ],
        },
      },
    },
    required: ["titleEs", "titleEn", "questions"],
  };

  const interaction = await withLessonVideoInput(client, params.lessonId, prompt, (input) =>
    client.interactions.create({
      model: textModel,
      input: input as never,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: jsonSchema,
      },
    })
  );

  if (!interaction.output_text) throw new Error("Empty response from Gemini API");
  const parsed = quizDraftSchema.parse(JSON.parse(interaction.output_text));

  const assessmentId = await withTransaction(async (tx) => {
    const aRes = await tx.query<{ id: string }>(
      `INSERT INTO assessments (
         course_id, lesson_id, assessment_type, title_es, title_en,
         passing_score_pct, max_attempts, is_published
       ) VALUES ($1, $2, 'practice', $3, $4, 70, 99, true) RETURNING id`,
      [params.courseId, params.lessonId, parsed.titleEs, parsed.titleEn]
    );
    const id = aRes.rows[0].id;

    for (let i = 0; i < parsed.questions.length; i++) {
      const q = parsed.questions[i];
      await tx.query(
        `INSERT INTO assessment_questions (
           assessment_id, question_type, prompt_es, prompt_en, options_json,
           correct_answer_json, explanation_es, explanation_en, points, sort_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9)`,
        [
          id,
          q.questionType,
          q.promptEs,
          q.promptEn,
          JSON.stringify({ es: q.optionsEs, en: q.optionsEn }),
          JSON.stringify(q.correctIndex ?? 0),
          q.explanationEs,
          q.explanationEn,
          i,
        ]
      );
    }
    return id;
  });

  await query(
    `INSERT INTO ai_generations (user_id, course_id, generation_type, model, locale, prompt_summary, output_json, tokens_used)
     VALUES ($1, $2, 'video_practice_pack', $3, $4, $5, $6, $7)`,
    [
      params.userId,
      params.courseId,
      textModel,
      params.locale,
      (params.topicHint || params.lessonId).slice(0, 300),
      JSON.stringify({ assessmentId, count: parsed.questions.length }),
      interaction.usage?.total_tokens ?? 0,
    ]
  );

  return {
    assessmentId,
    titleEs: parsed.titleEs,
    titleEn: parsed.titleEn,
    count: parsed.questions.length,
  };
}
