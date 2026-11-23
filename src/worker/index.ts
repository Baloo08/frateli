import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Worker } from "bullmq";
import { query } from "../lib/db";
import { getEnv } from "../lib/env";
import { getQueueRedis } from "../lib/redis";
import { sendOutboxEmailNow } from "../lib/email";
import { getObjectBuffer, putObject } from "../lib/storage";
import { downloadGoogleDriveFile } from "../lib/google";

const execFileAsync = promisify(execFile);

interface EdlJson {
  trimStartSec?: number;
  trimEndSec?: number | null;
}

async function processVideoJob(videoAssetId: string, edl?: EdlJson) {
  const env = getEnv();
  const assetRes = await query<{
    id: string;
    project_id: string | null;
    storage_driver: "local" | "s3";
    raw_object_key: string | null;
  }>(
    `SELECT id, project_id, storage_driver, raw_object_key FROM video_assets WHERE id = $1`,
    [videoAssetId]
  );

  const asset = assetRes.rows[0];
  if (!asset || !asset.raw_object_key) {
    throw new Error(`Video asset ${videoAssetId} has no raw_object_key`);
  }

  await query(`UPDATE video_assets SET status = 'processing' WHERE id = $1`, [videoAssetId]);
  await query(
    `UPDATE video_jobs SET status = 'active', started_at = now(), progress_pct = 10 WHERE video_asset_id = $1`,
    [videoAssetId]
  );

  const tmpDir = path.join(env.FFMPEG_TMP_DIR, videoAssetId);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const rawBuf = await getObjectBuffer(asset.raw_object_key, asset.storage_driver);
    const inputPath = path.join(tmpDir, "input.webm");
    const outputMp4Path = path.join(tmpDir, "output.mp4");
    const thumbPath = path.join(tmpDir, "thumb.jpg");
    await fs.writeFile(inputPath, rawBuf);

    let transcoded = false;
    try {
      const ffArgs: string[] = ["-y"];
      if (edl?.trimStartSec && edl.trimStartSec > 0) {
        ffArgs.push("-ss", String(edl.trimStartSec));
      }
      if (edl?.trimEndSec && edl.trimEndSec > (edl.trimStartSec ?? 0)) {
        ffArgs.push("-to", String(edl.trimEndSec));
      }
      ffArgs.push(
        "-i",
        inputPath,
        "-threads",
        String(env.FFMPEG_THREADS),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        outputMp4Path
      );

      await execFileAsync("ffmpeg", ffArgs);
      await execFileAsync("ffmpeg", [
        "-y",
        "-ss",
        "00:00:01",
        "-i",
        outputMp4Path,
        "-vframes",
        "1",
        "-q:v",
        "3",
        thumbPath,
      ]).catch(() => undefined);

      transcoded = true;
    } catch (ffErr) {
      console.warn("[worker] ffmpeg unavailable or failed, storing raw playable fallback:", ffErr);
    }

    let mp4Key = asset.raw_object_key;
    let totalSize = rawBuf.byteLength;
    let thumbKey: string | null = null;

    if (transcoded) {
      const outBuf = await fs.readFile(outputMp4Path);
      const uploaded = await putObject(`media/videos/${videoAssetId}/final.mp4`, outBuf, "video/mp4");
      mp4Key = uploaded.key;
      totalSize = uploaded.sizeBytes;

      try {
        const thumbBuf = await fs.readFile(thumbPath);
        const uploadedThumb = await putObject(
          `media/videos/${videoAssetId}/thumb.jpg`,
          thumbBuf,
          "image/jpeg"
        );
        thumbKey = uploadedThumb.key;
      } catch {
        // Optional thumbnail
      }
    }

    await query(
      `UPDATE video_assets
       SET mp4_fallback_key = $2,
           thumbnail_key = COALESCE($3, thumbnail_key),
           total_size_bytes = $4,
           status = 'ready'
       WHERE id = $1`,
      [videoAssetId, mp4Key, thumbKey, totalSize]
    );

    if (asset.project_id) {
      await query(`UPDATE video_projects SET status = 'ready', latest_asset_id = $2 WHERE id = $1`, [
        asset.project_id,
        videoAssetId,
      ]);
    }

    await query(
      `UPDATE video_jobs SET status = 'completed', progress_pct = 100, finished_at = now() WHERE video_asset_id = $1`,
      [videoAssetId]
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await query(`UPDATE video_assets SET status = 'failed' WHERE id = $1`, [videoAssetId]);
    await query(
      `UPDATE video_jobs SET status = 'failed', error_message = $2, finished_at = now() WHERE video_asset_id = $1`,
      [videoAssetId, msg.slice(0, 1000)]
    );
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function processDriveImportJob(data: { resourceId: string; driveFileId: string }) {
  const downloaded = await downloadGoogleDriveFile(data.driveFileId);
  const key = `resources/drive/${data.resourceId}/${downloaded.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const stored = await putObject(key, downloaded.buffer, downloaded.mimeType);

  await query(
    `UPDATE lesson_resources
     SET storage_driver = $2,
         file_key = $3,
         mime_type = $4,
         size_bytes = $5,
         external_web_url = COALESCE($6, external_web_url),
         last_synced_at = now()
     WHERE id = $1`,
    [
      data.resourceId,
      stored.driver,
      stored.key,
      downloaded.mimeType,
      stored.sizeBytes,
      downloaded.webViewLink ?? null,
    ]
  );
}

async function startWorker() {
  const env = getEnv();
  const connection = getQueueRedis();

  const emailWorker = new Worker(
    "email-send",
    async (job) => {
      const { outboxId } = job.data as { outboxId: string };
      const res = await sendOutboxEmailNow(outboxId);
      if (!res.ok) {
        throw new Error(res.error || "Failed to send SMTP email");
      }
    },
    { connection, concurrency: 2 }
  );

  const videoWorker = new Worker(
    "video-process",
    async (job) => {
      const { videoAssetId, edl } = job.data as { videoAssetId: string; edl?: EdlJson };
      await processVideoJob(videoAssetId, edl);
    },
    { connection, concurrency: env.FFMPEG_CONCURRENCY }
  );

  const driveWorker = new Worker(
    "drive-import",
    async (job) => {
      const data = job.data as { resourceId: string; driveFileId: string };
      await processDriveImportJob(data);
    },
    { connection, concurrency: 2 }
  );

  // Sweeper for pending email_outbox rows
  const sweepTimer = setInterval(async () => {
    try {
      const pending = await query<{ id: string }>(
        `SELECT id FROM email_outbox
         WHERE status = 'pending' AND scheduled_at <= now()
         ORDER BY created_at ASC LIMIT 20`
      );
      for (const row of pending.rows) {
        await sendOutboxEmailNow(row.id).catch(() => undefined);
      }
    } catch {
      // Ignore sweep cycle errors
    }
  }, 60_000);

  const shutdown = async () => {
    clearInterval(sweepTimer);
    await Promise.all([emailWorker.close(), videoWorker.close(), driveWorker.close()]);
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("[frateli-worker] Listening on queues: email-send, video-process, drive-import");
}

startWorker().catch((err) => {
  console.error("[frateli-worker] Fatal startup error:", err);
  process.exit(1);
});
