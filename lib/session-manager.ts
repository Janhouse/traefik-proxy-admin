import { db, sessions, Session } from "@/lib/db";
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
}

export const sessionManager = new SessionManager();