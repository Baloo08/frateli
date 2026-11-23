import crypto from "node:crypto";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { getEncryptionSecret } from "./env";

const BASE32_SAFE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, {
    algorithm: 2, // Argon2id
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify(hash, password);
  } catch {
    return false;
  }
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function generateVerificationCode(year = new Date().getUTCFullYear()): string {
  const bytes = crypto.randomBytes(8);
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += BASE32_SAFE[bytes[i] % BASE32_SAFE.length];
  }
  return `FRT-${year}-${suffix}`;
}

export function buildCertificateHash(payload: {
  certificateId: string;
  courseId: string;
  finalGradePct: string;
  issuedAt: string;
  studentId: string;
}): string {
  const canonical = JSON.stringify({
    certificateId: payload.certificateId,
    courseId: payload.courseId,
    finalGradePct: payload.finalGradePct,
    issuedAt: payload.issuedAt,
    studentId: payload.studentId,
  });
  return sha256Hex(canonical);
}

function deriveAesKey(): Buffer {
  return crypto.createHash("sha256").update(getEncryptionSecret(), "utf8").digest();
}

export function encryptSecret(plaintext: string): string {
  const key = deriveAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted secret format");
  }
  const key = deriveAesKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
