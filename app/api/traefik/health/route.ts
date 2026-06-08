import { NextResponse } from "next/server";
import { getBackendHealthMap } from "@/lib/traefik-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getBackendHealthMap();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error computing backend health:", error);
    return NextResponse.json(
      { error: "Failed to compute backend health" },
      { status: 500 }
    );
  }
}
