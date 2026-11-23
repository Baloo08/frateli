import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { canManageCourse } from "@/lib/permissions";
import { query } from "@/lib/db";
import { putObject } from "@/lib/storage";
import type { VisualAidItem } from "@/lib/ai";

const manualSupportSchema = z.object({
  supportMdEs: z.string().default(""),
  supportMdEn: z.string().default(""),
  visualAids: z
    .array(
      z.object({
        id: z.string().optional(),
        titleEs: z.string().min(1),
        titleEn: z.string().min(1),
        captionEs: z.string().default(""),
        captionEn: z.string().default(""),
        altEs: z.string().default(""),
        altEn: z.string().default(""),
        diagramKind: z.enum(["flow", "pillars", "cycle"]).default("flow"),
        nodes: z
          .array(
            z.object({
              labelEs: z.string().min(1),
              labelEn: z.string().min(1),
              detailEs: z.string().default(""),
              detailEn: z.string().default(""),
            })
          )
          .default([]),
      })
    )
    .optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; lessonId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: courseId, lessonId } = await context.params;
  if (!(await canManageCourse(user, courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("image");
    const titleEs = String(form.get("titleEs") || "Diagrama visual");
    const titleEn = String(form.get("titleEn") || titleEs);
    const captionEs = String(form.get("captionEs") || "");
    const captionEn = String(form.get("captionEn") || captionEs);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    const aidId = crypto.randomUUID();
    const bytes = Buffer.from(await file.arrayBuffer());
    const stored = await putObject(
      `media/diagrams/${lessonId}/${aidId}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
      bytes,
      file.type || "image/png"
    );

    const existingRes = await query<{ visual_aids_json: VisualAidItem[] }>(
      `SELECT visual_aids_json FROM lessons WHERE id = $1`,
      [lessonId]
    );
    const current = Array.isArray(existingRes.rows[0]?.visual_aids_json)
      ? existingRes.rows[0].visual_aids_json
      : [];

    const nextAid: VisualAidItem = {
      id: aidId,
      titleEs,
      titleEn,
      captionEs,
      captionEn,
      altEs: titleEs,
      altEn: titleEn,
      diagramKind: "pillars",
      imageKey: stored.key,
      storageDriver: stored.driver,
      nodes: [],
    };

    await query(`UPDATE lessons SET visual_aids_json = $2 WHERE id = $1`, [
      lessonId,
      JSON.stringify([...current, nextAid]),
    ]);

    return NextResponse.json({ ok: true, aid: nextAid });
  }

  const body = await req.json().catch(() => null);
  const parsed = manualSupportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid support material payload" }, { status: 400 });
  }

  const existingRes = await query<{ visual_aids_json: VisualAidItem[] }>(
    `SELECT visual_aids_json FROM lessons WHERE id = $1`,
    [lessonId]
  );
  const currentAids = Array.isArray(existingRes.rows[0]?.visual_aids_json)
    ? existingRes.rows[0].visual_aids_json
    : [];

  let updatedAids = currentAids;
  if (parsed.data.visualAids) {
    const newAids: VisualAidItem[] = parsed.data.visualAids.map((a) => ({
      id: a.id || crypto.randomUUID(),
      titleEs: a.titleEs,
      titleEn: a.titleEn,
      captionEs: a.captionEs,
      captionEn: a.captionEn,
      altEs: a.altEs || a.titleEs,
      altEn: a.altEn || a.titleEn,
      diagramKind: a.diagramKind,
      imageKey: null,
      storageDriver: null,
      nodes: a.nodes,
    }));
    updatedAids = [...currentAids.filter((c) => c.imageKey !== null), ...newAids];
  }

  await query(
    `UPDATE lessons
     SET support_md_es = $2,
         support_md_en = $3,
         visual_aids_json = $4
     WHERE id = $1`,
    [
      lessonId,
      parsed.data.supportMdEs,
      parsed.data.supportMdEn || parsed.data.supportMdEs,
      JSON.stringify(updatedAids),
    ]
  );

  return NextResponse.json({ ok: true });
}
