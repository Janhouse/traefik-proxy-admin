import { NextResponse } from "next/server";
import { getMetricsSnapshot } from "@/lib/metrics-source";
import "@/lib/startup"; // ensure the metrics scraper is running

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getMetricsSnapshot();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching Traefik metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch Traefik metrics" },
      { status: 500 }
    );
  }
}
