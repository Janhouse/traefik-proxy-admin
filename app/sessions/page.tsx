"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, ArrowLeft, Users, Clock, User } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface SessionInfo {
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

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
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
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        await fetchSessions();
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  const handleDeleteAllSessions = async () => {
    try {
      const response = await fetch("/api/sessions", {
        method: "DELETE",
      });
      
      if (response.ok) {
        await fetchSessions();
      }
    } catch (error) {
      console.error("Failed to delete all sessions:", error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) {
      return "Expired";
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Back to Services
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Session Management</h1>
              <p className="text-muted-foreground">
                Manage active user sessions and authentication
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ThemeToggle />
            <Button 
              onClick={fetchSessions}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <ConfirmDialog
              trigger={
                <Button 
                  variant="destructive"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete All
                </Button>
              }
              title="Delete All Sessions"
              description="Are you sure you want to invalidate ALL sessions? This will log out all users from all services."
              confirmText="Delete All Sessions"
              onConfirm={handleDeleteAllSessions}
              variant="destructive"
            />
          </div>
        </div>

        {/* Sessions List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Active Sessions
            </CardTitle>
            <CardDescription>
              {sessions.length === 0 
                ? "No active sessions found"
                : `${sessions.length} active session${sessions.length === 1 ? '' : 's'}`
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {sessions.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No active sessions</h3>
                <p className="text-muted-foreground">
                  When users authenticate with services, their sessions will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {sessions.map((session) => (
                  <div key={session.id} className="p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">
                            {session.serviceName || "Unknown Service"}
                          </h3>
                          <Badge 
                            variant={getTimeRemaining(session.expiresAt) === "Expired" ? "destructive" : "default"}
                          >
                            <Clock className="mr-1 h-3 w-3" />
                            {getTimeRemaining(session.expiresAt)}
                          </Badge>
                        </div>
                        <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2 lg:grid-cols-4">
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            <span>{session.userIdentifier || "Anonymous"}</span>
                          </div>
                          <div>
                            <span className="font-medium">Created:</span> {formatDate(session.createdAt)}
                          </div>
                          <div>
                            <span className="font-medium">Last access:</span> {formatDate(session.lastAccessedAt)}
                          </div>
                          <div>
                            <span className="font-medium">Expires:</span> {formatDate(session.expiresAt)}
                          </div>
                        </div>
                        {session.subdomain && (
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium">Service URL:</span> {session.subdomain}.example.com
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2">
                        <ConfirmDialog
                          trigger={
                            <Button variant="outline" size="sm">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Invalidate
                            </Button>
                          }
                          title="Invalidate Session"
                          description={`Are you sure you want to invalidate this session? The user will be logged out immediately.`}
                          confirmText="Invalidate Session"
                          onConfirm={() => handleDeleteSession(session.id)}
                          variant="destructive"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}