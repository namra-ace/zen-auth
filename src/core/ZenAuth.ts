import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import { IStore } from '../interfaces/IStore';

export interface ZenAuthOptions {
  secret: string;           
  store: IStore;            
  sessionDuration: number;  
  tokenDuration: string;    
  smtp?: any;               
}

export class ZenAuth {
  private mailer: any;

  constructor(private options: ZenAuthOptions) {
    if (this.options.smtp) {
      this.mailer = nodemailer.createTransport(this.options.smtp);
    }
  }

  // ==========================================
  // CORE AUTHENTICATION LOGIC
  // ==========================================

  /**
   * LOGIN: Creates a session with Device Metadata
   * @param payload - The user data (must include 'id' or '_id')
   * @param req - Optional Express Request object to capture IP/User-Agent
   */
  async login(payload: any, req?: any) {
    const sessionId = uuidv4();
    
    // 1. Capture Device Info (The "System Design" Feature)
    const deviceInfo = {
      ip: req?.ip || req?.socket?.remoteAddress || 'unknown',
      userAgent: req?.headers?.['user-agent'] || 'unknown',
      loginAt: new Date().toISOString()
    };

    // 2. Merge Metadata with User Payload
    // We store metadata in a reserved field '_meta'
    const fullPayload = {
      ...payload,
      _meta: deviceInfo 
    };

    // 3. Save to Store
    await this.options.store.set(
      sessionId, 
      JSON.stringify(fullPayload), 
      this.options.sessionDuration
    );

    // 4. Generate Token
    const token = this.signToken(sessionId, fullPayload);

    return { token, sessionId };
  }

  /**
   * AUTHORIZE: Validates token AND slides the session window.
   * Handles "Graceful Expiration" (allows expired token if session is valid).
   */
  async authorize(token: string) {
    try {
      const decoded: any = jwt.verify(token, this.options.secret);
      return await this.validateSession(decoded.sessionId);

    } catch (err: any) {
      // RESUME FEATURE: Handle "Graceful Expiration"
      if (err.name === 'TokenExpiredError') {
        const decoded: any = jwt.decode(token);
        
        if (!decoded || !decoded.sessionId) {
          return { valid: false, error: 'Invalid Token Structure' };
        }

        // Check if the DB Session is still alive
        return await this.validateSession(decoded.sessionId);
      }

      return { valid: false, error: err.message };
    }
  }

  /**
   * Helper to check DB and Slide the Window
   */
  private async validateSession(sessionId: string) {
    const sessionData = await this.options.store.get(sessionId);

    if (!sessionData) {
      return { valid: false, error: 'Session expired in database' };
    }

    await this.options.store.touch(sessionId, this.options.sessionDuration);

    return { 
      valid: true, 
      sessionId: sessionId, 
      user: JSON.parse(sessionData) 
    };
  }

  signToken(sessionId: string, payload: any) {
    return jwt.sign(
      { sessionId, ...payload }, 
      this.options.secret, 
      { expiresIn: this.options.tokenDuration as any }
    );
  }
  
  async logout(sessionId: string) {
    await this.options.store.delete(sessionId);
  }

  // ==========================================
  // DASHBOARD & DEVICE MANAGEMENT
  // ==========================================

  /**
   * Get all active devices for a user.
   */
  async getActiveSessions(userId: string) {
    const sessions = await this.options.store.findAllByUser(userId);
    
    return sessions.map(s => {
      const data = JSON.parse(s);
      return {
        sessionId: 'hidden', // Don't leak IDs to frontend
        device: data._meta || { ip: 'unknown', userAgent: 'unknown' },
        loginAt: data._meta?.loginAt,
        user: data // User data
      };
    });
  }

  /**
   * "Log me out of everywhere"
   */
  async logoutAll(userId: string) {
    await this.options.store.deleteByUser(userId);
  }

  // ==========================================
  // EMAIL VERIFICATION LOGIC
  // ==========================================

  async sendOTP(email: string) {
    if (!this.mailer) throw new Error('SMTP config not provided');

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Save to Store (TTL: 10 mins)
    await this.options.store.set(`otp:${email}`, code, 600);

    await this.mailer.sendMail({
      from: '"ZenAuth Security" <no-reply@zenauth.com>',
      to: email,
      subject: 'Your Verification Code',
      html: `<h1>${code}</h1><p>Expires in 10 minutes.</p>`
    });

    return { success: true };
  }

  async verifyOTP(email: string, code: string) {
    const key = `otp:${email}`;
    const storedCode = await this.options.store.get(key);

    if (!storedCode) return { valid: false, error: 'Code expired or invalid' };
    if (storedCode !== code) return { valid: false, error: 'Incorrect code' };

    await this.options.store.delete(key);
    return { valid: true };
  }
}