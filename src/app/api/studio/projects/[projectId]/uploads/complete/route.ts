import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasStudioAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import { putObject } from "@/lib/storage";
import { getVideoQueue } from "@/lib/queues";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !hasStudioAccess(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectId } = await context.params;
  const projRes = await query<{
    owner_id: string;
    latest_asset_id: string | null;
    lesson_id: string | null;
    content_locale: "es" | "en";
  }>(
    `SELECT owner_id, latest_asset_id, lesson_id, content_locale FROM video_projects WHERE id = $1`,
    [projectId]
  );
  const project = projRes.rows[0];
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.owner_id !== user.id && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";
  let assetId = project.latest_asset_id || "";
  let lessonId = project.lesson_id;
  let edl: { trimStartSec?: number; trimEndSec?: number | null } = {};
  let vttText = "";
  let durationSec = 0;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    assetId = String(form.get("assetId") || assetId);
    const formLessonId = String(form.get("lessonId") || "");
    if (formLessonId) lessonId = formLessonId;
    vttText = String(form.get("vttText") || "");
    durationSec = Number(form.get("durationSec") || "0");
    const edlRaw = String(form.get("edlJson") || "{}");
    try {
      edl = JSON.parse(edlRaw);
    } catch {
      edl = {};
    }

    if (file instanceof File && assetId) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const stored = await putObject(
        `raw/${projectId}/${assetId}.webm`,
        bytes,
        file.type || "video/webm"
      );
      await query(
        `UPDATE video_assets
         SET raw_object_key = $2, mp4_fallback_key = $2, total_size_bytes = $3, duration_sec = $4, status = 'ready'
         WHERE id = $1`,
        [assetId, stored.key, stored.sizeBytes, Math.max(0, Math.round(durationSec))]
      );
    }
  } else {
    const body = await req.json().catch(() => ({}));
    assetId = body.assetId || assetId;
    if (body.lessonId) lessonId = body.lessonId;
    if (body.edl) edl = body.edl;
    if (body.vttText) vttText = body.vttText;
    if (body.durationSec) durationSec = Number(body.durationSec);
  }

  if (!assetId) {
    return NextResponse.json({ error: "Missing assetId" }, { status: 400 });
  }

  // Save WebVTT captions if provided
  if (vttText.trim()) {
    const vttStored = await putObject(
      `media/videos/${assetId}/captions_${project.content_locale}.vtt`,
      Buffer.from(vttText, "utf8"),
      "text/vtt; charset=utf-8"
    );
    const col = project.content_locale === "en" ? "vtt_en_key" : "vtt_es_key";
    await query(`UPDATE video_assets SET ${col} = $2 WHERE id = $1`, [assetId, vttStored.key]);
  }

  await query(`UPDATE video_projects SET status = 'ready', edl_json = $2, lesson_id = $3 WHERE id = $1`, [
    projectId,
    JSON.stringify(edl),
    lessonId,
  ]);

  if (lessonId) {
    await query(
      `UPDATE lessons
       SET video_asset_id = $2, lesson_type = 'video', duration_sec = GREATEST(duration_sec, $3)
       WHERE id = $1`,
      [lessonId, assetId, Math.max(0, Math.round(durationSec))]
    );
  }

  // Enqueue FFmpeg worker transcode job (non-blocking if worker handles trimming/MP4 optimization)
  await query(
    `INSERT INTO video_jobs (video_asset_id, job_type, status) VALUES ($1, 'render_edl', 'queued')`,
    [assetId]
  );

  try {
    await getVideoQueue().add("render-edl", { videoAssetId: assetId, edl });
  } catch {
    // Raw recording is already playable via fallback key even if Redis queue is momentarily offline
  }

  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    portalContext: "studio",
    action: lessonId ? "video.published_to_lesson" : "video.render_requested",
    resourceType: lessonId ? "lesson" : "video_asset",
    resourceId: lessonId || assetId,
  });

  return NextResponse.json({ ok: true, assetId, lessonId });
}
