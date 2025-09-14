"use client";

import { useState, useCallback } from "react";
import type { DomainResponse, CreateDomainRequest, UpdateDomainRequest } from "@/lib/dto/domain.dto";

export function useDomains() {
  const [domains, setDomains] = useState<DomainResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/domains");
      if (response.ok) {
        const data = await response.json();
        setDomains(data);
      } else {
        console.error("Failed to fetch domains:", response.statusText);
      }
    } catch (error) {
      console.error("Error fetching domains:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveDomain = useCallback(async (domainData: CreateDomainRequest | UpdateDomainRequest, id?: string) => {
    try {
      const url = id ? `/api/domains/${id}` : "/api/domains";
      const method = id ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(domainData),
      });

      if (response.ok) {
        await fetchDomains(); // Refresh the list
        return true;
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to save domain");
      }
    } catch (error) {
      console.error("Error saving domain:", error);
      throw error;
    }
  }, [fetchDomains]);

  const deleteDomain = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/domains/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchDomains(); // Refresh the list
        return true;
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete domain");
      }
    } catch (error) {
      console.error("Error deleting domain:", error);
      throw error;
    }
  }, [fetchDomains]);

  return {
    domains,
    loading,
    fetchDomains,
    saveDomain,
    deleteDomain,
  };
}