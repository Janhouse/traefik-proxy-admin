"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, X, Plus, Minus } from "lucide-react";
import type {
  DomainResponse,
  CreateDomainRequest,
  UpdateDomainRequest,
  CertificateConfig
} from "@/lib/dto/domain.dto";

interface DomainFormProps {
  domain?: DomainResponse | null;
  onSave: (domain: CreateDomainRequest | UpdateDomainRequest) => Promise<void>;
  onCancel: () => void;
}

export function DomainForm({ domain, onSave, onCancel }: DomainFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    description: "",
    useWildcardCert: true,
    certResolver: "letsencrypt",
    certificateConfigs: [] as CertificateConfig[],
    isDefault: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form data
  useEffect(() => {
    if (domain) {
      setFormData({
        name: domain.name,
        domain: domain.domain,
        description: domain.description || "",
        useWildcardCert: domain.useWildcardCert,
        certResolver: domain.certResolver,
        certificateConfigs: domain.parsedCertificateConfigs || [],
        isDefault: domain.isDefault,
      });
    } else {
      setFormData({
        name: "",
        domain: "",
        description: "",
        useWildcardCert: true,
        certResolver: "letsencrypt",
        certificateConfigs: [],
        isDefault: false,
      });
    }
  }, [domain]);

  const handleChange = (field: keyof typeof formData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  // Certificate configuration management functions
  const addCertificateConfig = () => {
    const newConfig: CertificateConfig = {
      name: "",
      main: formData.domain || "",
      sans: [],
      certResolver: formData.certResolver,
    };
    setFormData(prev => ({
      ...prev,
      certificateConfigs: [...prev.certificateConfigs, newConfig]
    }));
  };

  const removeCertificateConfig = (index: number) => {
    setFormData(prev => ({
      ...prev,
      certificateConfigs: prev.certificateConfigs.filter((_, i) => i !== index)
    }));
  };

  const updateCertificateConfig = (index: number, field: keyof CertificateConfig, value: string | string[]) => {
    setFormData(prev => ({
      ...prev,
      certificateConfigs: prev.certificateConfigs.map((config, i) =>
        i === index ? { ...config, [field]: value } : config
      )
    }));
  };

  const updateSansArray = (configIndex: number, sansText: string) => {
    const sans = sansText
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    updateCertificateConfig(configIndex, 'sans', sans);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.domain.trim()) {
      setError("Name and domain are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const domainData = {
        name: formData.name.trim(),
        domain: formData.domain.trim().toLowerCase(),
        description: formData.description.trim() || undefined,
        useWildcardCert: formData.useWildcardCert,
        certResolver: formData.certResolver.trim() || "letsencrypt",
        certificateConfigs: formData.certificateConfigs,
        isDefault: formData.isDefault,
      };

      await onSave(domainData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save domain");
    } finally {
      setSaving(false);
    }
  };

  const isEditing = !!domain;

  return (
    <Dialog open={true} onOpenChange={() => onCancel()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Domain" : "Add Domain"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="e.g., Production Domain"
                required
              />
            </div>

            <div>
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={formData.domain}
                onChange={(e) => handleChange("domain", e.target.value)}
                placeholder="e.g., example.com"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Optional description for this domain"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="certResolver">Certificate Resolver</Label>
              <Input
                id="certResolver"
                value={formData.certResolver}
                onChange={(e) => handleChange("certResolver", e.target.value)}
                placeholder="e.g., letsencrypt"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="useWildcardCert">Use Wildcard Certificate</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Generate *.{formData.domain || "domain.com"} certificate
                </p>
              </div>
              <Switch
                id="useWildcardCert"
                checked={formData.useWildcardCert}
                onCheckedChange={(value) => handleChange("useWildcardCert", value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isDefault">Default Domain</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Use as default for new services
                </p>
              </div>
              <Switch
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={(value) => handleChange("isDefault", value)}
              />
            </div>

            {/* Certificate Configurations Section */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">Certificate Configurations</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Configure specific certificates (non-wildcard) for this domain
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCertificateConfig}
                  disabled={saving}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Certificate
                </Button>
              </div>

              {formData.certificateConfigs.length > 0 && (
                <div className="space-y-3">
                  {formData.certificateConfigs.map((config, index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-md p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">Certificate {index + 1}</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCertificateConfig(index)}
                          disabled={saving}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor={`cert-name-${index}`}>Certificate Name</Label>
                          <Input
                            id={`cert-name-${index}`}
                            value={config.name}
                            onChange={(e) => updateCertificateConfig(index, 'name', e.target.value)}
                            placeholder="e.g., Main Certificate"
                            disabled={saving}
                          />
                        </div>

                        <div>
                          <Label htmlFor={`cert-main-${index}`}>Main Domain</Label>
                          <Input
                            id={`cert-main-${index}`}
                            value={config.main}
                            onChange={(e) => updateCertificateConfig(index, 'main', e.target.value)}
                            placeholder="e.g., example.com"
                            disabled={saving}
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor={`cert-resolver-${index}`}>Certificate Resolver</Label>
                        <Input
                          id={`cert-resolver-${index}`}
                          value={config.certResolver}
                          onChange={(e) => updateCertificateConfig(index, 'certResolver', e.target.value)}
                          placeholder="e.g., letsencrypt"
                          disabled={saving}
                        />
                      </div>

                      <div>
                        <Label htmlFor={`cert-sans-${index}`}>
                          Subject Alternative Names (SANs)
                        </Label>
                        <Textarea
                          id={`cert-sans-${index}`}
                          value={config.sans?.join('\n') || ''}
                          onChange={(e) => updateSansArray(index, e.target.value)}
                          placeholder="www.example.com&#10;api.example.com&#10;app.example.com"
                          rows={3}
                          disabled={saving}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Enter one domain per line for additional domains to include in this certificate
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {formData.certificateConfigs.length === 0 && (
                <div className="text-center py-6 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-md">
                  <p className="text-sm">No certificate configurations added</p>
                  <p className="text-xs">Click &quot;Add Certificate&quot; to create specific certificates for this domain</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}