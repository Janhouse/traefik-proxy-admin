import "server-only";
import { serviceScheduler } from "./service-scheduler";
import { metricsScheduler } from "./metrics-source";
import { isManagedMode } from "./managed-traefik";
import { materializeManagedSecrets } from "./managed-secrets-store";

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

      // Managed mode: the Traefik wrapper reads DNS credentials from an env
      // file on a shared tmpfs mount, which is empty after a reboot — rewrite
      // it from the encrypted store. Failure here must not block the app
      // (an undecryptable store is reported by the managed status instead).
      if (isManagedMode()) {
        try {
          const st = await materializeManagedSecrets();
          console.log(`Managed credentials materialised to ${st.path}`);
        } catch (error) {
          console.error(
            "Could not materialise managed credentials for Traefik:",
            error instanceof Error ? error.message : "unknown error"
          );
        }
      }

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
