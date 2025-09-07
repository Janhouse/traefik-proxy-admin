"use client";

import { useState, useEffect } from "react";
import { Clock, Infinity } from "lucide-react";
import { formatDurationRemaining } from "@/lib/duration-utils";

interface ServiceCountdownProps {
  enabledAt: string;
  enabled: boolean;
  durationMinutes?: number | null;
  onExpired?: () => void;
}

export function ServiceCountdown({ enabledAt, enabled, durationMinutes, onExpired }: ServiceCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [disableTime, setDisableTime] = useState<string>("");

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
      
      // Calculate the exact disable time for tooltip
      if (durationMinutes !== null && durationMinutes !== undefined) {
        const enableTime = new Date(enabledAt);
        const disableAt = new Date(enableTime.getTime() + durationMinutes * 60 * 1000);
        setDisableTime(disableAt.toLocaleString());
      } else {
        setDisableTime("");
      }
      
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

  const isForever = timeLeft === "Forever";
  
  return (
    <div 
      className={`flex items-center gap-1 text-xs ${
        isForever 
          ? "text-green-600 dark:text-green-400 font-medium" 
          : "text-muted-foreground"
      }`}
      title={!isForever && disableTime ? `Service will be disabled on: ${disableTime}` : undefined}
    >
      {isForever ? (
        <Infinity className="h-3 w-3" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      <span>
        {isForever ? "Enabled forever" : `Auto-disable in: ${timeLeft}`}
      </span>
    </div>
  );
}