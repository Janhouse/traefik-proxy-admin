import { useState, useEffect, useCallback } from "react";
import type { Service } from "@/components/service-table";
import type { RuleNode } from "@/lib/route-rule";
import { parseMatchRules } from "@/lib/route-rule";
import { serviceEntrypoints } from "@/lib/service-display";
import {
  legacyHostTree,
  parseCustomList,
} from "@/components/traefik/route-rule-editor";

export type ServiceFormData = Omit<
  Service,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "middlewares"
  | "entrypoints"
  | "matchRules"
  | "customHostnames"
> & {
  domainId?: string;
  /** comma string when loaded from the DB, normalized to string[] on submit */
  middlewares?: string | string[] | null;
  /** managed by the route editor, submitted as arrays */
  entrypoints?: string[];
  /** rule tree: Host rules + matchers and parenthesized groups */
  matchRules?: RuleNode[];
  /** derived by the route editor from the first Host rule ("custom" mode);
   * JSON string in the DB, submitted as string[] | null */
  customHostnames?: string[] | null;
};

interface UseServiceFormOptions {
  service: Service | null;
  defaultDuration?: number;
}

export function useServiceForm({ service, defaultDuration }: UseServiceFormOptions) {
  const getDefaultFormData = useCallback((): ServiceFormData => ({
    name: "",
    subdomain: null,
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
      // Mirror the route editor's view of the service so the unsaved-changes
      // baseline matches what the editor emits on mount: the host is lifted
      // into the rule tree, and "custom" hostnames are arrays, not JSON.
      const customList = parseCustomList(service.customHostnames);
      const serviceData: ServiceFormData = {
        name: service.name,
        subdomain: service.subdomain || null,
        hostnameMode: service.hostnameMode,
        customHostnames:
          service.hostnameMode === "custom" && customList.length
            ? customList
            : null,
        domainId: service.domainId,
        targetIp: service.targetIp,
        targetPort: service.targetPort,
        entrypoint: service.entrypoint || null,
        entrypoints: serviceEntrypoints(service),
        matchRules: legacyHostTree({
          domainId: service.domainId,
          subdomain: service.subdomain,
          hostnameMode: service.hostnameMode,
          customHostnames: service.customHostnames,
          matchRules: parseMatchRules(service.matchRules ?? null),
        }),
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
