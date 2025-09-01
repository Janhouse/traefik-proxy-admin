"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AuthSuccess() {
  useEffect(() => {
    // Auto-close window after 3 seconds
    const timer = setTimeout(() => {
      window.close();
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full bg-card p-8 rounded-lg shadow text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Authentication Successful!
          </h1>
          <p className="text-muted-foreground">
            You have been successfully authenticated and can now access the service.
          </p>
        </div>
        
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This window will close automatically in a few seconds.
          </p>
          <Button onClick={() => window.close()} className="w-full">
            Close Window
          </Button>
        </div>
      </div>
    </div>
  );
}