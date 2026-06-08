import "server-only";

/* Minimal Prometheus text-exposition-format support — just enough to read
 * Traefik's /metrics endpoint. No external dependency. */

const TIMEOUT_MS = 4000;

class MetricsFetchError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "MetricsFetchError";
  }
}

/** Fetch a Prometheus metrics endpoint as text (mirrors lib/traefik-api fetch). */
export async function fetchMetricsText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/plain" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new MetricsFetchError(`Metrics endpoint ${url} responded ${res.status}`, res.status);
    }
    return await res.text();
  } catch (err) {
    if (err instanceof MetricsFetchError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new MetricsFetchError(`Failed to reach metrics endpoint ${url}: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

export interface PromSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

// metric_name{label="value",...} 123.45   (timestamp suffix, if any, is ignored)
const LINE_RE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+([^\s]+)/;

function parseLabels(block: string): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!block) return labels;
  // name="value" pairs; values may contain escaped quotes/backslashes.
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    labels[m[1]] = m[2].replace(/\\(["\\n])/g, (_s, c) => (c === "n" ? "\n" : c));
  }
  return labels;
}

/** Parse exposition text into samples (skips HELP/TYPE comments + blank lines). */
export function parseProm(text: string): PromSample[] {
  const out: PromSample[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const value = Number(m[4]);
    if (!Number.isFinite(value)) continue;
    out.push({ name: m[1], labels: parseLabels(m[3] || ""), value });
  }
  return out;
}

/** Strip the `@provider` suffix from a Traefik object name/label. */
export function stripProvider(name: string): string {
  return name.split("@")[0];
}
