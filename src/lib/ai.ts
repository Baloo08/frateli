import { GoogleGenAI } from "@google/genai";
import * as z from "zod";
import { getEnv } from "./env";
import { query } from "./db";

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

export type LessonDraftOutput = z.infer<typeof lessonDraftSchema>;
export type QuizDraftOutput = z.infer<typeof quizDraftSchema>;
export type VideoScriptOutput = z.infer<typeof videoScriptSchema>;

function getClient(): GoogleGenAI {
  const apiKey = getEnv().GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleGenAI({ apiKey });
}

export function isAiConfigured(): boolean {
  return Boolean(getEnv().GEMINI_API_KEY);
}

export async function generateLessonDraft(params: {
  userId: string;
  courseId?: string;
  topic: string;
  audience: string;
  tone: string;
  locale: "es" | "en";
}): Promise<LessonDraftOutput> {
  const client = getClient();
  const model = getEnv().GEMINI_MODEL || "gemini-3.8-flash";

  const prompt = `You are an instructional designer for Frateli Campus Virtual.
Create a complete bilingual (Spanish and English) LMS lesson about: "${params.topic}".
Target audience: "${params.audience}".
Tone: "${params.tone}".
Primary focus language: "${params.locale}".
Include clear Markdown headings, learning objectives, practical examples, and a 5-slide outline suitable for Google Slides.`;

  const jsonSchema = {
    type: "object",
    properties: {
      titleEs: { type: "string", description: "Lesson title in Spanish" },
      titleEn: { type: "string", description: "Lesson title in English" },
      contentMdEs: { type: "string", description: "Full lesson body in Markdown (Spanish)" },
      contentMdEn: { type: "string", description: "Full lesson body in Markdown (English)" },
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
    model,
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: jsonSchema,
    },
  });

  if (!interaction.output_text) {
    throw new Error("Empty response from Gemini API");
  }

  const parsed = lessonDraftSchema.parse(JSON.parse(interaction.output_text));

  await query(
    `INSERT INTO ai_generations (user_id, course_id, generation_type, model, locale, prompt_summary, output_json, tokens_used)
     VALUES ($1, $2, 'lesson_draft', $3, $4, $5, $6, $7)`,
    [
      params.userId,
      params.courseId ?? null,
      model,
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
  const client = getClient();
  const model = getEnv().GEMINI_MODEL || "gemini-3.8-flash";
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
    model,
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: jsonSchema,
    },
  });

  if (!interaction.output_text) {
    throw new Error("Empty response from Gemini API");
  }

  const parsed = quizDraftSchema.parse(JSON.parse(interaction.output_text));

  await query(
    `INSERT INTO ai_generations (user_id, course_id, generation_type, model, locale, prompt_summary, output_json, tokens_used)
     VALUES ($1, $2, 'quiz_draft', $3, $4, $5, $6, $7)`,
    [
      params.userId,
      params.courseId ?? null,
      model,
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
  const client = getClient();
  const model = getEnv().GEMINI_MODEL || "gemini-3.8-flash";

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
    model,
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: jsonSchema,
    },
  });

  if (!interaction.output_text) {
    throw new Error("Empty response from Gemini API");
  }

  const parsed = videoScriptSchema.parse(JSON.parse(interaction.output_text));

  await query(
    `INSERT INTO ai_generations (user_id, course_id, generation_type, model, locale, prompt_summary, output_json, tokens_used)
     VALUES ($1, $2, 'video_script', $3, $4, $5, $6, $7)`,
    [
      params.userId,
      params.courseId ?? null,
      model,
      params.locale,
      params.topic.slice(0, 300),
      JSON.stringify(parsed),
      interaction.usage?.total_tokens ?? 0,
    ]
  );

  return parsed;
}
