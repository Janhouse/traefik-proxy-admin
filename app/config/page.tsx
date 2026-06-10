"use client";

import { Button } from "@/components/ui/button";
import { Save, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { ConfigForm } from "@/components/config-form";
import { useConfig } from "@/lib/hooks/use-config";

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
