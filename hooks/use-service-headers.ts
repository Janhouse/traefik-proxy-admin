import { useState, useEffect, useRef } from "react";
import type { ServiceFormData } from "./use-service-form";

interface UseServiceHeadersOptions {
  formData: ServiceFormData;
  updateFormData: (updates: Partial<ServiceFormData>) => void;
}

export function useServiceHeaders({ formData, updateFormData }: UseServiceHeadersOptions) {
  const [middlewareText, setMiddlewareText] = useState("");
  const [hostHeader, setHostHeader] = useState("");

  // Initialize middleware text from form data
  useEffect(() => {
    setMiddlewareText(formData.middlewares || "");
  }, [formData.middlewares]);

  // Initialize host header from form data
  useEffect(() => {
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
  }, [formData.requestHeaders]);

  // Update middlewares when text changes
  useEffect(() => {
    const processedMiddlewares = middlewareText
      .split(",")
      .map(m => m.trim())
      .filter(m => m.length > 0)
      .join(",");

    updateFormData({ middlewares: processedMiddlewares });
  }, [middlewareText, updateFormData]);

  // Update request headers when Host header changes (user input only)
  const updateRequestHeaders = (newHostHeader: string) => {
    const headers: Record<string, string> = {};

    // Add Host header if provided
    if (newHostHeader.trim()) {
      headers.Host = newHostHeader.trim();
    }

    // Convert to JSON string
    const headersJson = Object.keys(headers).length > 0 ? JSON.stringify(headers) : "";
    updateFormData({ requestHeaders: headersJson });
  };

  // Custom setter that updates both state and form data
  const setHostHeaderValue = (value: string) => {
    setHostHeader(value);
    updateRequestHeaders(value);
  };

  return {
    middlewareText,
    setMiddlewareText,
    hostHeader,
    setHostHeader: setHostHeaderValue,
  };
}