"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";

interface SSOFormData {
  groups: string[];
  users: string[];
}

interface SSOFormProps {
  data: SSOFormData;
  onChange: (data: SSOFormData) => void;
  errors?: {
    groups?: string;
    users?: string;
  };
}

export function SSOForm({ data, onChange, errors = {} }: SSOFormProps) {
  const [groupInput, setGroupInput] = useState("");
  const [userInput, setUserInput] = useState("");

  const addGroup = () => {
    if (groupInput.trim()) {
      const newGroups = [...data.groups];
      if (!newGroups.includes(groupInput.trim())) {
        newGroups.push(groupInput.trim());
        onChange({ ...data, groups: newGroups });
      }
      setGroupInput("");
    }
  };

  const removeGroup = (group: string) => {
    onChange({
      ...data,
      groups: data.groups.filter((g) => g !== group),
    });
  };

  const addUser = () => {
    if (userInput.trim()) {
      const newUsers = [...data.users];
      if (!newUsers.includes(userInput.trim())) {
        newUsers.push(userInput.trim());
        onChange({ ...data, users: newUsers });
      }
      setUserInput("");
    }
  };

  const removeUser = (user: string) => {
    onChange({
      ...data,
      users: data.users.filter((u) => u !== user),
    });
  };

  const handleGroupKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addGroup();
    }
  };

  const handleUserKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addUser();
    }
  };

  return (
    <div className="space-y-6">
      {/* Groups Section */}
      <div>
        <Label htmlFor="groups">Allowed Groups</Label>
        <div className="mt-1 flex space-x-2">
          <Input
            id="groups"
            value={groupInput}
            onChange={(e) => setGroupInput(e.target.value)}
            onKeyPress={handleGroupKeyPress}
            placeholder="Enter group name"
          />
          <Button type="button" onClick={addGroup} size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {errors.groups && (
          <p className="mt-1 text-sm text-red-600">{errors.groups}</p>
        )}

        {data.groups.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {data.groups.map((group) => (
              <Badge key={group} variant="outline" className="flex items-center gap-1">
                {group}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 ml-1"
                  onClick={() => removeGroup(group)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}

        <p className="mt-1 text-sm text-gray-500">
          Only users in these groups will have access. Leave empty to allow all authenticated users.
        </p>
      </div>

      {/* Users Section */}
      <div>
        <Label htmlFor="users">Allowed Users</Label>
        <div className="mt-1 flex space-x-2">
          <Input
            id="users"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={handleUserKeyPress}
            placeholder="Enter username or email"
          />
          <Button type="button" onClick={addUser} size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {errors.users && (
          <p className="mt-1 text-sm text-red-600">{errors.users}</p>
        )}

        {data.users.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {data.users.map((user) => (
              <Badge key={user} variant="outline" className="flex items-center gap-1">
                {user}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 ml-1"
                  onClick={() => removeUser(user)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}

        <p className="mt-1 text-sm text-gray-500">
          Specific users who will have access. Leave empty to rely on group membership only.
        </p>
      </div>

      {data.groups.length === 0 && data.users.length === 0 && (
        <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/20 p-4">
          <div className="text-sm text-yellow-700 dark:text-yellow-300">
            <strong>Note:</strong> No groups or users specified. All authenticated users will have access.
          </div>
        </div>
      )}
    </div>
  );
}