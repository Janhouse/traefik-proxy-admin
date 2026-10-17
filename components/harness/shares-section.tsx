"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "@/components/toaster";

interface ShareRow {
  id: string;
  hostname: string | null;
  ownerTag: string;
  tokenName: string | null;
  authMode: string | null;
  labels: Record<string, string>;
  target: string;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
}

/** Overview of every API-created entry; admins can remove any of them. */
export function SharesSection() {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/harness/shares", { cache: "no-store" });
      if (res.ok) setShares(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const remove = async (id: string) => {
    const res = await fetch(`/api/services/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Share removed", "delete");
      await load();
    } else {
      toast("Failed to remove share", "error");
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading shares…</p>;
  if (shares.length === 0) {
    return <p className="text-sm text-muted-foreground">No API-created shares.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Hostname</TableHead>
          <TableHead>Access</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Labels</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="w-[1%]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shares.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-mono text-xs">
              {s.hostname ? (
                <a href={`https://${s.hostname}`} target="_blank" rel="noreferrer" className="hover:underline">
                  {s.hostname}
                </a>
              ) : (
                s.id
              )}
            </TableCell>
            <TableCell>
              <Badge variant={s.authMode === "public" ? "destructive" : "outline"}>
                {s.authMode ?? "—"}
              </Badge>
            </TableCell>
            <TableCell className="font-mono text-xs">{s.target}</TableCell>
            <TableCell className="text-xs">
              <span className="font-mono">{s.ownerTag}</span>
              {s.tokenName && <span className="text-[var(--meta)]"> · {s.tokenName}</span>}
            </TableCell>
            <TableCell className="text-xs">
              {Object.entries(s.labels)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ") || "—"}
            </TableCell>
            <TableCell className="text-xs">
              {s.expiresAt ? new Date(s.expiresAt).toLocaleString() : "never"}
            </TableCell>
            <TableCell>
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" aria-label={`Remove ${s.hostname ?? s.id}`}>
                    <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                  </Button>
                }
                title="Remove share?"
                description={`${s.hostname ?? s.id} stops routing on Traefik's next poll.`}
                confirmText="Remove"
                variant="destructive"
                onConfirm={() => void remove(s.id)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
