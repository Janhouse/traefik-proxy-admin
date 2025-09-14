"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, FileText } from "lucide-react";

interface TraefikConfigDialogProps {
  trigger: React.ReactNode;
}

interface GlobalConfig {
  sampleDomain: string;
  certResolver: string;
  globalMiddlewares: string[];
  adminPanelDomain: string;
  defaultEntrypoint?: string;
}

export function TraefikConfigDialog({ trigger }: TraefikConfigDialogProps) {
  const [config, setConfig] = useState<GlobalConfig>({
    sampleDomain: "example.com",
    certResolver: "letsencrypt",
    globalMiddlewares: [],
    adminPanelDomain: "localhost:3000",
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (error) {
      console.error("Error fetching config:", error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy text:", error);
    }
  };

  const traefikYaml = `# Add to traefik.yml or enable in a args
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
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="min-w-[90vw] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Traefik Configuration
          </DialogTitle>
          <DialogDescription>
            Configure Traefik to use this admin panel as a dynamic configuration provider.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step 1 */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">1. Traefik Configuration (traefik.yml)</h3>
            <p className="text-sm text-muted-foreground">
              Create or update your traefik.yml file with the following configuration:
            </p>
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                <code>{traefikYaml}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(traefikYaml)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">2. Docker Compose Setup (Optional)</h3>
            <p className="text-sm text-muted-foreground">
              If using Docker Compose, here&apos;s a sample configuration:
            </p>
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                <code>{dockerCompose}</code>
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(dockerCompose)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Step 3 */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">3. Important Notes</h3>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="font-medium">•</span>
                  <span>
                    <strong>HTTP Provider URL:</strong> Ensure Traefik can reach{" "}
                    <code className="bg-muted px-1 py-0.5 rounded">
                      http://{config.adminPanelDomain}/api/traefik/config
                    </code>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium">•</span>
                  <span>
                    <strong>DNS Challenge:</strong> Configure your DNS provider credentials for wildcard certificates
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium">•</span>
                  <span>
                    <strong>Certificate Resolver:</strong> Match the resolver name ({config.certResolver}) in global config
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium">•</span>
                  <span>
                    <strong>Wildcard Certificate:</strong> A route for {config.sampleDomain} requests both {config.sampleDomain} and *.{config.sampleDomain} certificates
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-medium">•</span>
                  <span>
                    <strong>Network Access:</strong> Both Traefik and the admin panel must be accessible to each other
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Current Config */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Current Configuration</h3>
            <div className="bg-muted p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Sample Domain:</strong> {config.sampleDomain}
                </div>
                <div>
                  <strong>Cert Resolver:</strong> {config.certResolver}
                </div>
                <div>
                  <strong>Admin Panel:</strong> {config.adminPanelDomain}
                </div>
                <div>
                  <strong>Default Entrypoint:</strong> {config.defaultEntrypoint || "Not set"}
                </div>
                <div className="col-span-2">
                  <strong>Global Middlewares:</strong> {config.globalMiddlewares.length > 0 ? config.globalMiddlewares.join(", ") : "None"}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                <strong>Note:</strong> A route for {config.sampleDomain} automatically requests certificates for both {config.sampleDomain} and *.{config.sampleDomain} using domains configuration
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}