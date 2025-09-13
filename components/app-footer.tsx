"use client";

import { Github, Heart } from "lucide-react";
import { useEffect, useState } from "react";

export function AppFooter() {
  const [version, setVersion] = useState("0.1.0");

  useEffect(() => {
    // Get version from HTML data attribute set by layout
    const buildId = document.documentElement.getAttribute("data-build-id");
    if (buildId) {
      setVersion(buildId);
    }
  }, []);

  return (
    <footer className="border-t bg-white dark:bg-gray-800 mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <span>Made with</span>
            <Heart className="h-4 w-4 text-red-500 fill-current" />
            <span>by the community</span>
          </div>

          <div className="flex items-center gap-6">
            <a
              href="https://github.com/Janhouse/traefik-proxy-admin"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <Github className="h-4 w-4" />
              <span>Source Code</span>
            </a>

            <div className="flex items-center gap-2">
              <span>Licensed under</span>
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.html"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                AGPL-v3
              </a>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
            <span>Version {version}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}