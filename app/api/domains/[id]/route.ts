import { NextRequest, NextResponse } from "next/server";
import { DomainService } from "@/lib/services/domain.service";
import type { UpdateDomainRequest, UpdateDomainData } from "@/lib/dto/domain.dto";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const domain = await DomainService.getDomainById(id);

    if (!domain) {
      return NextResponse.json(
        { error: "Domain not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(domain);
  } catch (error) {
    console.error("Error fetching domain:", error);
    return NextResponse.json(
      { error: "Failed to fetch domain" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdateDomainRequest = await request.json();

    const updateData: UpdateDomainData = {
      name: body.name,
      domain: body.domain,
      description: body.description || null,
      useWildcardCert: body.useWildcardCert ?? true,
      certResolver: body.certResolver || "letsencrypt",
      isDefault: body.isDefault ?? false,
    };

    const domain = await DomainService.updateDomain(id, updateData);
    return NextResponse.json(domain);
  } catch (error) {
    console.error("Error updating domain:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update domain" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await DomainService.deleteDomain(id);

    return NextResponse.json({ message: "Domain deleted successfully" });
  } catch (error) {
    console.error("Error deleting domain:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to delete domain" },
      { status: 500 }
    );
  }
}