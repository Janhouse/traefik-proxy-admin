"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, Users, User, Clock, ExternalLink } from "lucide-react";
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
  onRefresh,
  onDelete,
  onDeleteAll,
  onExpired,
}: SessionsTableProps) {
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const handleDeleteSession = async (sessionId: string) => {
    setDeletingSession(sessionId);
    try {
      await onDelete(sessionId);
    } finally {
      setDeletingSession(null);
    }
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      await onDeleteAll();
    } finally {
      setDeletingAll(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const activeSessions = sessions.filter(session => new Date(session.expiresAt) > new Date());
  const expiredSessions = sessions.filter(session => new Date(session.expiresAt) <= new Date());

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Active Sessions
          </CardTitle>
          <CardDescription>Loading sessions...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{activeSessions.length}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Active Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-red-600" />
              <div>
                <p className="text-2xl font-bold">{expiredSessions.length}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Expired Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <User className="h-6 w-6 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{sessions.length}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Session Management
              </CardTitle>
              <CardDescription>
                Manage active user sessions across all services
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {sessions.length > 0 && (
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deletingAll}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete All
                    </Button>
                  }
                  title="Delete All Sessions"
                  description="Are you sure you want to delete all sessions? This will log out all users from all services."
                  confirmText="Delete All"
                  onConfirm={handleDeleteAll}
                  variant="destructive"
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No active sessions
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                No users are currently logged in to any services.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => {
                const isExpired = new Date(session.expiresAt) <= new Date();

                return (
                  <div
                    key={session.id}
                    className={`border rounded-lg p-4 transition-opacity ${
                      isExpired ? "opacity-50 bg-gray-50 dark:bg-gray-800/50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <h3 className="font-medium">
                            {session.serviceName || 'Unknown Service'}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={isExpired ? "secondary" : "default"}>
                              {isExpired ? "Expired" : "Active"}
                            </Badge>
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
                            onClick={() => window.open(`https://${session.subdomain}`, '_blank')}
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
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title="Delete Session"
                          description={`Are you sure you want to delete this session? The user will be logged out.`}
                          confirmText="Delete"
                          onConfirm={() => handleDeleteSession(session.id)}
                          variant="destructive"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <label className="text-gray-500 dark:text-gray-400">Created</label>
                        <p>{formatDate(session.createdAt)}</p>
                      </div>
                      <div>
                        <label className="text-gray-500 dark:text-gray-400">Last Access</label>
                        <p>{formatDate(session.lastAccessedAt)}</p>
                      </div>
                      <div>
                        <label className="text-gray-500 dark:text-gray-400">
                          {isExpired ? "Expired" : "Expires"}
                        </label>
                        {isExpired ? (
                          <p className="text-red-600">
                            {formatDate(session.expiresAt)}
                          </p>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}