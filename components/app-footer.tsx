"use client";

import { Code2, Heart } from "lucide-react";
import { useEffect, useState } from "react";

export function AppFooter() {
  const [version, setVersion] = useState("0.1.0");

  useEffect(() => {
    const buildId = document.documentElement.getAttribute("data-build-id");
    if (buildId) setVersion(buildId);
  }, []);

  return (
    <footer className="app-footer mt-10">
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center gap-4 px-4 py-[18px] text-[12.5px] text-muted-foreground sm:px-6">
        <span className="flex items-center gap-2">
          Made with
          <Heart className="h-4 w-4 fill-current text-[var(--danger)]" />
          by the community
        </span>

        <a
          href="https://github.com/Janhouse/traefik-proxy-admin"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 transition-colors hover:text-foreground"
        >
          <Code2 className="h-4 w-4" />
          Source Code
        </a>

        <span className="flex items-center gap-2">
          Licensed under
          <a
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            target="_blank"
            rel="noopener noreferrer"
            className="underline transition-colors hover:text-foreground"
          >
            AGPL-v3
          </a>
        </span>

        <span className="ml-auto font-mono text-[var(--meta)]">
          Version {version}
        </span>
      </div>
    </footer>
  );
}
