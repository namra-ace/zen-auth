# 🛡️ AceAuth

> **Stateful security. Stateless speed.**  
> A production-grade authentication engine that combines JWT performance with server-side control using a hybrid, cache-aware architecture.

[![NPM Version](https://img.shields.io/npm/v/ace-auth?style=flat-square)](https://www.npmjs.com/package/ace-auth)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue?style=flat-square)
![Tests](https://img.shields.io/badge/Tests-100%25_Passing-green?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-purple?style=flat-square)

---

## 💡 Why AceAuth?

Most authentication systems force a trade-off:

- **Stateless JWTs** → Fast, scalable, but impossible to revoke  
- **Server sessions** → Secure and controllable, but harder to scale  

**AceAuth removes this trade-off.**

AceAuth uses:
- **JWTs as identifiers (not authority)**
- **A database as the source of truth**
- **A two-tier cache (RAM + DB) for performance**

This allows AceAuth to provide:
- Immediate revocation
- Transparent token rotation
- High throughput on hot paths
- Explicit, documented trade-offs

---

## 🧠 Architecture Overview

```
Client
  ↓
JWT (sessionId only)
  ↓
L1 Cache (RAM, short TTL)
  ↓
L2 Store (Redis / SQL / Mongo)
```

- **Hot path**: Served entirely from RAM  
- **Cold path**: Falls back to database  
- **Writes**: Throttled to avoid load amplification  

Bounded inconsistency window: **≤ cacheTTL (default: 2 seconds)**

---

## 📦 Installation

```bash
npm install ace-auth
```

---

## 🚀 Quick Start

### 1️⃣ Initialize AceAuth

AceAuth is storage-agnostic. You can plug in any supported database adapter.

```ts
import { AceAuth } from 'ace-auth';

const auth = new AceAuth({
  secret: process.env.JWT_SECRET!,
  store: yourStore,
  sessionDuration: 30 * 24 * 60 * 60, // 30 days
  tokenDuration: '15m',
  cacheTTL: 2000
});
```

---

## 🔐 Authentication Flow

### Login

```ts
const { token, sessionId } = await auth.login(
  { id: user.id, role: 'user' },
  req
);
```

- Creates a session in the database
- Stores session in L1 cache
- Issues a short-lived JWT (identifier only)

---

### Protect Routes (Middleware)

```ts
import { gatekeeper } from 'ace-auth/middleware';

app.get('/profile', gatekeeper(auth), (req, res) => {
  res.json({ user: req.user });
});
```

If a token expires but the session is valid, AceAuth **automatically rotates it** and returns a new token via:

```
X-Ace-Token: <new-token>
```

---

## 🔌 Database Adapters (Full Implementations)

AceAuth works with any persistent store implementing `IStore`.

---

## 🟥 Redis Adapter (Recommended)

### When to use
- High traffic APIs
- Real-time systems
- Horizontally scaled services

### Setup

```ts
import { createClient } from 'redis';
import { RedisStore } from 'ace-auth/adapters';

const redis = createClient();
await redis.connect();

const store = new RedisStore(redis);
```

### How it works
- Sessions stored as `sessionId → payload`
- Secondary index: `userId → set(sessionIds)`
- TTL enforced by Redis
- O(1) lookup for session revocation

---

## 🟦 PostgreSQL Adapter

### When to use
- Strong consistency requirements
- Existing SQL infrastructure
- Auditable session history

### Schema

```sql
CREATE TABLE auth_sessions (
  sid TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sess JSONB NOT NULL,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_auth_sessions_user
ON auth_sessions(user_id);
```

### Setup

```ts
import { Pool } from 'pg';
import { PostgresStore } from 'ace-auth/adapters';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const store = new PostgresStore(pool, 'auth_sessions');
```

### Notes
- Expired sessions are lazily cleaned
- Indexed by `user_id` for fast logout-all
- Suitable for compliance-heavy systems

---

## 🟩 MongoDB Adapter

### When to use
- Document-based stacks
- Rapid prototyping
- Flexible schemas

### Schema (Example)

```js
{
  _id: sessionId,
  userId: "user_123",
  sess: { ... },
  expiresAt: ISODate()
}
```

### Setup

```ts
import mongoose from 'mongoose';
import { MongoStore } from 'ace-auth/adapters';

await mongoose.connect(process.env.MONGO_URL);

const store = new MongoStore(
  mongoose.connection.collection('auth_sessions')
);
```

### Notes
- TTL index recommended on `expiresAt`
- Simple setup, no migrations required

---

## 📱 Device & Session Management

```ts
// List active sessions
const sessions = await auth.getActiveSessions(userId);

// Logout everywhere
await auth.logoutAll(userId);
```

- Device info captured at login
- Bounded cache delay ≤ cacheTTL
- Redis/DB is always source of truth

---

## 📧 Passwordless OTP (Email)

```ts
await auth.sendOTP(email);
await auth.verifyOTP(email, code);
```

- OTPs are single-use
- Auto-expire (10 minutes)
- Stored server-side only

---

## 📊 Benchmarks

AceAuth is benchmarked against:
- Raw JWT
- Passport.js
- express-session

Results show AceAuth:
- Outperforms Passport.js on hot paths
- Retains server-side revocation
- Trades minimal latency for correctness

See **BENCHMARKS.md** for full data.

---

## 🔐 Security Guarantees

- Server-side revocation
- Token rotation handled internally
- JWT payloads contain no user data
- Bounded cache staleness (explicit)
- Write throttling prevents DB overload

---

## ❓ When to Use AceAuth

Use AceAuth if you need:
- JWT-like scalability
- Immediate logout across devices
- Transparent refresh UX
- Measured, explainable behavior

Avoid if you want:
- Pure stateless JWT only
- Cookie-only sessions
- OAuth / SSO (out of scope)

---

## 📄 License

MIT
