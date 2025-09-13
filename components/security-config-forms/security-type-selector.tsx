"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, Users, Key } from "lucide-react";

export type SecurityType = "shared_link" | "sso" | "basic_auth";

interface SecurityTypeOption {
  value: SecurityType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const securityTypeOptions: SecurityTypeOption[] = [
  {
    value: "shared_link",
    label: "Shared Link",
    description: "Time-limited access links that expire after a set duration",
    icon: Link,
  },
  {
    value: "sso",
    label: "Single Sign-On (SSO)",
    description: "Authenticate users through your configured SSO provider",
    icon: Users,
  },
  {
    value: "basic_auth",
    label: "Basic Authentication",
    description: "Username and password authentication",
    icon: Key,
  },
];

interface SecurityTypeSelectorProps {
  value: SecurityType;
  onChange: (value: SecurityType) => void;
  disabled?: boolean;
}

export function SecurityTypeSelector({ value, onChange, disabled = false }: SecurityTypeSelectorProps) {
  return (
    <div>
      <Label htmlFor="securityType">Security Method</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="mt-1">
          <SelectValue placeholder="Select security method" />
        </SelectTrigger>
        <SelectContent>
          {securityTypeOptions.map((option) => {
            const Icon = option.icon;
            return (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center space-x-3">
                  <Icon className="h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-sm text-gray-500">{option.description}</span>
                  </div>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

export { securityTypeOptions };