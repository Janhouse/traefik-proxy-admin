"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BasicAuthConfig } from "./basic-auth-config-table";

interface FormErrors {
  name?: string;
  description?: string;
}

interface BasicAuthConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingConfig: BasicAuthConfig | null;
  onSubmit: (data: { name: string; description: string }) => Promise<void>;
}

export function BasicAuthConfigDialog({
  open,
  onOpenChange,
  editingConfig,
  onSubmit,
}: BasicAuthConfigDialogProps) {
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Reset form when dialog opens/closes or editing config changes
  useEffect(() => {
    if (open) {
      if (editingConfig) {
        setFormData({
          name: editingConfig.name,
          description: editingConfig.description || "",
        });
      } else {
        setFormData({ name: "", description: "" });
      }
      setFormErrors({});
    }
  }, [open, editingConfig]);

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save config:", error);
      setFormErrors({ name: "Failed to save configuration" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? "Edit Configuration" : "Add Configuration"}
            </DialogTitle>
            <DialogDescription>
              {editingConfig
                ? "Update the basic authentication configuration details."
                : "Create a new basic authentication configuration."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Configuration name"
                disabled={submitting}
              />
              {formErrors.name && (
                <p className="text-sm text-red-600">{formErrors.name}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Configuration description"
                disabled={submitting}
              />
              {formErrors.description && (
                <p className="text-sm text-red-600">{formErrors.description}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : editingConfig ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}