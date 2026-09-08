"use client";

import { Button } from "@/components/ui/button";
import { Save, RefreshCw, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { ConfigForm } from "@/components/config-form";
import { useConfig } from "@/lib/hooks/use-config";
import { useManagedMode } from "@/lib/hooks/use-managed-mode";

export default function ConfigPage() {
  const {
    config,
    setConfig,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    handleSave,
    handleDiscard,
  } = useConfig();
  const managed = useManagedMode();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageBand
        eyebrow="Global"
        title="Configuration"
        subtitle="Global Traefik & certificate settings"
        actions={
          <>
            {managed && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--brand)_40%,transparent)] bg-[var(--grad-brand-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--brand)]"
                title="This panel manages Traefik's static and dynamic configuration"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Fully managed
              </span>
            )}
            {hasUnsavedChanges && (
              <Button variant="outline" onClick={handleDiscard}>
                Discard Changes
              </Button>
            )}
            <Button
              className="btn-brand"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving…" : "Save Configuration"}
            </Button>
          </>
        }
      />
      <PageMain>
        <ConfigForm config={config} onConfigChange={setConfig} />
      </PageMain>
    </AppLayout>
  );
}
