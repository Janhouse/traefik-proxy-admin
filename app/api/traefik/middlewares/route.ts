import { NextResponse } from "next/server";
import {
  getHttpMiddlewares,
  isTraefikApiConfigured,
  providerOf,
} from "@/lib/traefik-api";
import type { MiddlewaresResponse } from "@/lib/traefik-client-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isTraefikApiConfigured();
  if (!configured) {
    return NextResponse.json<MiddlewaresResponse>({
      configured: false,
      reachable: false,
      middlewares: [],
    });
  }
  try {
    const middlewares = await getHttpMiddlewares();
    return NextResponse.json<MiddlewaresResponse>({
      configured: true,
      reachable: true,
      middlewares: middlewares.map((m) => ({
        name: m.name,
        type: m.type || (m.plugin ? "plugin" : "middleware"),
        provider: providerOf(m),
        status: m.status,
      })),
    });
  } catch (error) {
    console.error("Error fetching Traefik middlewares:", error);
    return NextResponse.json<MiddlewaresResponse>({
      configured: true,
      reachable: false,
      middlewares: [],
    });
  }
}
