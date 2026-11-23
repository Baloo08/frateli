import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { getLocale } from "@/i18n";

export const metadata: Metadata = {
  title: "Frateli Campus Virtual — LMS",
  description: "Plataforma LMS bilingüe (ES/EN) accesible WCAG 2.1 AA con Video Studio, IA Gemini y Google Workspace.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser().catch(() => null);
  const locale = await getLocale(user?.preferredLocale);

  return (
    <html lang={locale}>
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body>{children}</body>
    </html>
  );
}
