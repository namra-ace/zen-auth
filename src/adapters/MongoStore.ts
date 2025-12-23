import { IStore } from "../interfaces/IStore";

// We define a shape for what the Mongo Model looks like
// so TypeScript doesn't complain
interface MongoModel {
  findOne(query: any): any;
  updateOne(query: any, update: any, options?: any): any;
  deleteOne(query: any): any;
}

export class MongoStore implements IStore {
  private model: MongoModel;

  constructor(mongooseModel: any) {
    this.model = mongooseModel;
  }
    async findAllByUser(userId: string): Promise<string[]> {
        const docs = await this.model.findOne({ userId });
        if (!docs) return [];
        return docs.map((doc: any) => doc.data);
    }

    async deleteByUser(userId: string): Promise<void> {
        await this.model.deleteOne({ userId });
    }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    
    // Upsert: Update if exists, Insert if new
    await this.model.updateOne(
      { _id: key },
      { _id: key, data: value, expiresAt },
      { upsert: true }
    );
  }

  async get(key: string): Promise<string | null> {
    const doc = await this.model.findOne({ _id: key });

    if (!doc) return null;

    // MongoDB TTL indexes usually handle cleanup, but we double-check here
    if (new Date() > doc.expiresAt) {
      return null;
    }

    return doc.data;
  }

  async delete(key: string): Promise<void> {
    await this.model.deleteOne({ _id: key });
  }

  async touch(key: string, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    // The "Slide": Just update the date
    await this.model.updateOne(
      { _id: key },
      { $set: { expiresAt } }
    );
  }
}