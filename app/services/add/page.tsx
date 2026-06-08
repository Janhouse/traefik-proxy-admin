"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { ServiceForm } from "@/components/service-form";
import { useServices } from "@/hooks/use-services";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toaster";
import type { ServiceFormData } from "@/hooks/use-service-form";

export default function AddServicePage() {
  const { saveService, defaultDuration } = useServices();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (serviceData: ServiceFormData) => {
    setSaving(true);
    try {
      await saveService(serviceData, null);
      toast("Service created");
      router.push("/services");
    } catch (error) {
      console.error("Failed to save service:", error);
      toast("Failed to create service", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <PageBand
        eyebrow="New"
        title="Add Service"
        subtitle="Create a new Traefik proxy route."
        backHref="/services"
        backLabel="Back to Services"
      />
      <PageMain>
        <ServiceForm
          service={null}
          defaultDuration={defaultDuration}
          onSubmit={handleSubmit}
          onCancel={() => router.push("/services")}
          submitting={saving}
        />
      </PageMain>
    </AppLayout>
  );
}
