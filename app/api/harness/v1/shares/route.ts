import { createShare, listShares } from "@/lib/harness/shares";
import { json, readJsonBody, withPrincipal } from "@/lib/harness/http";
import { SHARE_LABEL_KEYS } from "@/lib/harness/constants";

export const dynamic = "force-dynamic";

/** GET /api/harness/v1/shares[?workspace=&resource=&job=] — own shares only. */
export const GET = withPrincipal(async (principal, request) => {
  const params = new URL(request.url).searchParams;
  const filter: Record<string, string> = {};
  for (const key of SHARE_LABEL_KEYS) {
    const value = params.get(key);
    if (value !== null) filter[key] = value;
  }
  return json({ shares: await listShares(principal, filter) });
});

/** POST /api/harness/v1/shares — create a share. */
export const POST = withPrincipal(async (principal, request) => {
  const share = await createShare(principal, await readJsonBody(request));
  return json(share, 201);
});
