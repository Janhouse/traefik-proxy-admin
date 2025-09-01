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

  if (!hasUnsavedChanges) {
    return children;
  }

  return (
    <ConfirmDialog
      trigger={children}
      title="Unsaved Changes"
      description="You have unsaved changes. Are you sure you want to leave without saving?"
      confirmText="Leave without saving"
      cancelText="Stay"
      onConfirm={onDiscard}
      variant="destructive"
    />
  );
}