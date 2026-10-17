"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  API_TOKEN_SCOPES,
  DEFAULT_OWNER_TAG,
  SCOPE_DESCRIPTIONS,
  type ApiTokenScope,
} from "@/lib/harness/constants";

interface TokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  ownerTag: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

export function TokensSection() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [ownerTag, setOwnerTag] = useState(DEFAULT_OWNER_TAG);
  const [scopes, setScopes] = useState<ApiTokenScope[]>(["shares:read", "shares:write"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/harness/tokens", { cache: "no-store" });
      if (res.ok) setTokens(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setName("");
    setOwnerTag(DEFAULT_OWNER_TAG);
    setScopes(["shares:read", "shares:write"]);
    setError(null);
    setCreating(true);
  };

  const toggleScope = (scope: ApiTokenScope, on: boolean) =>
    setScopes((prev) => (on ? [...new Set([...prev, scope])] : prev.filter((s) => s !== scope)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/harness/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ownerTag, scopes }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to create token");
        return;
      }
      setCreating(false);
      setRevealed(body.token);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id: string) => {
    const res = await fetch(`/api/admin/harness/tokens/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Token revoked", "delete");
      await load();
    } else {
      toast("Failed to revoke token", "error");
    }
  };

  const copy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      toast("Token copied", "info");
    } catch {
      toast("Copy failed — select the token and copy it manually", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="btn-brand" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New token
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading tokens…</p>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tokens yet. Create one to let the harness manage its own shares.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Owner tag</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="w-[1%]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((t) => (
              <TableRow key={t.id} className={t.revokedAt ? "opacity-60" : ""}>
                <TableCell className="font-medium">
                  {t.name}
                  {t.revokedAt && (
                    <Badge variant="destructive" className="ml-2">
                      revoked
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{t.tokenPrefix}…</TableCell>
                <TableCell className="font-mono text-xs">{t.ownerTag}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {t.scopes.map((s) => (
                      <Badge key={s} variant="outline" className="font-mono text-[11px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{fmt(t.createdAt)}</TableCell>
                <TableCell className="text-xs">{fmt(t.lastUsedAt)}</TableCell>
                <TableCell>
                  {!t.revokedAt && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm" aria-label={`Revoke ${t.name}`}>
                          <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                        </Button>
                      }
                      title="Revoke token?"
                      description={`"${t.name}" stops working immediately. Shares it created stay in place under the "${t.ownerTag}" owner tag (and still expire).`}
                      confirmText="Revoke"
                      variant="destructive"
                      onConfirm={() => void revoke(t.id)}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={creating} onOpenChange={(open) => !submitting && setCreating(open)}>
        <DialogContent className="bg-card sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>New API token</DialogTitle>
            <DialogDescription>
              The token is shown once. Entries it creates are tagged with the owner tag, and it
              can only see entries carrying that tag.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <div className="space-y-1.5">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. harness (prod)"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token-owner">Owner tag</Label>
              <Input
                id="token-owner"
                value={ownerTag}
                onChange={(e) => setOwnerTag(e.target.value)}
                className="font-mono"
                required
              />
              <p className="text-[12px] text-[var(--meta)]">
                Tokens with the same tag share ownership — use the same tag when rotating.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              {API_TOKEN_SCOPES.map((scope) => (
                <div
                  key={scope}
                  className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2"
                >
                  <div>
                    <p className="font-mono text-[13px]">{scope}</p>
                    <p className="text-[12px] text-[var(--meta)]">{SCOPE_DESCRIPTIONS[scope]}</p>
                  </div>
                  <Switch
                    checked={scopes.includes(scope)}
                    onCheckedChange={(on) => toggleScope(scope, on)}
                    aria-label={scope}
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="btn-brand"
                disabled={submitting || !name.trim() || scopes.length === 0}
              >
                Create token
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={revealed !== null} onOpenChange={(open) => !open && setRevealed(null)}>
        <DialogContent className="bg-card sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Copy your token now
            </DialogTitle>
            <DialogDescription>
              It will not be shown again — only a hash is stored. Send it as{" "}
              <code>Authorization: Bearer &lt;token&gt;</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={revealed ?? ""} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" onClick={() => void copy()} aria-label="Copy token">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button className="btn-brand" onClick={() => setRevealed(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
