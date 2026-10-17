/* Harness integration API — constants shared by the server and the admin UI
 * (no server-only imports). */

/** Token scopes. */
export const SCOPE_SHARES_READ = "shares:read";
export const SCOPE_SHARES_WRITE = "shares:write";
/** Allows multi-label hostnames (still under an allowed suffix). */
export const SCOPE_CUSTOM_HOSTNAME = "customHostname";

export const API_TOKEN_SCOPES = [
  SCOPE_SHARES_READ,
  SCOPE_SHARES_WRITE,
  SCOPE_CUSTOM_HOSTNAME,
] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

export const SCOPE_DESCRIPTIONS: Record<ApiTokenScope, string> = {
  "shares:read": "List and read the shares this token's owner created",
  "shares:write": "Create shares, change their expiry and delete them",
  customHostname: "Use multi-label hostnames (e.g. a.b.<suffix>) instead of a single label",
};

/**
 * Share access modes:
 * - only-me: the zone's "only me" forward-auth middleware(s) in front
 * - network: no auth; reachability is whatever the edge allows (intranet)
 * - public:  no auth on a public edge; an expiry is mandatory
 */
export const SHARE_AUTH_MODES = ["only-me", "network", "public"] as const;
export type ShareAuthMode = (typeof SHARE_AUTH_MODES)[number];

/** Default owner tag for new tokens. */
export const DEFAULT_OWNER_TAG = "harness";

/** Labels a caller may attach to a share. */
export const SHARE_LABEL_KEYS = ["workspace", "resource", "job"] as const;
export type ShareLabelKey = (typeof SHARE_LABEL_KEYS)[number];
export type ShareLabels = Partial<Record<ShareLabelKey, string>>;

/** Owner tags / labels: short, URL- and log-safe. */
export const OWNER_TAG_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
