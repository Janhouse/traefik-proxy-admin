import { NextResponse } from "next/server";
import { getCertResolvers } from "@/lib/cert-resolvers";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getCertResolvers());
}
