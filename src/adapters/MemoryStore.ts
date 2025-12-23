import { IStore } from "../interfaces/IStore";

interface MemoryRecord {
  value: string;
  userId: string; 
  expiresAt: number;
}

export class MemoryStore implements IStore {
  private store = new Map<string, MemoryRecord>();

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    
    // We try to parse the User ID from the payload to index it
    // Assumption: The payload has an 'id' or '_id' field.
    const parsed = JSON.parse(value);
    const userId = parsed.id || parsed._id || 'unknown';

    this.store.set(key, { value, expiresAt, userId });
  }

  async get(key: string): Promise<string | null> {
    const record = this.store.get(key);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return record.value;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async touch(key: string, ttlSeconds: number): Promise<void> {
    const record = this.store.get(key);
    if (record) {
      record.expiresAt = Date.now() + ttlSeconds * 1000;
      this.store.set(key, record);
    }
  }

  // --- NEW METHODS ---

  async findAllByUser(userId: string): Promise<string[]> {
    const sessions: string[] = [];
    
    // In a real database (SQL/Mongo), this is a query. 
    // In Map, we have to iterate (Slow, but fine for memory/dev).
    for (const [key, record] of this.store.entries()) {
      if (record.userId === String(userId)) {
        // cleanup expired ones while we are here
        if (Date.now() > record.expiresAt) {
          this.store.delete(key);
        } else {
          sessions.push(record.value);
        }
      }
    }
    return sessions;
  }

  async deleteByUser(userId: string): Promise<void> {
    for (const [key, record] of this.store.entries()) {
      if (record.userId === String(userId)) {
        this.store.delete(key);
      }
    }
  }
}