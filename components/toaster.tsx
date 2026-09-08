"use client";

import { useEffect, useState } from "react";
import { Check, Trash2, AlertTriangle, Info } from "lucide-react";

type ToastVariant = "success" | "error" | "info" | "delete";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

let counter = 0;

/** Fire a toast from anywhere (client side). */
export function toast(message: string, variant: ToastVariant = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("app-toast", { detail: { message, variant } })
  );
}

const ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <Check className="h-[17px] w-[17px]" />,
  delete: <Trash2 className="h-[17px] w-[17px]" />,
  error: <AlertTriangle className="h-[17px] w-[17px]" />,
  info: <Info className="h-[17px] w-[17px]" />,
};

const ICON_COLOR: Record<ToastVariant, string> = {
  success: "text-[var(--success)]",
  delete: "text-[var(--danger)]",
  error: "text-[var(--danger)]",
  info: "text-[var(--info)]",
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        message: string;
        variant: ToastVariant;
      };
      const id = ++counter;
      setItems((prev) => [...prev, { id, ...detail }]);
      setTimeout(
        () => setItems((prev) => prev.filter((t) => t.id !== id)),
        2800
      );
    };
    window.addEventListener("app-toast", handler);
    return () => window.removeEventListener("app-toast", handler);
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5">
      {items.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2.5 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium shadow-[var(--shadow-lg)] animate-in fade-in slide-in-from-bottom-2"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border-strong)",
          }}
        >
          <span className={ICON_COLOR[t.variant]}>{ICONS[t.variant]}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
