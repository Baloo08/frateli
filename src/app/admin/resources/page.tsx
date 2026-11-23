import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLocale } from "@/i18n";
import { getActiveStorageDriver } from "@/lib/storage";
import { getAiProviderStatus } from "@/lib/ai";
import { getActiveGoogleIntegration, isGoogleOAuthConfigured } from "@/lib/google";
import { getEnv } from "@/lib/env";
import { AppShell } from "@/components/AppShell";
import { AdminResourcesClient } from "@/components/AdminResourcesClient";

export const dynamic = "force-dynamic";

export default async function AdminResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const user = await requireRole(["superadmin"]);
  const locale = await getLocale(user.preferredLocale);
  const params = await searchParams;
  const [integration, aiStatus] = await Promise.all([
    getActiveGoogleIntegration().catch(() => null),
    getAiProviderStatus(),
  ]);
  const env = getEnv();

  return (
    <AppShell user={user} locale={locale} activePortal="admin">
      <div className="stack">
        <div className="row">
          <Link href="/admin" className="btn">← {locale === "es" ? "Volver a Admin" : "Back to Admin"}</Link>
        </div>
        <AdminResourcesClient
          locale={locale}
          storageDriver={getActiveStorageDriver()}
          initialAiStatus={aiStatus}
          smtpConfigured={Boolean(env.SMTP_USER && env.SMTP_APP_PASSWORD)}
          smtpUser={env.SMTP_USER || null}
          googleOAuthConfigured={isGoogleOAuthConfigured()}
          googleConnected={
            integration
              ? {
                  accountEmail: integration.account_email,
                  rootFolderId: integration.root_folder_id,
                  rootFolderName: integration.root_folder_name,
                }
              : null
          }
          googleStatusParam={params.google || null}
        />
      </div>
    </AppShell>
  );
}
