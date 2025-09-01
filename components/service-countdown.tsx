"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { formatDurationRemaining } from "@/lib/duration-utils";

interface ServiceCountdownProps {
  enabledAt: string;
  enabled: boolean;
  durationMinutes?: number | null;
  onExpired?: () => void;
}

export function ServiceCountdown({ enabledAt, enabled, durationMinutes, onExpired }: ServiceCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!enabled || !enabledAt) {
      setTimeLeft("");
      return;
    }

    // Debug logging
    console.log("ServiceCountdown - durationMinutes:", durationMinutes, "type:", typeof durationMinutes);

    const updateCountdown = () => {
      const remaining = formatDurationRemaining(enabledAt, durationMinutes);
      console.log("ServiceCountdown - remaining:", remaining);
      setTimeLeft(remaining || "");
      
      // If the countdown reached "Expired", trigger the callback
      if (remaining === "Expired" && onExpired) {
        onExpired();
      }
    };

    updateCountdown();
    
    // Only set interval if not forever
    if (durationMinutes !== null) {
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }
  }, [enabledAt, enabled, durationMinutes, onExpired]);

  if (!enabled || !enabledAt || !timeLeft) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="h-3 w-3" />
      <span>
        {timeLeft === "Forever" ? "Enabled forever" : `Auto-disable in: ${timeLeft}`}
      </span>
    </div>
  );
}