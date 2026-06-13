"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Settings, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppFooter } from "@/components/app-footer";
import { Toaster } from "@/components/toaster";
import { useManagedMode } from "@/lib/hooks/use-managed-mode";

interface AppLayoutProps {
  children: React.ReactNode;
}

const NAV: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/", label: "Dashboard", match: (p) => p === "/" },
  { href: "/services", label: "Services", match: (p) => p.startsWith("/services") },
  { href: "/domains", label: "Domains", match: (p) => p.startsWith("/domains") },
  { href: "/runtime", label: "Runtime", match: (p) => p.startsWith("/runtime") },
  { href: "/security", label: "Security", match: (p) => p.startsWith("/security") },
  { href: "/sessions", label: "Sessions", match: (p) => p.startsWith("/sessions") },
  { href: "/config", label: "Config", match: (p) => p.startsWith("/config") },
];

function BrandMark() {
  return (
    <span className="brand-mark">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <circle cx="5" cy="6" r="2" />
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="12" r="2" />
        <path d="M7 6h6a4 4 0 0 1 4 4M7 18h6a4 4 0 0 0 4-4" />
      </svg>
    </span>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const managed = useManagedMode();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="app-header">
        <div className="mx-auto flex h-[60px] w-full max-w-[1240px] items-center gap-5 px-4 sm:px-6">
          <div className="relative">
            {managed && (
              <span
                className="pointer-events-none absolute -top-2.5 left-6 z-10 -rotate-[7deg] select-none rounded-[3px] border border-[color-mix(in_oklab,var(--brand)_45%,transparent)] bg-[var(--grad-brand-soft)] px-1.5 py-[1px] text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-[var(--brand)]"
                title="Fully managed Traefik — this panel controls Traefik's static and dynamic configuration"
              >
                Managed
              </span>
            )}
            <NextLink
              href="/"
              className="flex items-center gap-2.5 whitespace-nowrap text-base font-bold tracking-tight text-foreground"
            >
              <BrandMark />
              Traefik Admin
            </NextLink>
          </div>

          <nav className="hidden items-center gap-0.5 lg:flex">
            {NAV.map((item) => (
              <NextLink
                key={item.href}
                href={item.href}
                className={`nav-link ${item.match(pathname) ? "active" : ""}`}
              >
                {item.label}
              </NextLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <div className="hidden items-center gap-2.5 sm:flex">
              <NextLink
                href="/traefik-config"
                className={`icon-btn !w-auto gap-2 px-3 text-[13.5px] font-semibold ${
                  pathname.startsWith("/traefik-config")
                    ? "text-[var(--brand)]"
                    : "text-foreground"
                }`}
              >
                <Settings className="h-4 w-4" />
                <span className="hidden md:inline">Traefik Config</span>
              </NextLink>
            </div>
            <ThemeToggle />
            <button
              type="button"
              className="icon-btn lg:hidden"
              aria-label="Menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              {mobileMenuOpen ? (
                <X className="h-[18px] w-[18px]" />
              ) : (
                <Menu className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile sheet */}
        {mobileMenuOpen && (
          <div className="border-t bg-[var(--surface-2)] lg:hidden">
            <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-1 px-4 py-3 sm:px-6">
              {NAV.map((item) => (
                <NextLink
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium ${
                    item.match(pathname)
                      ? "bg-[var(--grad-brand-soft)] text-[var(--brand)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </NextLink>
              ))}
              <div className="mt-2 border-t pt-3 sm:hidden">
                <NextLink
                  href="/traefik-config"
                  onClick={() => setMobileMenuOpen(false)}
                  className="icon-btn !w-auto gap-2 px-3 text-[13.5px] font-semibold text-foreground"
                >
                  <Settings className="h-4 w-4" />
                  Traefik Config
                </NextLink>
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col">
        {children}
        <AppFooter />
      </div>
      <Toaster />
    </div>
  );
}
