import "server-only";
import { serviceScheduler } from "./service-scheduler";
import { metricsScheduler } from "./metrics-source";

const RETRY_MS = 30_000;

let isInitialized = false;
let inFlight: Promise<void> | null = null;

/**
 * Start the background schedulers exactly once. A failed attempt does NOT
 * mark the app as initialized, so the next import/call retries; concurrent
 * callers share the in-flight attempt.
 */
export async function initializeServices(): Promise<void> {
  if (isInitialized) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    console.log("Initializing application services...");
    try {
      // Start the service auto-disable scheduler
      await serviceScheduler.start();

      // Start the Traefik metrics scraper (no-op if not configured)
      await metricsScheduler.start();

      isInitialized = true;
      console.log("Application services initialized successfully");
    } catch (error) {
      console.error(
        "Failed to initialize application services (will retry):",
        error
      );
      // Importers only trigger the side-effect init once, so also retry on a
      // timer; unref'd so it never keeps a shutting-down process alive.
      const t = setTimeout(() => void initializeServices(), RETRY_MS);
      t.unref?.();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// Auto-initialize when this module is imported
if (typeof window === "undefined") { // Server-side only
  void initializeServices();
}
