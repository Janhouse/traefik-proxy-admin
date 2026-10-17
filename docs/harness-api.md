# Harness integration API and MCP

A narrow, token-scoped surface that lets an automation (the "harness") publish
its own services on hostnames — and nothing else. It is available both as a
REST API and as an MCP server, and both go through the same code path
(`lib/harness/shares.ts`).

## The ownership rule

Every entry created through the API is tagged with the calling token's
**owner tag** (`services.owner_tag`). Every read, update and delete the API
or the MCP performs is filtered by that tag. Consequences:

- Services created in the admin panel (no owner tag) are invisible to tokens:
  they cannot be listed, read, changed or deleted.
- Entries of another owner tag look exactly like missing ones (`404`), so a
  token cannot probe for them.
- Tokens that share an owner tag share ownership, so a token can be rotated
  (create a new one with the same tag, revoke the old one) without orphaning
  its shares. Revoking a token does not delete its shares.
- Creating a share with a hostname that is already in use anywhere returns
  `409 hostname is already in use` and nothing else about the other entry.

Admins still see and can remove every API-created share (API page, and an
"API" badge in the services list).

## Concepts

**Zones** (API page → Zones; stored in `app_config.harness_settings`) say
which hostname suffixes shares may use and which access modes each allows.
Defaults:

| Suffix          | Access modes        | Entrypoints | Extra middlewares |
|-----------------|---------------------|-------------|-------------------|
| `i.janhouse.lv` | `only-me`, `network`| `websecure` | –                 |
| `e.janhouse.lv` | `public`            | `websecure` | –                 |

A domain with exactly the zone's suffix must exist on the Domains page (it
supplies the cert resolver / wildcard certificate). Otherwise create fails
with `422 not_configured`.

**Access modes**

- `only-me` — the "only me" forward-auth middleware(s) (default
  `auth-authentik@file`) are put in front. If none are configured, only-me
  shares are refused (fail closed).
- `network` — no auth; who can reach it is decided by the edge serving the
  domain (e.g. the intranet Traefik).
- `public` — no auth; **`expiresAt` is mandatory** on create and cannot be
  removed later.

**Expiry** — `expiresAt` is a hard deadline: from that instant the share is no
longer emitted to Traefik, and the sweeper (runs every 10 s with the service
scheduler, and before every Traefik poll) deletes it.

**Hostnames** — the hostname must be `<label>.<suffix>` with a single DNS
label. Multi-label names (`a.b.<suffix>`) need the `customHostname` scope; they
must still sit under an allowed suffix and get their own certificate (the
wildcard does not cover them).

**Edges** — a domain can be assigned to a named Traefik *edge* (Domains page).
`/api/traefik/config` serves only domains without an edge (the original
behaviour); `/api/traefik/config?edge=<name>` serves only that edge's domains.
Use this so intranet-only hostnames are never routed by the public Traefik.
Global middlewares apply to the default edge only; put middlewares a named
edge needs into the zone's *extra middlewares*.

## Tokens

Create them on the **API** page (`/harness`): name, owner tag (default
`harness`) and scopes. The token (`tpa_…`) is shown once; only its SHA-256 is
stored. Revoke from the same page.

| Scope            | Allows                                              |
|------------------|-----------------------------------------------------|
| `shares:read`    | list / get own shares                               |
| `shares:write`   | create, change expiry, delete own shares            |
| `customHostname` | multi-label hostnames under an allowed suffix       |

Send it as `Authorization: Bearer tpa_…`.

## REST API — `/api/harness/v1`

| Method | Path                  | Scope          | Body / query |
|--------|-----------------------|----------------|--------------|
| GET    | `/me`                 | any            | – token, scopes, zones |
| GET    | `/shares`             | `shares:read`  | `?workspace=&resource=&job=` |
| POST   | `/shares`             | `shares:write` | see below → `201` |
| GET    | `/shares/{id}`        | `shares:read`  | – |
| PATCH  | `/shares/{id}`        | `shares:write` | `{ "expiresAt": "<ISO-8601>" \| null }` |
| DELETE | `/shares/{id}`        | `shares:write` | – → `204` |

Create body:

```json
{
  "hostname": "myapp.e.janhouse.lv",
  "targetUrl": "http://workspace-1.harness.svc.cluster.local:8080",
  "authMode": "public",
  "expiresAt": "2026-10-18T12:00:00Z",
  "insecureSkipVerify": false,
  "labels": { "workspace": "ws-1", "resource": "web", "job": "job-42" }
}
```

`targetUrl` is `http(s)://host[:port]` only — no path, query or credentials.
Unknown fields are rejected. A share looks like:

```json
{
  "id": "…", "hostname": "myapp.e.janhouse.lv", "url": "https://myapp.e.janhouse.lv",
  "targetUrl": "http://workspace-1.harness.svc.cluster.local:8080",
  "authMode": "public", "expiresAt": "2026-10-18T12:00:00.000Z",
  "labels": { "workspace": "ws-1" }, "enabled": true,
  "createdAt": "…", "updatedAt": "…"
}
```

Errors: `{ "error": "<code>", "message": "…", "issues"?: [{ "path", "message" }] }`
with `400 invalid_request`, `401 unauthorized`, `403 forbidden` (scope),
`404 not_found` (missing or not yours), `409 conflict` (hostname taken),
`422 not_configured` (zone domain or only-me middleware missing).

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"hostname":"demo.i.janhouse.lv","targetUrl":"http://10.0.0.5:3000","authMode":"only-me"}' \
  https://<panel>/api/harness/v1/shares
```

## MCP — `/api/harness/mcp`

Streamable HTTP (stateless, JSON responses; `POST` only), same bearer token
and owner filter. Tools are registered only when the token's scopes allow them:

| Tool                  | Scope          | Annotations |
|-----------------------|----------------|-------------|
| `whoami`              | any            | readOnly |
| `list_shares`         | `shares:read`  | readOnly |
| `get_share`           | `shares:read`  | readOnly |
| `create_share`        | `shares:write` | not destructive, not idempotent, openWorld |
| `update_share_expiry` | `shares:write` | destructive, idempotent |
| `delete_share`        | `shares:write` | destructive, idempotent |

Client config example:

```json
{ "type": "http", "url": "https://<panel>/api/harness/mcp",
  "headers": { "Authorization": "Bearer tpa_…" } }
```

Browser requests with a foreign `Origin` are refused.

## Exposing it safely

The rest of the panel's API has no authentication of its own — it relies on
whatever sits in front of it (an SSO forward-auth, basic auth, or a private
network). The harness routes authenticate themselves, so:

- Expose **only** the `/api/harness/` prefix (note the trailing slash) to the
  harness without the admin auth. Admin endpoints for tokens/settings live
  under `/api/admin/harness/…` precisely so they never match that prefix.
- Do not let the harness reach the panel's port directly (e.g. in-cluster
  service) unless a network policy limits it to the harness routes — with
  direct access it could call the admin API and bypass the ownership rule.
