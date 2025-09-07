import { db, sessions, services, Session } from "@/lib/db";
import { eq, gt, lt } from "drizzle-orm";

class SessionManager {
  private memoryCache = new Map<string, Session>();
  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    
    await this.loadActiveSessions();
    this.initialized = true;
    
    // Clean up expired sessions every 5 minutes
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  private async loadActiveSessions() {
    const activeSessions = await db
      .select()
      .from(sessions)
      .where(gt(sessions.expiresAt, new Date()));
    
    for (const session of activeSessions) {
      this.memoryCache.set(session.sessionToken, session);
    }
  }

  async createSession(
    serviceId: string,
    sessionToken: string,
    expiresAt: Date,
    sharedLinkId?: string,
    userIdentifier?: string
  ): Promise<Session> {
    const newSession = {
      serviceId,
      sessionToken,
      expiresAt,
      sharedLinkId,
      userIdentifier,
      lastAccessedAt: new Date(),
    };

    const [session] = await db.insert(sessions).values(newSession).returning();
    this.memoryCache.set(sessionToken, session);
    
    return session;
  }

  async getSession(sessionToken: string): Promise<Session | null> {
    await this.initialize();
    
    const session = this.memoryCache.get(sessionToken);
    if (!session) return null;
    
    // Check if session is expired
    if (session.expiresAt < new Date()) {
      await this.deleteSession(sessionToken);
      return null;
    }
    
    // Update last accessed time
    session.lastAccessedAt = new Date();
    await db
      .update(sessions)
      .set({ lastAccessedAt: new Date() })
      .where(eq(sessions.sessionToken, sessionToken));
    
    return session;
  }

  async extendSession(sessionToken: string, newExpiresAt: Date): Promise<boolean> {
    await this.initialize();
    
    const session = this.memoryCache.get(sessionToken);
    if (!session) return false;
    
    // Update expiration time in memory cache
    session.expiresAt = newExpiresAt;
    session.lastAccessedAt = new Date();
    
    // Update in database
    await db
      .update(sessions)
      .set({ 
        expiresAt: newExpiresAt,
        lastAccessedAt: new Date()
      })
      .where(eq(sessions.sessionToken, sessionToken));
    
    return true;
  }

  async deleteSession(sessionToken: string): Promise<void> {
    this.memoryCache.delete(sessionToken);
    await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken));
  }

  async deleteSessionsByService(serviceId: string): Promise<void> {
    // Remove from memory cache
    for (const [token, session] of this.memoryCache.entries()) {
      if (session.serviceId === serviceId) {
        this.memoryCache.delete(token);
      }
    }
    
    // Remove from database
    await db.delete(sessions).where(eq(sessions.serviceId, serviceId));
  }

  private async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    
    // Remove from memory cache
    for (const [token, session] of this.memoryCache.entries()) {
      if (session.expiresAt < now) {
        this.memoryCache.delete(token);
      }
    }
    
    // Remove from database
    await db.delete(sessions).where(lt(sessions.expiresAt, now));
  }

  getActiveSessions(): Session[] {
    return Array.from(this.memoryCache.values());
  }

  getSessionsByService(serviceId: string): Session[] {
    return Array.from(this.memoryCache.values()).filter(
      session => session.serviceId === serviceId
    );
  }

  async createSessionWithOptimalCookieExpiry(
    serviceId: string,
    sessionToken: string,
    sessionDurationMinutes: number,
    sharedLinkId?: string,
    userIdentifier?: string
  ): Promise<{ session: Session; cookieExpiresAt: Date }> {
    console.log("🔧 [DEBUG] createSessionWithOptimalCookieExpiry called with:", {
      serviceId,
      sessionDurationMinutes,
      sharedLinkId,
      userIdentifier
    });

    // Get service details to determine auto duration
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, serviceId));
    
    if (!service) {
      console.error("🔧 [DEBUG] Service not found for ID:", serviceId);
      throw new Error("Service not found");
    }

    console.log("🔧 [DEBUG] Service details:", {
      id: service.id,
      name: service.name,
      enableDurationMinutes: service.enableDurationMinutes,
      enabledAt: service.enabledAt?.toISOString()
    });

    // Calculate session expiration based on service auto-disable time
    let sessionExpiresAt: Date;
    let cookieExpiresAt: Date;
    
    if (service.enableDurationMinutes === null || service.enableDurationMinutes === undefined) {
      // Infinite auto duration - session and cookie last 90 days
      sessionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      cookieExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      console.log("🔧 [DEBUG] Infinite auto duration - session and cookie expire in 90 days:", sessionExpiresAt.toISOString());
    } else {
      // Finite auto duration - session and cookie expire when service auto-disables
      const serviceAutoDisableAt = new Date(
        service.enabledAt!.getTime() + service.enableDurationMinutes * 60 * 1000
      );
      sessionExpiresAt = serviceAutoDisableAt;
      cookieExpiresAt = serviceAutoDisableAt;
      console.log("🔧 [DEBUG] Service auto-disable at:", serviceAutoDisableAt.toISOString());
      console.log("🔧 [DEBUG] Session and cookie expire when service disables:", sessionExpiresAt.toISOString());
    }

    // Create the session with the calculated expiration
    const session = await this.createSession(
      serviceId,
      sessionToken,
      sessionExpiresAt,
      sharedLinkId,
      userIdentifier
    );

    console.log("🔧 [DEBUG] Final session expiration:", session.expiresAt.toISOString());
    console.log("🔧 [DEBUG] Final cookie expiration:", cookieExpiresAt.toISOString());
    return { session, cookieExpiresAt };
  }

  async calculateOptimalCookieExpiry(
    serviceId: string,
    sessionExpiresAt: Date
  ): Promise<Date> {
    console.log("🔧 [DEBUG] calculateOptimalCookieExpiry called with:", {
      serviceId,
      sessionExpiresAt: sessionExpiresAt.toISOString()
    });

    // Get service details to determine auto duration
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, serviceId));
    
    if (!service) {
      console.error("🔧 [DEBUG] Service not found for ID:", serviceId);
      return sessionExpiresAt; // Fallback to session expiration
    }

    console.log("🔧 [DEBUG] Service details:", {
      id: service.id,
      name: service.name,
      enableDurationMinutes: service.enableDurationMinutes,
      enabledAt: service.enabledAt?.toISOString()
    });

    let cookieExpiresAt: Date;
    if (service.enableDurationMinutes === null || service.enableDurationMinutes === undefined) {
      // Infinite auto duration - set cookie to 90 days for security
      cookieExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      console.log("🔧 [DEBUG] Infinite auto duration - cookie expires in 90 days:", cookieExpiresAt.toISOString());
    } else {
      // Finite auto duration - set cookie to when service will be auto-disabled
      const serviceAutoDisableAt = new Date(
        service.enabledAt!.getTime() + service.enableDurationMinutes * 60 * 1000
      );
      console.log("🔧 [DEBUG] Service auto-disable at:", serviceAutoDisableAt.toISOString());
      
      // Use service auto-disable time - cookie should last until service is disabled
      cookieExpiresAt = serviceAutoDisableAt;
      console.log("🔧 [DEBUG] Using service auto-disable time - cookie expires at:", cookieExpiresAt.toISOString());
    }

    console.log("🔧 [DEBUG] Final optimal cookie expiration:", cookieExpiresAt.toISOString());
    return cookieExpiresAt;
  }
}

export const sessionManager = new SessionManager();