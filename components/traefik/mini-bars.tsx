import type { BackendHealthState } from "@/lib/traefik-client-types";

export type Tone = "up" | "down" | "na";

/** Tone is driven by backend health, never by the config-enabled toggle. */
export function healthToTone(state: BackendHealthState): Tone {
  return state === "up" ? "up" : state === "down" ? "down" : "na";
}

const COUNT = 24;

/**
 * 24-bucket request-rate micro-histogram. Color comes entirely from `tone`
 * (set by the caller from backend health). Zero buckets render as `.z` floor
 * stubs so a down route shows a red cliff.
 */
export function MiniBars({
  bars,
  tone,
  large = false,
  title,
}: {
  bars: number[];
  tone: Tone;
  large?: boolean;
  title?: string;
}) {
  const data = Array.from({ length: COUNT }, (_, i) => bars[i] ?? 0);
  const max = Math.max(0, ...data);
  return (
    <span
      className={`minibars tone-${tone}${large ? " is-large" : ""}`}
      aria-hidden="true"
      title={title}
    >
      {data.map((v, i) => {
        const pct = max > 0 ? Math.max(6, Math.round((v / max) * 100)) : 6;
        const cls = v === 0 ? "z" : v === max ? "peak" : "";
        return <i key={i} className={cls} style={{ height: `${pct}%` }} />;
      })}
    </span>
  );
}
