"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

function SharedLinkAuthContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const authenticateWithToken = useCallback(async () => {
    if (!token) {
      setMessage("No token provided");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/shared-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setMessage("Access granted! You can now access the service.");

        // Redirect back or close window after a delay
        setTimeout(() => {
          window.close();
        }, 3000);
      } else {
        setMessage(data.error || "Authentication failed");
      }
    } catch {
      setMessage("Network error occurred");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      authenticateWithToken();
    }
  }, [token, authenticateWithToken]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full bg-card border rounded-[var(--radius-lg)] p-8 shadow-[var(--shadow-md)]">
        <h1 className="text-2xl font-bold text-center text-foreground mb-6">
          Service Access
        </h1>

        {loading && (
          <div className="text-center">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4"
              style={{ borderColor: "var(--brand)" }}
            />
            <p className="text-muted-foreground">Authenticating…</p>
          </div>
        )}

        {!loading && message && (
          <div
            className="p-4 rounded-[var(--radius-md)] mb-4 border text-sm"
            style={
              success
                ? {
                    background: "var(--success-soft)",
                    borderColor: "color-mix(in oklab, var(--success) 35%, transparent)",
                    color: "var(--success)",
                  }
                : {
                    background: "var(--danger-soft)",
                    borderColor: "color-mix(in oklab, var(--danger) 35%, transparent)",
                    color: "var(--danger)",
                  }
            }
          >
            {message}
          </div>
        )}

        {!token && !loading && (
          <div className="text-center">
            <p className="text-muted-foreground mb-4">
              No authentication token found in the URL.
            </p>
            <Button onClick={() => window.close()}>Close Window</Button>
          </div>
        )}

        {success && (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              This window will close automatically in a few seconds.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SharedLinkAuth() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md w-full bg-card border rounded-[var(--radius-lg)] p-8 shadow-[var(--shadow-md)] text-center">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4"
              style={{ borderColor: "var(--brand)" }}
            />
            <p className="text-muted-foreground">Loading…</p>
          </div>
        </div>
      }
    >
      <SharedLinkAuthContent />
    </Suspense>
  );
}
