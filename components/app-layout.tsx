"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Settings, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { TraefikConfigDialog } from "@/components/traefik-config-dialog";
import { AppFooter } from "@/components/app-footer";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-800 flex-shrink-0">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Traefik Admin
              </h1>
              <nav className="hidden md:flex space-x-6">
                <NextLink
                  href="/"
                  className={
                    isActive("/")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Services
                </NextLink>
                <NextLink
                  href="/domains"
                  className={
                    isActive("/domains")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Domains
                </NextLink>
                <NextLink
                  href="/security"
                  className={
                    isActive("/security")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Security
                </NextLink>
                <NextLink
                  href="/sessions"
                  className={
                    isActive("/sessions")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Sessions
                </NextLink>
                <NextLink
                  href="/config"
                  className={
                    isActive("/config")
                      ? "text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  }
                >
                  Config
                </NextLink>
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2">
                <TraefikConfigDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Traefik Config
                    </Button>
                  }
                />
                <ThemeToggle />
              </div>
              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-white dark:bg-gray-800">
            <div className="container mx-auto px-4 py-4 space-y-3">
              <NextLink
                href="/"
                className={`block ${
                  isActive("/")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Services
              </NextLink>
              <NextLink
                href="/domains"
                className={`block ${
                  isActive("/domains")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Domains
              </NextLink>
              <NextLink
                href="/security"
                className={`block ${
                  isActive("/security")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Security
              </NextLink>
              <NextLink
                href="/sessions"
                className={`block ${
                  isActive("/sessions")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Sessions
              </NextLink>
              <NextLink
                href="/config"
                className={`block ${
                  isActive("/config")
                    ? "text-gray-900 dark:text-gray-100 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Config
              </NextLink>
              <div className="flex items-center gap-2 pt-2 border-t">
                <TraefikConfigDialog
                  trigger={
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Traefik Config
                    </Button>
                  }
                />
                <ThemeToggle />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="container mx-auto px-4 py-8 flex-1">
          {children}
        </div>
        <AppFooter />
      </div>
    </div>
  );
}