import { NextResponse } from "next/server";
import { getCertificates } from "@/lib/traefik-certs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getCertificates());
  } catch (error) {
    console.error("Error reading certificates:", error);
    return NextResponse.json(
      { error: "Failed to read certificates" },
      { status: 500 }
    );
  }
}
