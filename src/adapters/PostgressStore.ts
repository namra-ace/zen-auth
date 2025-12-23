import { IStore } from '../interfaces/IStore';

/**
 * SQL SCHEMA REQUIREMENT:
 * * CREATE TABLE auth_sessions (
 * sid VARCHAR(255) PRIMARY KEY,
 * sess JSON NOT NULL,
 * expired_at TIMESTAMPTZ NOT NULL
 * );
 * * CREATE INDEX idx_auth_sessions_expired_at ON auth_sessions(expired_at);
 */

interface PgPool {
  query(text: string, params?: any[]): Promise<any>;
}

export class PostgresStore implements IStore {
  // Allow user to customize table name
  constructor(private pool: PgPool, private tableName: string = 'auth_sessions') {}
    async findAllByUser(userId: string): Promise<string[]> {
        const query = `
            SELECT sess FROM ${this.tableName}
            WHERE sess->>'userId' = $1 AND expired_at > NOW()
        `;

        const result = await this.pool.query(query, [userId]);

        // Extract sessions and return them as an array of strings
        return result.rows.map((row: any) => {
            const data = row.sess;
            return typeof data === 'string' ? data : JSON.stringify(data);
        });
    }

    async deleteByUser(userId: string): Promise<void> {
        const query = `
            DELETE FROM ${this.tableName}
            WHERE sess->>'userId' = $1
        `;

        await this.pool.query(query, [userId]);
    }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    
    // We use ON CONFLICT to handle "Upserts" (Update if exists, Insert if new)
    const query = `
      INSERT INTO ${this.tableName} (sid, sess, expired_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (sid) 
      DO UPDATE SET sess = $2, expired_at = $3
    `;

    await this.pool.query(query, [key, value, expiresAt]);
  }

  async get(key: string): Promise<string | null> {
    // We perform a "Lazy Delete" check here.
    // Even if the row exists, if it's expired, we treat it as null.
    const query = `
      SELECT sess FROM ${this.tableName} 
      WHERE sid = $1 AND expired_at > NOW()
    `;

    const result = await this.pool.query(query, [key]);
    
    if (result.rows && result.rows.length > 0) {
      // Postgres returns JSON columns as objects, but our interface expects a string
      // so we might need to stringify it back, or just return the data depending on implementation.
      // Since ZenAuth expects a stringified payload:
      const data = result.rows[0].sess;
      return typeof data === 'string' ? data : JSON.stringify(data);
    }

    return null;
  }

  async delete(key: string): Promise<void> {
    const query = `DELETE FROM ${this.tableName} WHERE sid = $1`;
    await this.pool.query(query, [key]);
  }

  async touch(key: string, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    
    // Just update the timestamp to keep the session alive
    const query = `
      UPDATE ${this.tableName} 
      SET expired_at = $1 
      WHERE sid = $2
    `;

    await this.pool.query(query, [expiresAt, key]);
  }
}