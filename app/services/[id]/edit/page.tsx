"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { ServiceForm } from "@/components/service-form";
import { useServices } from "@/hooks/use-services";
import { useRouter, useParams } from "next/navigation";
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
    const loadService = async () => {
      try {
        const foundService = await fetchServiceById(serviceId);
        if (foundService) {
          setService(foundService);
        } else {
          console.log("Service not found, redirecting to home");
          router.push("/");
        }
      } catch (error) {
        console.error("Failed to load service:", error);
        router.push("/");
      } finally {
        setLoading(false);
      }
    };

    loadService();
  }, [serviceId, fetchServiceById, router]);

  const handleSubmit = async (serviceData: ServiceFormData) => {
    if (!service) return;

    setSaving(true);
    try {
      await saveService(serviceData, service);
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

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-lg">Loading service...</div>
        </div>
      </AppLayout>
    );
  }

  if (!service) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-lg text-red-600">Service not found</div>
        </div>
      </AppLayout>
    );
  }

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
            <h1 className="text-3xl font-bold">Edit Service</h1>
            <p className="text-muted-foreground">
              Modify {service.name}
            </p>
          </div>
        </div>

        <ServiceForm
          service={service}
          defaultDuration={defaultDuration}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitting={saving}
        />
      </div>
    </AppLayout>
  );
}