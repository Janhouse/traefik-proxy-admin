import { useState, useEffect } from "react";
import type { ServiceFormData } from "./use-service-form";

interface UseServiceHeadersOptions {
  formData: ServiceFormData;
  updateFormData: (updates: Partial<ServiceFormData>) => void;
}

export function useServiceHeaders({ formData, updateFormData }: UseServiceHeadersOptions) {
  const [middlewareText, setMiddlewareText] = useState("");
  const [hostHeader, setHostHeader] = useState("");

  // Initialize middleware and headers from form data
  useEffect(() => {
    setMiddlewareText(formData.middlewares || "");

    // Parse existing request headers to extract Host header
    let existingHostHeader = "";
    if (formData.requestHeaders) {
      try {
        const headers = JSON.parse(formData.requestHeaders);
        existingHostHeader = headers.Host || "";
      } catch {
        // If parsing fails, treat as empty
      }
    }
    setHostHeader(existingHostHeader);
  }, [formData.middlewares, formData.requestHeaders]);

  // Update middlewares when text changes
  useEffect(() => {
    const processedMiddlewares = middlewareText
      .split(",")
      .map(m => m.trim())
      .filter(m => m.length > 0)
      .join(",");

    updateFormData({ middlewares: processedMiddlewares });
  }, [middlewareText, updateFormData]);

  // Update request headers when Host header changes
  useEffect(() => {
    const headers: Record<string, string> = {};

    // Add Host header if provided
    if (hostHeader.trim()) {
      headers.Host = hostHeader.trim();
    }

    // Convert to JSON string
    const headersJson = Object.keys(headers).length > 0 ? JSON.stringify(headers) : "";
    updateFormData({ requestHeaders: headersJson });
  }, [hostHeader, updateFormData]);

  return {
    middlewareText,
    setMiddlewareText,
    hostHeader,
    setHostHeader,
  };
}