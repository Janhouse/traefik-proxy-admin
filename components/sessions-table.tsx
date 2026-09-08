"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Users, User, Clock, ExternalLink } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CountdownTimer } from "@/components/countdown-timer";

export interface SessionInfo {
  id: string;
  serviceId: string;
  sessionToken: string;
  userIdentifier?: string;
  expiresAt: string;
  lastAccessedAt: string;
  createdAt: string;
  serviceName?: string;
  subdomain?: string;
}

interface SessionsTableProps {
  sessions: SessionInfo[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (sessionId: string) => Promise<void>;
  onDeleteAll: () => Promise<void>;
  onExpired: (sessionId: string) => void;
}

export function SessionsTable({
  sessions,
  loading,
  onDelete,
  onExpired,
}: SessionsTableProps) {
  const [deletingSession, setDeletingSession] = useState<string | null>(null);

  const handleDeleteSession = async (sessionId: string) => {
    setDeletingSession(sessionId);
    try {
      await onDelete(sessionId);
    } finally {
      setDeletingSession(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const activeSessions = sessions.filter(
    (session) => new Date(session.expiresAt) > new Date()
  );
  const expiredSessions = sessions.filter(
    (session) => new Date(session.expiresAt) <= new Date()
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Users className="h-5 w-5 animate-pulse mr-2" />
        Loading sessions…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
        <div className="stat">
          <div className="ico">
            <Users className="h-5 w-5" />
          </div>
          <p className="num">{activeSessions.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">Active Sessions</p>
        </div>

        <div className="stat">
          <div className="ico" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            <Clock className="h-5 w-5" />
          </div>
          <p className="num">{expiredSessions.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">Expired Sessions</p>
        </div>

        <div className="stat">
          <div className="ico" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
            <User className="h-5 w-5" />
          </div>
          <p className="num">{sessions.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">Total Sessions</p>
        </div>
      </div>

      {/* Sessions list */}
      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-[var(--radius-lg)] border bg-card">
          <Users className="h-10 w-10 text-[var(--meta)] mb-4" />
          <h3 className="text-base font-semibold text-foreground mb-1">No active sessions</h3>
          <p className="text-sm text-muted-foreground">
            No users are currently logged in to any services.
          </p>
        </div>
      ) : (
        <div className="rounded-[var(--radius-lg)] border bg-card overflow-hidden">
          <div className="divide-y divide-[var(--border-soft)]">
            {sessions.map((session) => {
              const isExpired = new Date(session.expiresAt) <= new Date();

              return (
                <div
                  key={session.id}
                  className={`p-4 transition-opacity ${
                    isExpired ? "opacity-50 bg-[var(--surface-2)]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="font-semibold text-foreground">
                          {session.serviceName || "Unknown Service"}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          {isExpired ? (
                            <span className="badge-state danger">
                              <span className="dot" />
                              Expired
                            </span>
                          ) : (
                            <span className="badge-state enabled">
                              <span className="dot" />
                              Active
                            </span>
                          )}
                          {session.userIdentifier && (
                            <Badge variant="outline" className="text-xs">
                              <User className="h-3 w-3 mr-1" />
                              {session.userIdentifier}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {session.subdomain && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            window.open(`https://${session.subdomain}`, "_blank")
                          }
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={deletingSession === session.id}
                            className="text-[var(--danger)] hover:text-[var(--danger)]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title="Delete Session"
                        description="Are you sure you want to delete this session? The user will be logged out."
                        confirmText="Delete"
                        onConfirm={() => handleDeleteSession(session.id)}
                        variant="destructive"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-[var(--meta)] text-xs mb-0.5">Created</p>
                      <p className="text-foreground">{formatDate(session.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-[var(--meta)] text-xs mb-0.5">Last Access</p>
                      <p className="text-foreground">{formatDate(session.lastAccessedAt)}</p>
                    </div>
                    <div>
                      <p className="text-[var(--meta)] text-xs mb-0.5">
                        {isExpired ? "Expired" : "Expires"}
                      </p>
                      {isExpired ? (
                        <p className="text-[var(--danger)]">{formatDate(session.expiresAt)}</p>
                      ) : (
                        <CountdownTimer
                          expiresAt={session.expiresAt}
                          onExpired={() => onExpired(session.id)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
