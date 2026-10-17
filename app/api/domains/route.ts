import { NextRequest, NextResponse } from "next/server";
import { DomainService } from "@/lib/services/domain.service";
import { isValidEdgeInput, normalizeEdge } from "@/lib/edge";
import type { CreateDomainRequest, CreateDomainData } from "@/lib/dto/domain.dto";

export async function GET() {
  try {
    const domains = await DomainService.getAllDomains();
    return NextResponse.json(domains);
  } catch (error) {
    console.error("Error fetching domains:", error);
    return NextResponse.json(
      { error: "Failed to fetch domains" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateDomainRequest = await request.json();
    if (!isValidEdgeInput(body.edge)) {
      return NextResponse.json(
        { error: "Edge must be a lowercase name (letters, digits, dashes)" },
        { status: 400 }
      );
    }

    const newDomainData: CreateDomainData = {
      name: body.name,
      domain: body.domain,
      description: body.description || null,
      useWildcardCert: body.useWildcardCert ?? true,
      certResolver: body.certResolver || "letsencrypt",
      certificateConfigs: body.certificateConfigs ? JSON.stringify(body.certificateConfigs) : null,
      isDefault: body.isDefault ?? false,
      edge: normalizeEdge(body.edge),
    };

    const domain = await DomainService.createDomain(newDomainData);
    return NextResponse.json(domain);
  } catch (error) {
    console.error("Error creating domain:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create domain" },
      { status: 500 }
    );
  }
}