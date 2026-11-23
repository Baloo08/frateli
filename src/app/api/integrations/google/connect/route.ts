import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { buildGoogleConsentUrl, isGoogleOAuthConfigured } from "@/lib/google";
import { getEnv } from "@/lib/env";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/admin/resources?google=missing_env", getEnv().NEXT_PUBLIC_APP_URL)
    );
  }

  const state = randomToken(16);
  const cookieStore = await cookies();
  cookieStore.set("frateli_google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = buildGoogleConsentUrl(state);
  return NextResponse.redirect(url);
}
