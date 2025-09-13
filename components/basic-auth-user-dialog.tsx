"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, EyeOff } from "lucide-react";
import type { BasicAuthUser } from "./basic-auth-config-table";

interface FormErrors {
  username?: string;
  password?: string;
}

interface BasicAuthUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingUser: BasicAuthUser | null;
  parentConfigId: string;
  onSubmit: (data: { username: string; password: string; configId: string }) => Promise<void>;
}

export function BasicAuthUserDialog({
  open,
  onOpenChange,
  editingUser,
  parentConfigId,
  onSubmit,
}: BasicAuthUserDialogProps) {
  const [formData, setFormData] = useState({ username: "", password: "" });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Reset form when dialog opens/closes or editing user changes
  useEffect(() => {
    if (open) {
      if (editingUser) {
        setFormData({
          username: editingUser.username,
          password: "", // Always start with empty password for security
        });
      } else {
        setFormData({ username: "", password: "" });
      }
      setFormErrors({});
      setShowPassword(false);
    }
  }, [open, editingUser]);

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.username.trim()) {
      errors.username = "Username is required";
    } else if (formData.username.includes(":")) {
      errors.username = "Username cannot contain colon (:)";
    }

    if (!editingUser && !formData.password) {
      errors.password = "Password is required for new users";
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
      await onSubmit({
        username: formData.username,
        password: formData.password,
        configId: parentConfigId,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save user:", error);
      setFormErrors({ username: "Failed to save user" });
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
              {editingUser ? "Edit User" : "Add User"}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Update the user credentials. Leave password empty to keep current password."
                : "Add a new user to this basic authentication configuration."
              }
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="Enter username"
                disabled={submitting}
              />
              {formErrors.username && (
                <p className="text-sm text-red-600">{formErrors.username}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">
                {editingUser ? "New Password (optional)" : "Password"}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingUser ? "Leave empty to keep current" : "Enter password"}
                  disabled={submitting}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={submitting}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {formErrors.password && (
                <p className="text-sm text-red-600">{formErrors.password}</p>
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
              {submitting ? "Saving..." : editingUser ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}