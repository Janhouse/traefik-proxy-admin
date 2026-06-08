import { useState, useEffect, useCallback } from "react";
import type { Service } from "@/components/service-table";
import type { MatchRule } from "@/lib/route-rule";
import { parseMatchRules } from "@/lib/route-rule";
import { serviceEntrypoints } from "@/lib/service-display";

export type ServiceFormData = Omit<
  Service,
  "id" | "createdAt" | "updatedAt" | "middlewares" | "entrypoints" | "matchRules"
> & {
  domainId?: string;
  /** comma string when loaded from the DB, normalized to string[] on submit */
  middlewares?: string | string[] | null;
  /** managed by the route editor, submitted as arrays */
  entrypoints?: string[];
  matchRules?: MatchRule[];
};

interface UseServiceFormOptions {
  service: Service | null;
  defaultDuration?: number;
}

export function useServiceForm({ service, defaultDuration }: UseServiceFormOptions) {
  const getDefaultFormData = useCallback((): ServiceFormData => ({
    name: "",
    subdomain: "",
    hostnameMode: "subdomain",
    customHostnames: null,
    domainId: "",
    targetIp: "",
    targetPort: 80,
    entrypoint: null,
    entrypoints: [],
    matchRules: [],
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
        subdomain: service.subdomain || "",
        hostnameMode: service.hostnameMode,
        customHostnames: service.customHostnames,
        domainId: service.domainId,
        targetIp: service.targetIp,
        targetPort: service.targetPort,
        entrypoint: service.entrypoint || null,
        entrypoints: serviceEntrypoints(service),
        matchRules: parseMatchRules(service.matchRules ?? null),
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