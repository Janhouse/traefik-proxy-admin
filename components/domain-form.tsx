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
import { Save, X } from "lucide-react";
import type { DomainResponse, CreateDomainRequest, UpdateDomainRequest } from "@/lib/dto/domain.dto";

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
        isDefault: domain.isDefault,
      });
    } else {
      setFormData({
        name: "",
        domain: "",
        description: "",
        useWildcardCert: true,
        certResolver: "letsencrypt",
        isDefault: false,
      });
    }
  }, [domain]);

  const handleChange = (field: keyof typeof formData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
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
      <DialogContent className="sm:max-w-[500px]">
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