"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle } from "lucide-react";

interface BasicAuthConfig {
  id: string;
  name: string;
  description?: string;
}

interface BasicAuthFormData {
  basicAuthConfigId: string;
}

interface BasicAuthFormProps {
  data: BasicAuthFormData;
  onChange: (data: BasicAuthFormData) => void;
  errors?: {
    basicAuthConfigId?: string;
  };
}

export function BasicAuthForm({ data, onChange, errors = {} }: BasicAuthFormProps) {
  const [basicAuthConfigs, setBasicAuthConfigs] = useState<BasicAuthConfig[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBasicAuthConfigs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/security/basic-auth-configs");
      if (response.ok) {
        const configs = await response.json();
        setBasicAuthConfigs(configs);
      } else {
        console.error("Failed to fetch basic auth configurations");
      }
    } catch (error) {
      console.error("Error fetching basic auth configurations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBasicAuthConfigs();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label htmlFor="basicAuthConfigId">Basic Auth Configuration</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchBasicAuthConfigs}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Select value={data.basicAuthConfigId} onValueChange={(value) => onChange({ basicAuthConfigId: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select a configuration" />
          </SelectTrigger>
          <SelectContent>
            {basicAuthConfigs.map((config) => (
              <SelectItem key={config.id} value={config.id}>
                <div className="flex flex-col">
                  <span className="font-medium">{config.name}</span>
                  {config.description && (
                    <span className="text-sm text-gray-500">{config.description}</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {errors.basicAuthConfigId && (
          <p className="mt-1 text-sm text-red-600">{errors.basicAuthConfigId}</p>
        )}

        <p className="mt-1 text-sm text-gray-500">
          Users will authenticate using username and password from the selected configuration
        </p>
      </div>

      {basicAuthConfigs.length === 0 && !loading && (
        <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/20 p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-400 mr-2 mt-0.5" />
            <div className="text-sm text-yellow-700 dark:text-yellow-300">
              <strong>No configurations found.</strong> You need to create a basic auth configuration
              in the Security section first.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}