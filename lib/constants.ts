// Cookie constants
export const TRAEFIK_SESSION_COOKIE = "traefik-session";

// Cookie configuration defaults
export const COOKIE_DEFAULTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/"
} as const;