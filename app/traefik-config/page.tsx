"use client";

import { useState, useEffect } from "react";
import { Copy, AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/toaster";

interface GlobalConfig {
  sampleDomain: string;
  certResolver: string;
  globalMiddlewares: string[];
  adminPanelDomain: string;
  defaultEntrypoint?: string;
}

function CodeBlock({
  fname,
  code,
  onCopy,
}: {
  fname: string;
  code: string;
  onCopy: () => void;
}) {
  return (
    <div className="code">
      <div className="code-head">
        <span className="code-glyph">&lt;&gt;</span>
        <span className="fname">{fname}</span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={onCopy}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

export default function TraefikConfigPage() {
  const [config, setConfig] = useState<GlobalConfig>({
    sampleDomain: "example.com",
    certResolver: "letsencrypt",
    globalMiddlewares: [],
    adminPanelDomain: "localhost:3000",
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) setConfig(await res.json());
      } catch (error) {
        console.error("Error fetching config:", error);
      }
    })();
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard", "success");
    } catch (error) {
      console.error("Failed to copy text:", error);
    }
  };

  const traefikYaml = `# Add to traefik.yml or enable in args
providers:
  http:
    endpoint: "http://${config.adminPanelDomain}/api/traefik/config"
    pollInterval: "10s"
`;

  const dockerCompose = `# docker-compose.yml
services:
  traefik:
    image: traefik:v3.0
    container_name: traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"  # Dashboard port (optional)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/traefik.yml:ro
      - ./acme.json:/acme.json
    environment:
      # Add your DNS provider credentials here
      - CLOUDFLARE_EMAIL=your-email@example.com
      - CLOUDFLARE_API_KEY=your-api-key
    networks:
      - traefik

networks:
  traefik:
    external: true`;

  return (
    <AppLayout>
      <PageBand
        eyebrow="Setup"
        title="Traefik Configuration"
        subtitle="Point Traefik at this admin panel as a dynamic HTTP configuration provider."
        backHref="/"
        backLabel="Back to Dashboard"
      />

      <PageMain>
        <div className="mx-auto max-w-[920px] space-y-8">
          {/* Step 1 */}
          <section className="space-y-3">
            <div className="sec-title">
              <span className="step-num">1</span>
              Traefik configuration
              <span className="ln" />
            </div>
            <p className="fs-desc">
              Create or update your traefik.yml with the following provider
              configuration:
            </p>
            <CodeBlock
              fname="traefik.yml"
              code={traefikYaml}
              onCopy={() => copyToClipboard(traefikYaml)}
            />
          </section>

          {/* Step 2 */}
          <section className="space-y-3">
            <div className="sec-title">
              <span className="step-num">2</span>
              Docker Compose setup (optional)
              <span className="ln" />
            </div>
            <p className="fs-desc">
              If using Docker Compose, here&apos;s a sample configuration:
            </p>
            <CodeBlock
              fname="docker-compose.yml"
              code={dockerCompose}
              onCopy={() => copyToClipboard(dockerCompose)}
            />
          </section>

          {/* Step 3 — notes */}
          <section className="space-y-3">
            <div className="sec-title">
              <span className="step-num">3</span>
              Important notes
              <span className="ln" />
            </div>
            <div className="callout warn">
              <AlertTriangle className="ico" />
              <div className="space-y-2">
                <h4 className="text-[13.5px] font-semibold">
                  Before you proceed
                </h4>
                <ul className="space-y-2">
                  <li className="text-[13px] text-[var(--fg-2)]">
                    <strong className="text-foreground">
                      HTTP provider URL:
                    </strong>{" "}
                    Ensure Traefik can reach{" "}
                    <code className="mono rounded bg-[var(--surface-2)] px-1 py-0.5 text-[var(--brand)]">
                      http://{config.adminPanelDomain}/api/traefik/config
                    </code>
                  </li>
                  <li className="text-[13px] text-[var(--fg-2)]">
                    <strong className="text-foreground">DNS challenge:</strong>{" "}
                    Configure your DNS provider credentials for wildcard
                    certificates
                  </li>
                  <li className="text-[13px] text-[var(--fg-2)]">
                    <strong className="text-foreground">
                      Certificate resolver:
                    </strong>{" "}
                    Match the resolver name (
                    <span className="mono">{config.certResolver}</span>) in the
                    global config
                  </li>
                  <li className="text-[13px] text-[var(--fg-2)]">
                    <strong className="text-foreground">
                      Wildcard certificate:
                    </strong>{" "}
                    A route for <span className="mono">{config.sampleDomain}</span>{" "}
                    requests both <span className="mono">{config.sampleDomain}</span>{" "}
                    and <span className="mono">*.{config.sampleDomain}</span>{" "}
                    certificates
                  </li>
                  <li className="text-[13px] text-[var(--fg-2)]">
                    <strong className="text-foreground">Network access:</strong>{" "}
                    Both Traefik and the admin panel must be reachable from each
                    other
                  </li>
                  <li className="text-[13px] text-[var(--fg-2)]">
                    <strong className="text-foreground">
                      Request metrics (optional):
                    </strong>{" "}
                    for the per-route traffic histograms, run Traefik with{" "}
                    <span className="mono">--metrics.prometheus=true</span>{" "}
                    <span className="mono">
                      --metrics.prometheus.addRoutersLabels=true
                    </span>{" "}
                    <span className="mono">
                      --metrics.prometheus.addServicesLabels=true
                    </span>
                    . The admin reads{" "}
                    <span className="mono">TRAEFIK_METRICS_URL</span> (default{" "}
                    <span className="mono">{"${TRAEFIK_API_URL}"}/metrics</span>).
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Current config */}
          <section className="space-y-3">
            <div className="sec-title">
              Current configuration
              <span className="ln" />
            </div>
            <div className="rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4">
              <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sample domain
                  </span>
                  <p className="mono mt-0.5 text-foreground">
                    {config.sampleDomain}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Cert resolver
                  </span>
                  <p className="mono mt-0.5 text-foreground">
                    {config.certResolver}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Admin panel
                  </span>
                  <p className="mono mt-0.5 text-foreground">
                    {config.adminPanelDomain}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Default entrypoint
                  </span>
                  <p className="mono mt-0.5 text-foreground">
                    {config.defaultEntrypoint || (
                      <span className="text-[var(--meta)]">Not set</span>
                    )}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Global middlewares
                  </span>
                  <p className="mono mt-0.5 text-foreground">
                    {config.globalMiddlewares.length > 0 ? (
                      config.globalMiddlewares.join(", ")
                    ) : (
                      <span className="text-[var(--meta)]">None</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-3 border-t border-[var(--border-soft)] pt-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Note:</strong> A route for{" "}
                <span className="mono">{config.sampleDomain}</span> automatically
                requests certificates for both{" "}
                <span className="mono">{config.sampleDomain}</span> and{" "}
                <span className="mono">*.{config.sampleDomain}</span> using the
                domain configuration.
              </div>
            </div>
          </section>
        </div>
      </PageMain>
    </AppLayout>
  );
}
