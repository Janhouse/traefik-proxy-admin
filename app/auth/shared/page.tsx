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
      <div className="max-w-md w-full bg-card p-8 rounded-lg shadow">
        <h1 className="text-2xl font-bold text-center mb-6">
          Service Access
        </h1>
        
        {loading && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>Authenticating...</p>
          </div>
        )}
        
        {!loading && message && (
          <div className={`p-4 rounded-md mb-4 ${
            success 
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}>
            {message}
          </div>
        )}
        
        {!token && !loading && (
          <div className="text-center">
            <p className="text-muted-foreground mb-4">
              No authentication token found in the URL.
            </p>
            <Button onClick={() => window.close()}>
              Close Window
            </Button>
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
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full bg-card p-8 rounded-lg shadow text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    }>
      <SharedLinkAuthContent />
    </Suspense>
  );
}