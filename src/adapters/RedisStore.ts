import { IStore } from '../interfaces/IStore';

// 1. Update the interface to include Set commands
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: any): Promise<any>;
  del(key: string): Promise<any>;
  expire(key: string, seconds: number): Promise<any>;
  
  // New commands for handling the User Index
  sAdd(key: string, value: string): Promise<any>;   // Add to Set
  sRem(key: string, value: string): Promise<any>;   // Remove from Set
  sMembers(key: string): Promise<string[]>;         // Get all members
  exists(key: string): Promise<number>;
}

export class RedisStore implements IStore {
  constructor(private client: RedisClient) {}

  /**
   * SAVE SESSION
   * We now do two things:
   * 1. Save the session data (Auto-expires).
   * 2. Add the SessionID to the User's "Index" (A Redis Set).
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, { EX: ttlSeconds });

    // Extract UserID to build the index
    // We assume the value is the JSON payload containing the user ID
    try {
      const payload = JSON.parse(value);
      const userId = payload.id || payload._id || payload.userId;
      
      if (userId) {
        // Add this session ID to the user's list of active sessions
        await this.client.sAdd(`idx:user:${userId}`, key);
        
        // Safety: Expire the index too (slightly longer than session) so we don't leak memory
        // if a user vanishes. 
        await this.client.expire(`idx:user:${userId}`, ttlSeconds + 3600);
      }
    } catch (e) { 
      // If parsing fails, we just don't index it.
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  /**
   * DELETE SESSION
   * We must remove the data AND the reference in the index.
   */
  async delete(key: string): Promise<void> {
    // 1. Get the data first to find the UserID (so we can clean the index)
    const data = await this.client.get(key);
    if (data) {
      const payload = JSON.parse(data);
      const userId = payload.id || payload._id || payload.userId;
      if (userId) {
        await this.client.sRem(`idx:user:${userId}`, key);
      }
    }
    
    // 2. Delete the actual session
    await this.client.del(key);
  }

  async touch(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
    // Note: We ideally should update the index expiry too, but strictly not required for MVP
  }

  /**
   * FIND ALL BY USER (The Dashboard Feature)
   * 1. Get all Session IDs from the Index Set.
   * 2. Loop through them and fetch the actual data.
   * 3. (Lazy Cleanup) If a session expired, remove it from the index.
   */
  async findAllByUser(userId: string): Promise<string[]> {
    const indexKey = `idx:user:${userId}`;
    const sessionIds = await this.client.sMembers(indexKey);
    
    const activeSessions: string[] = [];

    for (const sid of sessionIds) {
      const sessionData = await this.client.get(sid);
      
      if (sessionData) {
        activeSessions.push(sessionData);
      } else {
        // LAZY CLEANUP: Redis deleted the session (TTL), but it's still in our Set.
        // We clean it up now.
        await this.client.sRem(indexKey, sid);
      }
    }

    return activeSessions;
  }

  async deleteByUser(userId: string): Promise<void> {
    const indexKey = `idx:user:${userId}`;
    const sessionIds = await this.client.sMembers(indexKey);

    // Delete all session keys
    for (const sid of sessionIds) {
      await this.client.del(sid);
    }

    // Delete the index itself
    await this.client.del(indexKey);
  }
}