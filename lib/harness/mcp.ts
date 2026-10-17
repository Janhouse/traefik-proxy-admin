import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  SCOPE_SHARES_READ,
  SCOPE_SHARES_WRITE,
  SHARE_AUTH_MODES,
} from "./constants";
import {
  createShare,
  deleteShare,
  describeAccess,
  getShare,
  HarnessError,
  listShares,
  updateShareExpiry,
} from "./shares";
import type { TokenPrincipal } from "./tokens";

/*
 * MCP server exposing the same operations as the REST API. It is built per
 * request around an already-authenticated principal and calls the same
 * owner-filtered share layer, so it can never see or touch entries that the
 * token's owner did not create. Tools a token's scopes do not allow are not
 * registered at all.
 */

export const MCP_TOOL_NAMES = [
  "whoami",
  "list_shares",
  "get_share",
  "create_share",
  "update_share_expiry",
  "delete_share",
] as const;

const labelFields = {
  workspace: z.string().optional().describe("Workspace label"),
  resource: z.string().optional().describe("Resource label"),
  job: z.string().optional().describe("Job label"),
};

const idField = z.string().describe("Share id (UUID) as returned by create_share/list_shares");

function ok(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent:
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : { result: value },
  };
}

async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (error) {
    if (error instanceof HarnessError) {
      const issues = error.issues?.map((i) => `${i.path || "(root)"}: ${i.message}`).join("; ");
      return {
        isError: true,
        content: [
          { type: "text", text: `${error.code}: ${error.message}${issues ? ` (${issues})` : ""}` },
        ],
      };
    }
    console.error("Harness MCP tool error:", error);
    return { isError: true, content: [{ type: "text", text: "internal_error" }] };
  }
}

export function buildHarnessMcpServer(principal: TokenPrincipal): McpServer {
  const server = new McpServer(
    { name: "traefik-proxy-admin-harness", version: "1.0.0" },
    {
      instructions:
        "Publish workspace services on hostnames through Traefik. Only shares created " +
        "by this token's owner are visible. Call whoami first to learn the allowed " +
        "hostname suffixes and access modes. Public shares always need expiresAt.",
    }
  );
  const can = (scope: string) => (principal.scopes as string[]).includes(scope);

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Return this token's name, owner tag and scopes, plus the allowed hostname suffixes and the access modes each one permits.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => run(() => describeAccess(principal))
  );

  if (can(SCOPE_SHARES_READ)) {
    server.registerTool(
      "list_shares",
      {
        title: "List shares",
        description: "List shares created by this token's owner, optionally filtered by labels.",
        inputSchema: labelFields,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      (args) => run(async () => ({ shares: await listShares(principal, args) }))
    );

    server.registerTool(
      "get_share",
      {
        title: "Get share",
        description: "Get one share by id.",
        inputSchema: { id: idField },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      ({ id }) => run(() => getShare(principal, id))
    );
  }

  if (can(SCOPE_SHARES_WRITE)) {
    server.registerTool(
      "create_share",
      {
        title: "Create share",
        description:
          "Expose an upstream URL on a hostname. hostname must be <label>.<suffix> for an allowed suffix " +
          "(see whoami). authMode: only-me (forward-auth, owner only), network (no auth, intranet " +
          "reachability), public (no auth, internet; expiresAt required).",
        inputSchema: {
          hostname: z.string().describe("Full hostname, e.g. myapp.e.example.com"),
          targetUrl: z
            .string()
            .describe("Upstream base URL: http(s)://host[:port] — no path, query or credentials"),
          authMode: z.enum(SHARE_AUTH_MODES),
          expiresAt: z
            .string()
            .nullable()
            .optional()
            .describe("ISO-8601 expiry with offset; required for public. The share is removed after it."),
          insecureSkipVerify: z
            .boolean()
            .optional()
            .describe("For https upstreams: skip certificate verification"),
          labels: z.object(labelFields).optional(),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      (args) => run(() => createShare(principal, args))
    );

    server.registerTool(
      "update_share_expiry",
      {
        title: "Extend or shorten a share",
        description:
          "Set a share's expiry. A later time extends it, an earlier one shortens it; null removes the expiry (not allowed for public shares).",
        inputSchema: {
          id: idField,
          expiresAt: z.string().nullable().describe("ISO-8601 with offset, in the future, or null"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ id, expiresAt }) => run(() => updateShareExpiry(principal, id, { expiresAt }))
    );

    server.registerTool(
      "delete_share",
      {
        title: "Delete share",
        description: "Remove a share; the hostname stops routing on Traefik's next poll.",
        inputSchema: { id: idField },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ id }) =>
        run(async () => {
          await deleteShare(principal, id);
          return { deleted: id };
        })
    );
  }

  return server;
}

/** Handle one stateless Streamable-HTTP MCP request for `principal`. */
export async function handleMcpRequest(
  principal: TokenPrincipal,
  request: Request
): Promise<Response> {
  const server = buildHarnessMcpServer(principal);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: every request is self-contained
    enableJsonResponse: true,
    maxRequestBodySize: 256 * 1024,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
