"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/app-layout";
import { ServiceSecurityList } from "@/components/service-security-list";
import { useServices } from "@/hooks/use-services";
import type { Service } from "@/components/service-table";

export default function ServiceSecurityPage() {
  const router = useRouter();
  const params = useParams();
  const serviceId = params.id as string;

  const { fetchServiceById } = useServices();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadService = async () => {
      if (!serviceId) return;

      setLoading(true);
      try {
        const foundService = await fetchServiceById(serviceId);
        if (foundService) {
          setService(foundService);
        } else {
          router.push("/services");
        }
      } catch (error) {
        console.error("Failed to load service:", error);
        router.push("/services");
      } finally {
        setLoading(false);
      }
    };

    loadService();
  }, [serviceId, fetchServiceById, router]);

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Loading...</h1>
              <p className="text-muted-foreground">Loading service security configuration</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!service) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/services")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Services
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Service Not Found</h1>
              <p className="text-muted-foreground">The requested service could not be found</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="h-8 w-8" />
              Security Configuration
            </h1>
            <p className="text-muted-foreground">
              Manage authentication and access control for <strong>{service.name}</strong>
            </p>
          </div>
        </div>

        {/* Service Info Card */}
        <div className="bg-muted/50 rounded-lg p-4 border">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <label className="text-muted-foreground font-medium">Service Name</label>
              <p className="font-semibold">{service.name}</p>
            </div>
            <div>
              <label className="text-muted-foreground font-medium">URL</label>
              <p className="font-mono">{service.subdomain}.{service.domain?.domain}</p>
            </div>
            <div>
              <label className="text-muted-foreground font-medium">Target</label>
              <p className="font-mono">{service.targetIp}:{service.targetPort}</p>
            </div>
          </div>
        </div>

        {/* Security Configuration List */}
        <ServiceSecurityList
          serviceId={serviceId}
          serviceName={service.name}
        />
      </div>
    </AppLayout>
  );
}