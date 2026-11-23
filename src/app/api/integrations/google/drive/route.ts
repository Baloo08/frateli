import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  createGoogleCalendarSession,
  createGoogleDoc,
  createGoogleSheet,
  createGoogleSlides,
  downloadGoogleDriveFile,
  getActiveGoogleIntegration,
  listGoogleDriveFiles,
} from "@/lib/google";
import { query } from "@/lib/db";
import { putObject } from "@/lib/storage";
import { logAudit } from "@/lib/audit";

const driveActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_root_folder"),
    folderId: z.string().min(1),
    folderName: z.string().min(1),
  }),
  z.object({
    action: z.literal("import_file"),
    lessonId: z.string().uuid(),
    fileId: z.string().min(1),
    titleEs: z.string().optional(),
    titleEn: z.string().optional(),
  }),
  z.object({
    action: z.literal("create_doc"),
    lessonId: z.string().uuid(),
    title: z.string().min(2),
    bodyText: z.string().min(1),
  }),
  z.object({
    action: z.literal("create_slides"),
    lessonId: z.string().uuid(),
    title: z.string().min(2),
    slides: z.array(z.object({ heading: z.string(), bullets: z.array(z.string()) })).min(1),
  }),
  z.object({
    action: z.literal("create_sheet"),
    lessonId: z.string().uuid(),
    title: z.string().min(2),
    headers: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    action: z.literal("schedule_calendar"),
    courseId: z.string().uuid(),
    summary: z.string().min(2),
    description: z.string().optional(),
    startIso: z.string(),
    endIso: z.string(),
  }),
]);

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "superadmin" && user.role !== "teacher")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const integration = await getActiveGoogleIntegration();
  if (!integration) {
    return NextResponse.json({ connected: false, files: [] });
  }

  try {
    const folderId = req.nextUrl.searchParams.get("folderId") || undefined;
    const q = req.nextUrl.searchParams.get("q") || undefined;
    const files = await listGoogleDriveFiles({ folderId, queryText: q });
    return NextResponse.json({
      connected: true,
      accountEmail: integration.account_email,
      rootFolderId: integration.root_folder_id,
      rootFolderName: integration.root_folder_name,
      files,
    });
  } catch (err) {
    return NextResponse.json(
      {
        connected: true,
        accountEmail: integration.account_email,
        error: err instanceof Error ? err.message : "Failed to list Drive files",
        files: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "superadmin" && user.role !== "teacher")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = driveActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Google action payload" }, { status: 400 });
  }

  const data = parsed.data;

  try {
    if (data.action === "set_root_folder") {
      if (user.role !== "superadmin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      await query(
        `UPDATE google_integrations
         SET root_folder_id = $1, root_folder_name = $2
         WHERE provider = 'google_workspace' AND status = 'active'`,
        [data.folderId, data.folderName]
      );
      return NextResponse.json({ ok: true });
    }

    if (data.action === "import_file") {
      const downloaded = await downloadGoogleDriveFile(data.fileId);
      const safeName = downloaded.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `resources/drive/${Date.now()}-${safeName}`;
      const stored = await putObject(key, downloaded.buffer, downloaded.mimeType);

      const res = await query<{ id: string }>(
        `INSERT INTO lesson_resources (
           lesson_id, title_es, title_en, storage_driver, source_provider,
           external_file_id, external_web_url, file_key, mime_type, size_bytes, last_synced_at
         ) VALUES ($1, $2, $3, $4, 'google_drive', $5, $6, $7, $8, $9, now())
         RETURNING id`,
        [
          data.lessonId,
          data.titleEs || downloaded.fileName,
          data.titleEn || downloaded.fileName,
          stored.driver,
          data.fileId,
          downloaded.webViewLink ?? null,
          stored.key,
          downloaded.mimeType,
          stored.sizeBytes,
        ]
      );

      await logAudit({
        actorId: user.id,
        actorRole: user.role,
        portalContext: "teach",
        action: "resource.imported_from_drive",
        resourceType: "lesson_resource",
        resourceId: res.rows[0].id,
        metadata: { driveFileId: data.fileId, fileName: downloaded.fileName },
      });

      return NextResponse.json({ ok: true, resourceId: res.rows[0].id, fileName: downloaded.fileName });
    }

    if (data.action === "create_doc") {
      const doc = await createGoogleDoc({ title: data.title, bodyText: data.bodyText });
      const res = await query<{ id: string }>(
        `INSERT INTO lesson_resources (
           lesson_id, title_es, title_en, storage_driver, source_provider,
           external_file_id, external_web_url, file_key, mime_type, size_bytes, last_synced_at
         ) VALUES ($1, $2, $2, 'external', 'google_docs', $3, $4, $4, 'application/vnd.google-apps.document', 0, now())
         RETURNING id`,
        [data.lessonId, data.title, doc.fileId, doc.webViewLink]
      );
      return NextResponse.json({ ok: true, resourceId: res.rows[0].id, webViewLink: doc.webViewLink });
    }

    if (data.action === "create_slides") {
      const deck = await createGoogleSlides({ title: data.title, slides: data.slides });
      const res = await query<{ id: string }>(
        `INSERT INTO lesson_resources (
           lesson_id, title_es, title_en, storage_driver, source_provider,
           external_file_id, external_web_url, file_key, mime_type, size_bytes, last_synced_at
         ) VALUES ($1, $2, $2, 'external', 'google_slides', $3, $4, $4, 'application/vnd.google-apps.presentation', 0, now())
         RETURNING id`,
        [data.lessonId, data.title, deck.fileId, deck.webViewLink]
      );
      return NextResponse.json({ ok: true, resourceId: res.rows[0].id, webViewLink: deck.webViewLink });
    }

    if (data.action === "create_sheet") {
      const sheet = await createGoogleSheet({ title: data.title, headers: data.headers, rows: data.rows });
      const res = await query<{ id: string }>(
        `INSERT INTO lesson_resources (
           lesson_id, title_es, title_en, storage_driver, source_provider,
           external_file_id, external_web_url, file_key, mime_type, size_bytes, last_synced_at
         ) VALUES ($1, $2, $2, 'external', 'google_sheets', $3, $4, $4, 'application/vnd.google-apps.spreadsheet', 0, now())
         RETURNING id`,
        [data.lessonId, data.title, sheet.fileId, sheet.webViewLink]
      );
      return NextResponse.json({ ok: true, resourceId: res.rows[0].id, webViewLink: sheet.webViewLink });
    }

    if (data.action === "schedule_calendar") {
      const event = await createGoogleCalendarSession({
        summary: data.summary,
        description: data.description,
        startIso: data.startIso,
        endIso: data.endIso,
      });

      await query(
        `INSERT INTO course_calendar_events (
           course_id, created_by, google_event_id, title, description, starts_at, ends_at, meet_link, html_link
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          data.courseId,
          user.id,
          event.googleEventId,
          data.summary,
          data.description ?? null,
          data.startIso,
          data.endIso,
          event.meetLink,
          event.htmlLink,
        ]
      );

      return NextResponse.json({ ok: true, event });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Google operation failed" },
      { status: 500 }
    );
  }
}
