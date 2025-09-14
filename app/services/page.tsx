"use client";

import { Button } from "@/components/ui/button";
import { Plus, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { ServiceTable } from "@/components/service-table";
import { useServices } from "@/hooks/use-services";
import { useRouter } from "next/navigation";
import type { Service } from "@/components/service-table";

export default function ServicesPage() {
  const {
    services,
    loading,
    fetchServices,
    deleteService,
    toggleService,
    generateShareLink,
  } = useServices();

  const router = useRouter();

  const handleAddNew = () => {
    router.push("/services/add");
  };

  const handleEdit = (service: Service) => {
    router.push(`/services/${service.id}/edit`);
  };

  const handleManageSecurity = (service: Service) => {
    router.push(`/services/${service.id}/security`);
  };

  const handleGenerateShareLink = async (serviceId: string) => {
    try {
      const url = await generateShareLink(serviceId);
      // Copy to clipboard
      await navigator.clipboard.writeText(url);
      // Could add a toast notification here
    } catch (error) {
      console.error("Failed to generate share link:", error);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Services</h1>
            <p className="text-muted-foreground">
              Manage your Traefik proxy services
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={fetchServices}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleAddNew}>
              <Plus className="h-4 w-4 mr-2" />
              Add Service
            </Button>
          </div>
        </div>

        <ServiceTable
          services={services}
          loading={loading}
          onAddNew={handleAddNew}
          onEdit={handleEdit}
          onDelete={deleteService}
          onToggle={toggleService}
          onManageSecurity={handleManageSecurity}
          onGenerateShareLink={handleGenerateShareLink}
          onRefresh={fetchServices}
        />
      </div>
    </AppLayout>
  );
}