/**
 * Utility functions for duration calculations and formatting
 */

/**
 * Calculate the expiry time for a service
 */
function calculateExpiryTime(
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