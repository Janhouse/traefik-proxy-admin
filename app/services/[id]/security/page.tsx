"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { ServiceSecurityList } from "@/components/service-security-list";
import { StatusBadge, MetaBadge } from "@/components/traefik/status-badge";
import {
  primaryHostname,
  publicUrl,
  targetAddress,
  serviceEntrypoints,
} from "@/lib/service-display";
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
        <PageBand
          eyebrow="Security"
          title="Loading…"
          subtitle="Loading service security configuration"
          backHref="/services"
          backLabel="Back to Services"
        />
        <PageMain />
      </AppLayout>
    );
  }

  if (!service) {
    return (
      <AppLayout>
        <PageBand
          eyebrow="Security"
          title="Service Not Found"
          subtitle="The requested service could not be found"
          backHref="/services"
          backLabel="Back to Services"
        />
        <PageMain />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageBand
        eyebrow="Security"
        title={service.name}
        subtitle={
          <>
            Authentication &amp; access control in front of{" "}
            <span className="mono">{primaryHostname(service)}</span>. Each rule
            maps to a Traefik middleware on this router.
          </>
        }
        backHref="/services"
        backLabel="Back to Services"
      />

      <PageMain>
        <div className="space-y-6">
          {/* Service summary */}
          <div className="sec-bar">
            <div className="item">
              <div className="k">Service</div>
              <div className="v">
                {service.name}
                <StatusBadge enabled={service.enabled} />
              </div>
            </div>
            <div className="item">
              <div className="k">Public URL</div>
              <div className="v mono">
                {primaryHostname(service) ? (
                  <a
                    href={publicUrl(service)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--brand-2)] hover:underline"
                  >
                    {primaryHostname(service)}
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div className="item">
              <div className="k">Target</div>
              <div className="v mono">{targetAddress(service)}</div>
            </div>
            <div className="item">
              <div className="k">Entrypoint</div>
              <div className="v">
                {serviceEntrypoints(service).length ? (
                  serviceEntrypoints(service).map((ep) => (
                    <MetaBadge key={ep} variant="https">
                      {ep}
                    </MetaBadge>
                  ))
                ) : (
                  <span className="text-[var(--meta)]">default</span>
                )}
              </div>
            </div>
          </div>

          {/* Security Configuration List */}
          <ServiceSecurityList serviceId={serviceId} serviceName={service.name} />
        </div>
      </PageMain>
    </AppLayout>
  );
}
