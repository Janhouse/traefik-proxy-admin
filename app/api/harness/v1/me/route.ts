import { describeAccess } from "@/lib/harness/shares";
import { json, withPrincipal } from "@/lib/harness/http";

export const dynamic = "force-dynamic";

/** GET /api/harness/v1/me — the token's identity, scopes and allowed zones. */
export const GET = withPrincipal(async (principal) => json(await describeAccess(principal)));
