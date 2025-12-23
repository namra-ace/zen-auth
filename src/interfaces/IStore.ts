// src/interfaces/IStore.ts

export interface IStore {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  touch(key: string, ttlSeconds: number): Promise<void>;

  /** * NEW: Find all sessions for a specific user.
   * This allows building the "Active Devices" dashboard.
   */
  findAllByUser(userId: string): Promise<string[]>;
  
  /**
   * NEW: "Logout All Devices"
   * Deletes all sessions for a specific user ID.
   */
  deleteByUser(userId: string): Promise<void>;
}