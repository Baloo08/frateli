import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "./env";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const env = getEnv();
    s3Client = new S3Client({
      region: env.S3_REGION || "auto",
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: env.S3_SECRET_ACCESS_KEY || "",
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

export function getActiveStorageDriver(): "local" | "s3" {
  const env = getEnv();
  if (env.STORAGE_DRIVER === "s3" && env.S3_ENDPOINT && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    return "s3";
  }
  return "local";
}

function resolveSafeLocalPath(key: string): string {
  const baseDir = path.resolve(getEnv().LOCAL_STORAGE_DIR);
  const cleanKey = key.replace(/^\/+/, "").replace(/\.\./g, "");
  const resolved = path.resolve(baseDir, cleanKey);
  if (!resolved.startsWith(baseDir)) {
    throw new Error("Unsafe local storage path");
  }
  return resolved;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<{ driver: "local" | "s3"; key: string; sizeBytes: number }> {
  const driver = getActiveStorageDriver();
  if (driver === "s3") {
    const env = getEnv();
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return { driver: "s3", key, sizeBytes: body.byteLength };
  }

  const filePath = resolveSafeLocalPath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
  return { driver: "local", key, sizeBytes: body.byteLength };
}

export async function getObjectBuffer(key: string, driverOverride?: "local" | "s3"): Promise<Buffer> {
  const driver = driverOverride ?? getActiveStorageDriver();
  if (driver === "s3") {
    const env = getEnv();
    const res = await getS3Client().send(
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key })
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("Empty S3 object");
    return Buffer.from(bytes);
  }
  const filePath = resolveSafeLocalPath(key);
  return fs.readFile(filePath);
}

export async function deleteObject(key: string, driverOverride?: "local" | "s3"): Promise<void> {
  const driver = driverOverride ?? getActiveStorageDriver();
  if (driver === "s3") {
    const env = getEnv();
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key })
    );
    return;
  }
  const filePath = resolveSafeLocalPath(key);
  await fs.rm(filePath, { force: true });
}

export async function getPresignedPutUrl(key: string, contentType: string, expiresInSec = 900): Promise<string | null> {
  if (getActiveStorageDriver() !== "s3") {
    return null;
  }
  const env = getEnv();
  return getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: expiresInSec }
  );
}

export function signMediaAccessToken(key: string, expiresAtUnixSec: number): string {
  const secret = getEnv().SESSION_SECRET;
  return crypto
    .createHmac("sha256", secret)
    .update(`${key}:${expiresAtUnixSec}`)
    .digest("hex");
}

export function verifyMediaAccessToken(key: string, expiresAtUnixSec: number, sig: string): boolean {
  if (Date.now() / 1000 > expiresAtUnixSec) return false;
  const expected = signMediaAccessToken(key, expiresAtUnixSec);
  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export async function getSignedReadUrl(
  key: string,
  driverOverride?: "local" | "s3",
  expiresInSec = 3600
): Promise<string> {
  const driver = driverOverride ?? getActiveStorageDriver();
  if (driver === "s3") {
    const env = getEnv();
    return getSignedUrl(
      getS3Client(),
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
      { expiresIn: expiresInSec }
    );
  }
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const sig = signMediaAccessToken(key, exp);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `/api/media/${encodedKey}?exp=${exp}&sig=${sig}`;
}

export async function openLocalFileStat(key: string) {
  const filePath = resolveSafeLocalPath(key);
  const stat = await fs.stat(filePath);
  return {
    filePath,
    size: stat.size,
    createStream: (start?: number, end?: number) =>
      createReadStream(filePath, start !== undefined && end !== undefined ? { start, end } : undefined),
  };
}
