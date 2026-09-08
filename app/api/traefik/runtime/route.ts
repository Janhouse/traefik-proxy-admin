import { NextResponse } from "next/server";
import { getRuntimeSnapshot } from "@/lib/traefik-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getRuntimeSnapshot();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching Traefik runtime:", error);
    return NextResponse.json(
      { error: "Failed to fetch Traefik runtime" },
      { status: 500 }
    );
  }
}
