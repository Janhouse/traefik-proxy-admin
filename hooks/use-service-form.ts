import { useState, useEffect, useCallback, useRef } from "react";
import type { Service } from "@/components/service-table";
import type { RuleNode } from "@/lib/route-rule";
import { parseMatchRules } from "@/lib/route-rule";
import { serviceEntrypoints } from "@/lib/service-display";
import { legacyHostTree, parseCustomList } from "@/hooks/host-tree";

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
  /** Auto-disable default for NEW services; null = never auto-disable. */
  defaultDuration?: number | null;
  /** The domain the route editor starts a new service on (the flagged
   * default, else the first). Lets the pristine baseline carry the same
   * default Host rule the editor emits, so an untouched Add form is clean. */
  defaultDomainId?: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function useServiceForm({
  service,
  defaultDuration,
  defaultDomainId = "",
}: UseServiceFormOptions) {
  const getDefaultFormData = useCallback((): ServiceFormData => ({
    name: "",
    subdomain: null,
    hostnameMode: "subdomain",
    customHostnames: null,
    domainId: defaultDomainId,
    targetIp: "",
    targetPort: 80,
    entrypoint: null,
    entrypoints: [],
    // the editor's starting tree: one empty domain-backed Host rule
    matchRules: legacyHostTree({
      domainId: defaultDomainId,
      subdomain: "",
      hostnameMode: "subdomain",
      matchRules: [],
    }),
    isHttps: true,
    insecureSkipVerify: false,
    enabled: true,
    enabledAt: null,
    enableDurationMinutes: defaultDuration ?? null,
    middlewares: "",
    requestHeaders: "",
  }), [defaultDuration, defaultDomainId]);

  const [formData, setFormData] = useState<ServiceFormData>(getDefaultFormData);
  const [originalFormData, setOriginalFormData] = useState<ServiceFormData>(getDefaultFormData);
  const baselineRef = useRef<ServiceFormData>(originalFormData);

  // Initialize form when service prop changes
  useEffect(() => {
    if (!service) return;
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
    baselineRef.current = serviceData;
    setFormData(serviceData);
    setOriginalFormData(serviceData);
  }, [service]);

  // New service: the defaults (auto-disable duration from the global config,
  // default domain once the domain list loads) arrive asynchronously. Move
  // the baseline to the new defaults and carry them into every field the
  // user has not touched yet — never clobber fields already edited.
  useEffect(() => {
    if (service) return;
    const next = getDefaultFormData();
    const prev = baselineRef.current;
    baselineRef.current = next;
    setOriginalFormData(next);
    setFormData((cur) => {
      const out = { ...cur } as Record<string, unknown>;
      for (const key of Object.keys(next) as (keyof ServiceFormData)[]) {
        if (same(cur[key], prev[key])) out[key] = next[key];
      }
      return out as ServiceFormData;
    });
  }, [service, getDefaultFormData]);

  const hasUnsavedChanges = !same(formData, originalFormData);

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
