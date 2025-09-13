import { useState, useEffect, useCallback } from "react";
import type { Service } from "@/components/service-table";

export type ServiceFormData = Omit<Service, "id" | "createdAt" | "updatedAt">;

interface UseServiceFormOptions {
  service: Service | null;
  defaultDuration?: number;
}

export function useServiceForm({ service, defaultDuration }: UseServiceFormOptions) {
  const getDefaultFormData = useCallback((): ServiceFormData => ({
    name: "",
    subdomain: "",
    targetIp: "",
    targetPort: 80,
    isHttps: true,
    insecureSkipVerify: false,
    enabled: true,
    enabledAt: null,
    enableDurationMinutes: defaultDuration ?? null,
    middlewares: "",
    requestHeaders: "",
  }), [defaultDuration]);

  const [formData, setFormData] = useState<ServiceFormData>(getDefaultFormData);
  const [originalFormData, setOriginalFormData] = useState<ServiceFormData>(getDefaultFormData);

  // Initialize form when service prop changes
  useEffect(() => {
    if (service) {
      const serviceData: ServiceFormData = {
        name: service.name,
        subdomain: service.subdomain,
        targetIp: service.targetIp,
        targetPort: service.targetPort,
        isHttps: service.isHttps,
        insecureSkipVerify: service.insecureSkipVerify,
        enabled: service.enabled,
        enabledAt: service.enabledAt,
        enableDurationMinutes: service.enableDurationMinutes,
        middlewares: service.middlewares || "",
        requestHeaders: service.requestHeaders || "",
      };
      setFormData(serviceData);
      setOriginalFormData(serviceData);
    } else {
      const defaultData = getDefaultFormData();
      setFormData(defaultData);
      setOriginalFormData(defaultData);
    }
  }, [service, getDefaultFormData]);

  // Update form data when defaultDuration changes and we're adding a new service
  useEffect(() => {
    if (!service && defaultDuration !== undefined) {
      const defaultData = getDefaultFormData();
      setFormData(defaultData);
      setOriginalFormData(defaultData);
    }
  }, [defaultDuration, service, getDefaultFormData]);

  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(originalFormData);

  const updateFormData = useCallback((updates: Partial<ServiceFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  return {
    formData,
    setFormData,
    updateFormData,
    hasUnsavedChanges,
  };
}