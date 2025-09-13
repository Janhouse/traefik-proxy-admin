"use client";

import { useState, useCallback } from "react";
import type { Service } from "@/components/service-table";

type ServiceFormData = Omit<Service, "id" | "createdAt" | "updatedAt">;

export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseDomain, setBaseDomain] = useState("example.com");
  const [defaultDuration, setDefaultDuration] = useState<number | undefined>(12);

  const fetchServices = useCallback(async () => {
    try {
      const response = await fetch("/api/services");
      if (response.ok) {
        const data = await response.json();
        setServices(data);
      } else {
        console.error("Failed to fetch services");
      }
    } catch (error) {
      console.error("Error fetching services:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBaseDomain = useCallback(async () => {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const config = await response.json();
        if (config.baseDomain) {
          setBaseDomain(config.baseDomain);
        }
        if (config.defaultServiceDurationMinutes !== undefined) {
          setDefaultDuration(config.defaultServiceDurationMinutes);
        }
      }
    } catch (error) {
      console.error("Failed to fetch base domain:", error);
    }
  }, []);

  const saveService = useCallback(async (serviceData: ServiceFormData, editingService?: Service | null) => {
    const url = editingService ? `/api/services/${editingService.id}` : "/api/services";
    const method = editingService ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(serviceData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save service: ${errorText}`);
    }

    await fetchServices();
  }, [fetchServices]);

  const deleteService = useCallback(async (id: string) => {
    const response = await fetch(`/api/services/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete service");
    }

    await fetchServices();
  }, [fetchServices]);

  const toggleService = useCallback(async (serviceId: string) => {
    const response = await fetch(`/api/services/${serviceId}/toggle`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to toggle service");
    }

    await fetchServices();
  }, [fetchServices]);

  const generateShareLink = useCallback(async (serviceId: string) => {
    try {
      const response = await fetch("/api/services/share-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ serviceId }),
      });

      if (response.ok) {
        const { shareUrl } = await response.json();
        await navigator.clipboard.writeText(shareUrl);
        return shareUrl;
      } else {
        throw new Error("Failed to generate share link");
      }
    } catch (error) {
      console.error("Error generating share link:", error);
      throw error;
    }
  }, []);

  return {
    services,
    loading,
    baseDomain,
    defaultDuration,
    fetchServices,
    fetchBaseDomain,
    saveService,
    deleteService,
    toggleService,
    generateShareLink,
  };
}