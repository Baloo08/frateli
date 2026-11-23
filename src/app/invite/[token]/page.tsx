import { getLocale } from "@/i18n";
import { AppShell } from "@/components/AppShell";
import { InviteAcceptForm } from "@/components/InviteAcceptForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await getLocale();

  return (
    <AppShell user={null} locale={locale}>
      <div style={{ maxWidth: "500px", margin: "24px auto" }}>
        <InviteAcceptForm token={token} locale={locale} />
      </div>
    </AppShell>
  );
}
