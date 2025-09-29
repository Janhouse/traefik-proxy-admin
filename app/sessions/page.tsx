"use client";

import { RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { SessionsTable } from "@/components/sessions-table";
import { useSessions } from "@/lib/hooks/use-sessions";

export default function SessionsPage() {
  const {
    sessions,
    loading,
    fetchSessions,
    deleteSession,
    deleteAllSessions,
    handleSessionExpired,
  } = useSessions();

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Session Management</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage active user sessions and authentication
          </p>
        </div>

        <SessionsTable
          sessions={sessions}
          loading={loading}
          onRefresh={fetchSessions}
          onDelete={deleteSession}
          onDeleteAll={deleteAllSessions}
          onExpired={handleSessionExpired}
        />
      </div>
    </AppLayout>
  );
}