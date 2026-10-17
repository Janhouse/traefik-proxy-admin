import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getHarnessSettings, updateHarnessSettings } from "@/lib/harness/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getHarnessSettings());
  } catch (error) {
    console.error("Error reading harness settings:", error);
    return NextResponse.json({ error: "Failed to read settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    return NextResponse.json(await updateHarnessSettings(await request.json()));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error:
            error instanceof ZodError
              ? error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")
              : "Invalid JSON",
        },
        { status: 400 }
      );
    }
    console.error("Error saving harness settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
