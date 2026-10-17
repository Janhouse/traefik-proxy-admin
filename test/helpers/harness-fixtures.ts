import { db, domains, services } from "@/lib/db";
import { updateHarnessSettings } from "@/lib/harness/settings";
import { authenticateToken, createApiToken, type TokenPrincipal } from "@/lib/harness/tokens";
import type { ApiTokenScope } from "@/lib/harness/constants";

/** Zones used by the harness tests: an intranet edge and a public one. */
export const TEST_SETTINGS = {
  zones: [
    {
      suffix: "i.example.com",
      authModes: ["only-me", "network"],
      entrypoints: ["websecure"],
      middlewares: [],
    },
    {
      suffix: "e.example.com",
      authModes: ["public"],
      entrypoints: ["websecure"],
      middlewares: ["hsts@file"],
    },
  ],
  onlyMeMiddlewares: ["auth-authentik@file"],
};

/**
 * Seed: the two zone domains (intranet on the "internal" edge) plus an
 * admin-created service that no token may ever see or touch.
 */
export async function seedHarnessWorld() {
  await updateHarnessSettings(TEST_SETTINGS);
  const [intra] = await db
    .insert(domains)
    .values({ name: "Intra", domain: "i.example.com", certResolver: "le", edge: "internal" })
    .returning();
  const [ext] = await db
    .insert(domains)
    .values({ name: "Ext", domain: "e.example.com", certResolver: "letsencrypt" })
    .returning();
  const [adminService] = await db
    .insert(services)
    .values({
      name: "Admin app",
      subdomain: "admin-app",
      hostnameMode: "subdomain",
      domainId: ext.id,
      targetIp: "10.0.0.9",
      targetPort: 8080,
    })
    .returning();
  return { intra, ext, adminService };
}

export async function makePrincipal(
  scopes: ApiTokenScope[] = ["shares:read", "shares:write"],
  ownerTag = "harness",
  name = "test"
): Promise<{ token: string; principal: TokenPrincipal }> {
  const { token } = await createApiToken({ name, ownerTag, scopes });
  const principal = await authenticateToken(token);
  if (!principal) throw new Error("token did not authenticate");
  return { token, principal };
}

export const inHours = (h: number, from = new Date()) =>
  new Date(from.getTime() + h * 3600_000).toISOString();
