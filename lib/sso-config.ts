import { db, appConfig } from "@/lib/db";
import { eq } from "drizzle-orm";

export interface SSOConfig {
  enabled: boolean;
  idpUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export async function getSSOConfig(): Promise<SSOConfig> {
  const configs = await db
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, "sso_config"));

  if (configs.length === 0) {
    return {
      enabled: false,
      idpUrl: "",
      clientId: "",
      clientSecret: "",
      redirectUri: "",
      scopes: ["openid", "profile", "groups"],
    };
  }

  return JSON.parse(configs[0].value);
}

export async function updateSSOConfig(config: SSOConfig): Promise<void> {
  const configValue = JSON.stringify(config);
  
  await db
    .insert(appConfig)
    .values({
      key: "sso_config",
      value: configValue,
      description: "SSO Identity Provider Configuration",
    })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: {
        value: configValue,
        updatedAt: new Date(),
      },
    });
}

export function generateSSOAuthUrl(config: SSOConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(" "),
    state,
  });

  return `${config.idpUrl}/auth?${params.toString()}`;
}

export async function exchangeCodeForToken(
  config: SSOConfig,
  code: string
): Promise<{ access_token: string; id_token?: string }> {
  const response = await fetch(`${config.idpUrl}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to exchange code for token");
  }

  return response.json();
}

export async function getUserInfo(
  config: SSOConfig,
  accessToken: string
): Promise<{ sub: string; name: string; groups?: string[] }> {
  const response = await fetch(`${config.idpUrl}/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user info");
  }

  return response.json();
}