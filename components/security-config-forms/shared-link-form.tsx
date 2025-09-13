"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SharedLinkFormData {
  expiresInHours: number;
  sessionDurationMinutes: number;
}

interface SharedLinkFormProps {
  data: SharedLinkFormData;
  onChange: (data: SharedLinkFormData) => void;
  errors?: {
    expiresInHours?: string;
    sessionDurationMinutes?: string;
  };
}

export function SharedLinkForm({ data, onChange, errors = {} }: SharedLinkFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="expiresInHours">Link Expiration (hours)</Label>
        <Input
          id="expiresInHours"
          type="number"
          value={data.expiresInHours}
          onChange={(e) =>
            onChange({
              ...data,
              expiresInHours: Math.max(1, parseInt(e.target.value) || 1),
            })
          }
          min="1"
          className="mt-1"
        />
        {errors.expiresInHours && (
          <p className="mt-1 text-sm text-red-600">{errors.expiresInHours}</p>
        )}
        <p className="mt-1 text-sm text-gray-500">
          How long the shared link remains valid
        </p>
      </div>

      <div>
        <Label htmlFor="sessionDurationMinutes">Session Duration (minutes)</Label>
        <Input
          id="sessionDurationMinutes"
          type="number"
          value={data.sessionDurationMinutes}
          onChange={(e) =>
            onChange({
              ...data,
              sessionDurationMinutes: Math.max(1, parseInt(e.target.value) || 60),
            })
          }
          min="1"
          className="mt-1"
        />
        {errors.sessionDurationMinutes && (
          <p className="mt-1 text-sm text-red-600">{errors.sessionDurationMinutes}</p>
        )}
        <p className="mt-1 text-sm text-gray-500">
          How long users stay logged in after using the shared link
        </p>
      </div>
    </div>
  );
}