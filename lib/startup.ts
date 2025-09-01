import "server-only";
import { serviceScheduler } from "./service-scheduler";

let isInitialized = false;

export async function initializeServices() {
  if (isInitialized) {
    return;
  }

  console.log("Initializing application services...");
  
  try {
    // Start the service auto-disable scheduler
    await serviceScheduler.start();
    
    isInitialized = true;
    console.log("Application services initialized successfully");
  } catch (error) {
    console.error("Failed to initialize application services:", error);
  }
}

// Cleanup function for graceful shutdown
export function shutdownServices() {
  console.log("Shutting down application services...");
  
  serviceScheduler.stop();
  
  isInitialized = false;
  console.log("Application services shut down");
}

// Auto-initialize when this module is imported
if (typeof window === "undefined") { // Server-side only
  initializeServices();
}