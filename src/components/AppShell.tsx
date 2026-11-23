import Link from "next/link";
import { hasStudioAccess, type SessionUser } from "@/lib/auth";
import { getMessages, type Locale } from "@/i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { LogoutButton } from "./LogoutButton";

interface AppShellProps {
  user: SessionUser | null;
  locale: Locale;
  activePortal?: "catalog" | "admin" | "teach" | "learn" | "studio";
  theme?: "academic" | "studio";
  children: React.ReactNode;
}

export function AppShell({
  user,
  locale,
  activePortal = "catalog",
  theme = "academic",
  children,
}: AppShellProps) {
  const m = getMessages(locale);
  const canStudio = user ? hasStudioAccess(user) : false;

  return (
    <div data-theme={theme === "studio" ? "studio" : "academic"} style={{ minHeight: "100vh", background: "var(--bg-page)", color: "var(--text-primary)" }}>
      <a href="#main-content" className="skip-link visually-hidden">
        {m.skipToMain}
      </a>

      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/" className="brand-link">
            <span className="brand-badge" aria-hidden="true">F</span>
            <span>{m.brand}</span>
          </Link>

          <nav aria-label={locale === "es" ? "Navegación principal" : "Primary navigation"}>
            <ul className="nav-list">
              <li>
                <Link
                  href="/"
                  className="nav-link"
                  aria-current={activePortal === "catalog" ? "page" : undefined}
                >
                  {m.nav.catalog}
                </Link>
              </li>

              {user?.role === "superadmin" && (
                <li>
                  <Link
                    href="/admin"
                    className="nav-link"
                    aria-current={activePortal === "admin" ? "page" : undefined}
                  >
                    {m.nav.admin}
                  </Link>
                </li>
              )}

              {(user?.role === "superadmin" || user?.role === "teacher") && (
                <li>
                  <Link
                    href="/teach"
                    className="nav-link"
                    aria-current={activePortal === "teach" ? "page" : undefined}
                  >
                    {m.nav.teach}
                  </Link>
                </li>
              )}

              {user && (
                <li>
                  <Link
                    href="/learn"
                    className="nav-link"
                    aria-current={activePortal === "learn" ? "page" : undefined}
                  >
                    {m.nav.learn}
                  </Link>
                </li>
              )}

              {canStudio && (
                <li>
                  <Link
                    href="/studio"
                    className="nav-link"
                    aria-current={activePortal === "studio" ? "page" : undefined}
                  >
                    {m.nav.studio}
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          <div className="row">
            <LocaleSwitcher currentLocale={locale} />
            {user ? (
              <>
                <span className="badge" title={user.email}>
                  {user.fullName} ({user.role})
                </span>
                <LogoutButton label={m.nav.logout} />
              </>
            ) : (
              <Link href="/login" className="btn btn-primary" style={{ minHeight: "38px" }}>
                {m.nav.login}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="main-container">
        {children}
      </main>
    </div>
  );
}
