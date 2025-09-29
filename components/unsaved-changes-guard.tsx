"use client";

import { useEffect } from "react";

interface UnsavedChangesGuardProps {
  hasUnsavedChanges: boolean;
  children: React.ReactNode;
}

export function UnsavedChangesGuard({
  hasUnsavedChanges,
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