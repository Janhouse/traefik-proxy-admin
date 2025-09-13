"use client";

import { Button } from "@/components/ui/button";
import { Save, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { ConfigForm } from "@/components/config-form";
import { useConfig } from "@/lib/hooks/use-config";

export default function ConfigPage() {
  const {
    config,
    setConfig,
    middlewareText,
    setMiddlewareText,
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
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Global Configuration</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Configure global settings for Traefik and SSL certificates
            </p>
          </div>
          <div className="flex gap-2">
            {hasUnsavedChanges && (
              <Button variant="outline" onClick={handleDiscard}>
                Discard Changes
              </Button>
            )}
            <Button onClick={handleSave} disabled={isSaving || !hasUnsavedChanges}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>

        <ConfigForm
          config={config}
          onConfigChange={setConfig}
          middlewareText={middlewareText}
          onMiddlewareTextChange={setMiddlewareText}
        />
      </div>
    </AppLayout>
  );
}