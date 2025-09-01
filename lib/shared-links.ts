import { db, sharedLinks, SharedLink } from "@/lib/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export function generateShareToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSharedLink(
  serviceId: string,
  expiresAt: Date,
  sessionDurationMinutes: number = 60
): Promise<SharedLink> {
  const token = generateShareToken();
  
  const [sharedLink] = await db
    .insert(sharedLinks)
    .values({
      serviceId,
      token,
      expiresAt,
      sessionDurationMinutes,
    })
    .returning();
  
  return sharedLink;
}

export async function getSharedLink(token: string): Promise<SharedLink | null> {
  const [sharedLink] = await db
    .select()
    .from(sharedLinks)
    .where(eq(sharedLinks.token, token));
  
  if (!sharedLink) return null;
  
  // Check if link is expired
  if (sharedLink.expiresAt < new Date()) {
    return null;
  }
  
  return sharedLink;
}

export async function consumeSharedLink(token: string): Promise<SharedLink | null> {
  const sharedLink = await getSharedLink(token);
  
  if (!sharedLink || sharedLink.isUsed) {
    return null;
  }
  
  // Mark as used
  const [updatedLink] = await db
    .update(sharedLinks)
    .set({
      isUsed: true,
      usedAt: new Date(),
    })
    .where(eq(sharedLinks.token, token))
    .returning();
  
  return updatedLink;
}