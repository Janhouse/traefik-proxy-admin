import { deleteShare, getShare, updateShareExpiry } from "@/lib/harness/shares";
import { json, readJsonBody, withPrincipal } from "@/lib/harness/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/harness/v1/shares/:id */
export const GET = withPrincipal<Ctx>(async (principal, _request, { params }) => {
  const { id } = await params;
  return json(await getShare(principal, id));
});

/** PATCH /api/harness/v1/shares/:id — { expiresAt: ISO-8601 | null } */
export const PATCH = withPrincipal<Ctx>(async (principal, request, { params }) => {
  const { id } = await params;
  return json(await updateShareExpiry(principal, id, await readJsonBody(request)));
});

/** DELETE /api/harness/v1/shares/:id */
export const DELETE = withPrincipal<Ctx>(async (principal, _request, { params }) => {
  const { id } = await params;
  await deleteShare(principal, id);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
