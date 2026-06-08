"use client";

import NextLink from "next/link";
import { ArrowLeft } from "lucide-react";

/** Standard page content container (matches the header/band width). */
export function PageMain({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`mx-auto w-full max-w-[1240px] flex-1 px-4 py-7 sm:px-6 ${className}`}
    >
      {children}
    </main>
  );
}

interface PageBandProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Optional back link rendered above the title. */
  backHref?: string;
  backLabel?: string;
  /** Right-aligned action area (buttons, badges). */
  actions?: React.ReactNode;
}

export function PageBand({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  actions,
}: PageBandProps) {
  return (
    <div className="page-band">
      <div className="relative mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6">
        {backHref && (
          <NextLink
            href={backHref}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-[15px] w-[15px]" />
            {backLabel}
          </NextLink>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h1 className="mt-1.5 text-[26px] font-bold leading-tight tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {actions && (
            <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      </div>
    </div>
  );
}
