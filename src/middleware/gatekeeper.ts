import { ZenAuth } from '../core/ZenAuth';

// We define a simple interface for the Request to avoid installing 'express' types
// as a hard dependency (keeps the library lightweight).
interface Request {
  headers: any;
  user?: any;
  sessionId?: string;
}

export function gatekeeper(auth: ZenAuth) {
  return async (req: Request, res: any, next: any) => {
    try {
      // 1. Extract Token
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1]; // Remove "Bearer "
      if (!token) {
        return res.status(401).json({ error: 'Invalid token format' });
      }

      // 2. Verify & Slide Session
      const result = await auth.authorize(token);

      if (!result.valid) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      // 3. Attach User to Request (for the route handler to use)
      if ('user' in result && 'sessionId' in result) {
        req.user = result.user;
        req.sessionId = result.sessionId;
      } else {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      // 4. AUTOMATIC ROTATION (The Resume "Wow" Factor)
      // We generate a brand new token for the *next* request.
      // This ensures that even if the current token is stolen, 
      // it's already "used" and the client has moved to a new one.
      const newToken = auth.signToken(result.sessionId, result.user);
      
      // We send it back in a custom header
      res.setHeader('X-Zen-Token', newToken);

      next();
    } catch (error) {
      console.error('Guard Middleware Error:', error);
      res.status(500).json({ error: 'Internal Auth Error' });
    }
  };
}