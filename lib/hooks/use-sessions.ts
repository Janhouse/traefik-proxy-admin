"use client";

import { useState, useEffect, useCallback } from "react";
import { SessionInfo } from "@/components/sessions-table";

export function useSessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expiredSessions, setExpiredSessions] = useState<Set<string>>(new Set());

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/sessions");
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();

    // Auto-refresh sessions every 30 seconds
    const refreshInterval = setInterval(fetchSessions, 30000);

    return () => clearInterval(refreshInterval);
  }, [fetchSessions]);

  const deleteSession = useCallback(async (sessionId: string) => {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      await fetchSessions();
    }
  }, [fetchSessions]);

  const deleteAllSessions = useCallback(async () => {
    const response = await fetch("/api/sessions", {
      method: "DELETE",
    });

    if (response.ok) {
      await fetchSessions();
    }
  }, [fetchSessions]);

  const handleSessionExpired = useCallback((sessionId: string) => {
    setExpiredSessions(prev => new Set([...prev, sessionId]));
  }, []);

  return {
    sessions,
    loading,
    expiredSessions,
    fetchSessions,
    deleteSession,
    deleteAllSessions,
    handleSessionExpired,
  };
}