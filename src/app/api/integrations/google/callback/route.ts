import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveGoogleOAuthTokens } from "@/lib/google";
import { getEnv } from "@/lib/env";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;
  const user = await getCurrentUser();
  if (!user || user.role !== "superadmin") {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("frateli_google_oauth_state")?.value;
  cookieStore.delete("frateli_google_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/admin/resources?google=oauth_error", appUrl));
  }

  try {
    const { accountEmail } = await saveGoogleOAuthTokens(code, user.id);
    await logAudit({
      actorId: user.id,
      actorRole: user.role,
      portalContext: "admin",
      action: "integration.google_connected",
      resourceType: "google_integration",
      resourceId: accountEmail,
    });
    return NextResponse.redirect(new URL("/admin/resources?google=connected", appUrl));
  } catch (err) {
    console.error("[google-oauth] Callback error:", err);
    return NextResponse.redirect(new URL("/admin/resources?google=oauth_error", appUrl));
  }
}
