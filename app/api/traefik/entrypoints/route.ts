import { NextResponse } from "next/server";
import { getEntrypoints, isTraefikApiConfigured } from "@/lib/traefik-api";
import type { EntrypointsResponse } from "@/lib/traefik-client-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = isTraefikApiConfigured();
  if (!configured) {
    return NextResponse.json<EntrypointsResponse>({
      configured: false,
      reachable: false,
      entrypoints: [],
    });
  }
  try {
    const entrypoints = await getEntrypoints();
    return NextResponse.json<EntrypointsResponse>({
      configured: true,
      reachable: true,
      entrypoints: entrypoints.map((e) => ({ name: e.name, address: e.address })),
    });
  } catch (error) {
    console.error("Error fetching Traefik entrypoints:", error);
    return NextResponse.json<EntrypointsResponse>({
      configured: true,
      reachable: false,
      entrypoints: [],
    });
  }
}
