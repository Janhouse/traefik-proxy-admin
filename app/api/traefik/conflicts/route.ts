import { NextResponse } from "next/server";
import { getRouteConflicts } from "@/lib/route-conflicts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getRouteConflicts());
  } catch (error) {
    console.error("Error computing route conflicts:", error);
    return NextResponse.json(
      { error: "Failed to compute route conflicts" },
      { status: 500 }
    );
  }
}
