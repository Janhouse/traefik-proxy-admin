"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
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

  return (
    <AppLayout>
      <PageBand
        eyebrow="Monitor"
        title="Sessions"
        subtitle="Active authenticated sessions"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {sessions.length > 0 && (
              <ConfirmDialog
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    className="text-[var(--danger)] hover:text-[var(--danger)]"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All
                  </Button>
                }
                title="Delete All Sessions"
                description="Are you sure you want to delete all sessions? This will log out all users from all services."
                confirmText="Delete All"
                onConfirm={deleteAllSessions}
                variant="destructive"
              />
            )}
          </>
        }
      />
      <PageMain>
        <SessionsTable
          sessions={sessions}
          loading={loading}
          onRefresh={fetchSessions}
          onDelete={deleteSession}
          onDeleteAll={deleteAllSessions}
          onExpired={handleSessionExpired}
        />
      </PageMain>
    </AppLayout>
  );
}
