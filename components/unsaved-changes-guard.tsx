"use client";

import { useEffect } from "react";
import { ConfirmDialog } from "./confirm-dialog";

interface UnsavedChangesGuardProps {
  hasUnsavedChanges: boolean;
  onDiscard: () => void;
  children: React.ReactNode;
}

export function UnsavedChangesGuard({
  hasUnsavedChanges,
  onDiscard,
  children,
}: UnsavedChangesGuardProps) {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Always render children normally - only handle browser navigation events
  // The form itself should handle the cancel button with its own confirmation
  return <>{children}</>;
}