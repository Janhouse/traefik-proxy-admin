"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { ServiceForm } from "@/components/service-form";
import { StatusBadge } from "@/components/traefik/status-badge";
import { useServices } from "@/hooks/use-services";
import { useRouter, useParams } from "next/navigation";
import { toast } from "@/components/toaster";
import type { Service } from "@/components/service-table";
import type { ServiceFormData } from "@/hooks/use-service-form";

export default function EditServicePage() {
  const { saveService, defaultDuration, fetchServiceById } = useServices();
  const router = useRouter();
  const params = useParams();
  const [saving, setSaving] = useState(false);
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  const serviceId = params.id as string;

  useEffect(() => {
    const load = async () => {
      try {
        const found = await fetchServiceById(serviceId);
        if (found) setService(found);
        else router.push("/services");
      } catch (error) {
        console.error("Failed to load service:", error);
        router.push("/services");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [serviceId, fetchServiceById, router]);

  const handleSubmit = async (serviceData: ServiceFormData) => {
    if (!service) return;
    setSaving(true);
    try {
      await saveService(serviceData, service);
      toast("Service updated");
      router.push("/services");
    } catch (error) {
      console.error("Failed to save service:", error);
      toast("Failed to update service", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          Loading service…
        </div>
      </AppLayout>
    );
  }

  if (!service) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16 text-[var(--danger)]">
          Service not found
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageBand
        eyebrow="Edit Service"
        title={service.name}
        subtitle="Modify the route, target and access policy for this service."
        backHref="/services"
        backLabel="Back to Services"
        actions={<StatusBadge enabled={service.enabled} />}
      />
      <PageMain>
        <ServiceForm
          service={service}
          defaultDuration={defaultDuration}
          onSubmit={handleSubmit}
          onCancel={() => router.push("/services")}
          submitting={saving}
        />
      </PageMain>
    </AppLayout>
  );
}
