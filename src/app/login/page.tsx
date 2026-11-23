import { redirect } from "next/navigation";
import { getCurrentUser, getDefaultPortalPath } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { AppShell } from "@/components/AppShell";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser().catch(() => null);
  if (user) {
    redirect(getDefaultPortalPath(user.role));
  }
  const locale = await getLocale();

  return (
    <AppShell user={null} locale={locale}>
      <div style={{ maxWidth: "520px", margin: "24px auto" }}>
        <LoginForm locale={locale} />
      </div>
    </AppShell>
  );
}
