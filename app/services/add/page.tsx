"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { ServiceForm } from "@/components/service-form";
import { useServices } from "@/hooks/use-services";
import { useRouter } from "next/navigation";
import type { ServiceFormData } from "@/hooks/use-service-form";

export default function AddServicePage() {
  const { saveService, defaultDuration } = useServices();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (serviceData: ServiceFormData) => {
    setSaving(true);
    try {
      await saveService(serviceData, null);
      router.push("/");
    } catch (error) {
      console.error("Failed to save service:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push("/");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={handleCancel}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Services
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Add Service</h1>
            <p className="text-muted-foreground">
              Create a new Traefik proxy service
            </p>
          </div>
        </div>

        <ServiceForm
          service={null}
          defaultDuration={defaultDuration}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitting={saving}
        />
      </div>
    </AppLayout>
  );
}