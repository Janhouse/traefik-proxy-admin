import { NextResponse } from "next/server";
import { isManagedMode } from "@/lib/managed-traefik";

export const dynamic = "force-dynamic";

/** Lightweight client-facing system flags (no secrets, no DB work). */
export async function GET() {
  return NextResponse.json({ managed: isManagedMode() });
}
