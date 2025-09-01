/**
 * Utility functions for duration calculations and formatting
 */

/**
 * Get the effective duration for a service, handling undefined/null cases
 */
export function getEffectiveDuration(
  serviceDurationMinutes: number | null | undefined,
  defaultDurationMinutes: number | null | undefined
): number | null {
  console.log("getEffectiveDuration - serviceDurationMinutes:", serviceDurationMinutes, "defaultDurationMinutes:", defaultDurationMinutes);
  if (serviceDurationMinutes === undefined) {
    const result = defaultDurationMinutes ?? null;
    console.log("getEffectiveDuration - returning default:", result);
    return result;
  }
  console.log("getEffectiveDuration - returning service:", serviceDurationMinutes);
  return serviceDurationMinutes;
}

/**
 * Calculate the expiry time for a service
 */
export function calculateExpiryTime(
  enabledAt: string | Date,
  durationMinutes: number | null | undefined
): Date | null {
  if (durationMinutes === null || durationMinutes === undefined) {
    return null; // Never expires
  }
  
  const enabledTime = new Date(enabledAt).getTime();
  return new Date(enabledTime + (durationMinutes * 60 * 1000));
}

/**
 * Format duration for display
 */
export function formatDurationRemaining(
  enabledAt: string | Date,
  durationMinutes: number | null | undefined
): string | null {
  if (durationMinutes === null || durationMinutes === undefined) {
    return "Forever";
  }
  
  const expiryTime = calculateExpiryTime(enabledAt, durationMinutes);
  if (!expiryTime) {
    return "Forever";
  }
  
  const now = Date.now();
  const remainingTime = expiryTime.getTime() - now;
  
  if (remainingTime <= 0) {
    return "Expired";
  }
  
  const hours = Math.floor(remainingTime / (1000 * 60 * 60));
  const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
  
  return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Check if a service duration represents "forever"
 */
export function isForeverDuration(durationMinutes: number | null | undefined): boolean {
  return durationMinutes === null;
}