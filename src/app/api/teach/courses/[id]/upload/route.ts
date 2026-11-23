import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canManageCourse } from "@/lib/permissions";
import { putObject } from "@/lib/storage";
import { query } from "@/lib/db";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: courseId } = await context.params;
  if (!(await canManageCourse(user, courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const lessonId = String(form.get("lessonId") || "");
  const titleEs = String(form.get("titleEs") || "");
  const titleEn = String(form.get("titleEn") || "");

  if (!(file instanceof File) || !lessonId) {
    return NextResponse.json({ error: "File and lessonId are required" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const isVideo = file.type.startsWith("video/");

  if (isVideo) {
    const key = `media/uploads/${courseId}/${Date.now()}-${safeName}`;
    const stored = await putObject(key, bytes, file.type || "video/mp4");
    const assetRes = await query<{ id: string }>(
      `INSERT INTO video_assets (
         owner_id, storage_driver, source_provider, raw_object_key, mp4_fallback_key, total_size_bytes, status
       ) VALUES ($1, $2, 'upload', $3, $3, $4, 'ready') RETURNING id`,
      [user.id, stored.driver, stored.key, stored.sizeBytes]
    );
    await query(`UPDATE lessons SET video_asset_id = $2, lesson_type = 'video' WHERE id = $1`, [
      lessonId,
      assetRes.rows[0].id,
    ]);
    return NextResponse.json(
      {
        ok: true,
        kind: "video",
        videoAssetId: assetRes.rows[0].id,
        lessonId,
        aiSuggestionsAvailable: true,
      },
      { status: 201 }
    );
  }

  const key = `resources/uploads/${courseId}/${Date.now()}-${safeName}`;
  const stored = await putObject(key, bytes, file.type || "application/octet-stream");
  const res = await query<{ id: string }>(
    `INSERT INTO lesson_resources (
       lesson_id, title_es, title_en, storage_driver, source_provider, file_key, mime_type, size_bytes
     ) VALUES ($1, $2, $3, $4, 'upload', $5, $6, $7) RETURNING id`,
    [
      lessonId,
      titleEs || file.name,
      titleEn || file.name,
      stored.driver,
      stored.key,
      file.type || "application/octet-stream",
      stored.sizeBytes,
    ]
  );

  return NextResponse.json({ ok: true, kind: "resource", resourceId: res.rows[0].id }, { status: 201 });
}
