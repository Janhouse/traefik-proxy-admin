import { NextResponse } from "next/server";
import { getBackendHealthMap } from "@/lib/traefik-service";
import type { BackendHealthResponse } from "@/lib/traefik-client-types";

export const dynamic = "force-dynamic";

/* Three 15 s pollers (dashboard, service page, runtime explorer) — possibly
 * across several tabs — each triggered a fresh TCP probe of every enabled
 * backend. Share one probe round through a short module-level cache; callers
 * that arrive while a round is in flight await the same promise. */
const CACHE_TTL_MS = 10_000;

let cached: { at: number; data: BackendHealthResponse } | null = null;
let inFlight: Promise<BackendHealthResponse> | null = null;

async function getCachedHealth(): Promise<BackendHealthResponse> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.data;
  if (inFlight) return inFlight;
  inFlight = getBackendHealthMap()
    .then((data) => {
      cached = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export async function GET() {
  try {
    const data = await getCachedHealth();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error computing backend health:", error);
    return NextResponse.json(
      { error: "Failed to compute backend health" },
      { status: 500 }
    );
  }
}
