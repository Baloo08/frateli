import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "./db";
import { getEnv } from "./env";
import { randomToken, sha256Hex } from "./crypto";
import { getCacheRedis } from "./redis";
import type { UserRole } from "./audit";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: "invited" | "active" | "suspended";
  preferredLocale: "es" | "en";
  videoEditorEnabled: boolean;
  storageQuotaBytes: number;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function getSessionCookieName(): string {
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;
  return appUrl.startsWith("https://") ? "__Host-frateli_session" : "frateli_session";
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<string> {
  const token = randomToken(32);
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await query(
    `INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, meta.ipAddress ?? null, meta.userAgent ?? null, expiresAt]
  );

  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);

  try {
    const redis = getCacheRedis();
    await redis.set(`sess:${tokenHash}`, userId, "EX", SESSION_TTL_SECONDS);
  } catch {
    // PostgreSQL remains source of truth
  }

  const cookieStore = await cookies();
  const isHttps = getEnv().NEXT_PUBLIC_APP_URL.startsWith("https://");
  cookieStore.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const cookieName = getSessionCookieName();
  const token = cookieStore.get(cookieName)?.value;

  if (token) {
    const tokenHash = sha256Hex(token);
    await query(`UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1`, [tokenHash]);
    try {
      await getCacheRedis().del(`sess:${tokenHash}`);
    } catch {
      // Ignore cache cleanup failure
    }
  }

  cookieStore.delete(cookieName);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  if (!token) return null;

  const tokenHash = sha256Hex(token);
  const result = await query<{
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    status: "invited" | "active" | "suspended";
    preferred_locale: "es" | "en";
    video_editor_enabled: boolean;
    storage_quota_bytes: string;
  }>(
    `SELECT u.id, u.email, u.full_name, u.role, u.status, u.preferred_locale,
            u.video_editor_enabled, u.storage_quota_bytes::text
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
     LIMIT 1`,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row || row.status !== "active") {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    preferredLocale: row.preferred_locale,
    videoEditorEnabled: row.video_editor_enabled,
    storageQuotaBytes: Number(row.storage_quota_bytes),
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireRole(allowed: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    redirect(getDefaultPortalPath(user.role));
  }
  return user;
}

export async function requireStudioAccess(): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasStudioAccess(user)) {
    redirect(getDefaultPortalPath(user.role));
  }
  return user;
}

export function hasStudioAccess(user: SessionUser): boolean {
  if (user.role === "superadmin") return true;
  if (user.role === "teacher" && user.videoEditorEnabled) return true;
  return false;
}

export function getDefaultPortalPath(role: UserRole): string {
  switch (role) {
    case "superadmin":
      return "/admin";
    case "teacher":
      return "/teach";
    case "student":
      return "/learn";
  }
}
