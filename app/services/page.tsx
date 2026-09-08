"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { ServiceTable, type Service } from "@/components/service-table";
import { Button } from "@/components/ui/button";
import { useServices } from "@/hooks/use-services";
import { useBackendHealth, useTraefikMetrics } from "@/hooks/use-traefik";

export default function ServicesPage() {
  const {
    services,
    loading,
    fetchServices,
    deleteService,
    toggleService,
    generateShareLink,
  } = useServices();
  const { health, refresh: refreshHealth } = useBackendHealth(15000);
  const { metrics, refresh: refreshMetrics } = useTraefikMetrics(30000);
  const router = useRouter();

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const refreshAll = () => {
    fetchServices();
    refreshHealth();
    refreshMetrics();
  };

  const handleManageSecurity = (service: Service) =>
    router.push(`/services/${service.id}/security`);

  const handleShare = async (serviceId: string) => {
    try {
      await generateShareLink(serviceId);
    } catch (error) {
      console.error("Failed to generate share link:", error);
    }
  };

  const enabledCount = services.filter((s) => s.enabled).length;

  return (
    <AppLayout>
      <PageBand
        eyebrow="Manage"
        title="Services"
        subtitle={
          <>
            {services.length} proxy route{services.length === 1 ? "" : "s"} ·{" "}
            <span className="font-mono text-[var(--success)]">
              {enabledCount} enabled
            </span>
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={refreshAll} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button className="btn-brand" onClick={() => router.push("/services/add")}>
              <Plus className="h-4 w-4" />
              Add Service
            </Button>
          </>
        }
      />
      <PageMain>
        <ServiceTable
          services={services}
          loading={loading}
          health={health}
          metrics={metrics}
          onDelete={deleteService}
          onToggle={toggleService}
          onManageSecurity={handleManageSecurity}
          onGenerateShareLink={handleShare}
          onRefresh={refreshAll}
        />
      </PageMain>
    </AppLayout>
  );
}
