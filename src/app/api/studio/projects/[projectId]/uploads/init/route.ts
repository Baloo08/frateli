import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hasStudioAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import { getActiveStorageDriver, getPresignedPutUrl } from "@/lib/storage";

const initSchema = z.object({
  contentType: z.string().default("video/webm"),
  fileName: z.string().default("recording.webm"),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !hasStudioAccess(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectId } = await context.params;
  const projRes = await query<{ owner_id: string }>(
    `SELECT owner_id FROM video_projects WHERE id = $1`,
    [projectId]
  );
  const project = projRes.rows[0];
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.owner_id !== user.id && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = initSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid init request" }, { status: 400 });
  }

  const driver = getActiveStorageDriver();
  const assetId = crypto.randomUUID();
  const ext = parsed.data.fileName.split(".").pop() || "webm";
  const rawKey = `raw/${projectId}/${assetId}.${ext}`;

  await query(
    `INSERT INTO video_assets (id, project_id, owner_id, storage_driver, source_provider, raw_object_key, status)
     VALUES ($1, $2, $3, $4, 'studio', $5, 'pending')`,
    [assetId, projectId, user.id, driver, rawKey]
  );

  await query(`UPDATE video_projects SET status = 'uploading', latest_asset_id = $2 WHERE id = $1`, [
    projectId,
    assetId,
  ]);

  const presignedPutUrl = await getPresignedPutUrl(rawKey, parsed.data.contentType, 900);

  return NextResponse.json({
    ok: true,
    assetId,
    rawKey,
    uploadMode: presignedPutUrl ? "s3_presigned" : "local_multipart",
    presignedPutUrl,
  });
}
