import type { Express, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { getPool } from './db.ts';

export type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    employeeId: string;
    role: string;
  };
};

const loginSchema = z.object({
  employeeId: z.string().trim().min(3),
  password: z.string().min(5),
  rememberMe: z.boolean().optional(),
});

const registerSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(2),
  employeeId: z.string().trim().min(3),
  email: z.string().trim().email(),
  role: z.string().trim().min(2),
  designation: z.string().trim().optional().default('Employee'),
  status: z.string().trim().optional().default('Active'),
  createdDate: z.string().trim().optional().default(new Date().toISOString()),
  password: z.string().min(5),
  mustChangePassword: z.boolean().optional().default(false),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(5),
  newPassword: z.string().min(6),
});

interface SessionRecord {
  token: string;
  userId: string;
  employeeId: string;
  role: string;
  expiresAt: number;
  rememberMe: boolean;
}

const sessions = new Map<string, SessionRecord>();
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 8);
const REMEMBER_ME_TTL_MS = Number(process.env.REMEMBER_ME_TTL_MS || 1000 * 60 * 60 * 24 * 30);
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'leadflow-dev-secret-change-me');

function sanitizeValue(value: string) {
  return value.replace(/[<>]/g, '').trim();
}

function normalizeRole(role?: string) {
  return String(role || 'RO').toUpperCase();
}

function base64UrlEncode(value: string | Buffer) {
  const encoded = Buffer.isBuffer(value) ? value.toString('base64') : Buffer.from(value).toString('base64');
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createJwt(payload: Record<string, unknown>, expiresInMs: number) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured in production.');
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor((Date.now() + expiresInMs) / 1000) }));
  const signature = base64UrlEncode(createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string) {
  if (!JWT_SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expectedSignature = base64UrlEncode(createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest());
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof decoded.exp === 'number' && decoded.exp * 1000 <= Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function getToken(req: Request) {
  const authHeader = req.get('authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1];
  }
  return req.get('x-session-token') || '';
}

function setSession(session: SessionRecord) {
  sessions.set(session.token, session);
}

function destroySession(token: string) {
  sessions.delete(token);
}

function isBcryptHash(value: string) {
  return /^\$2[aby]\$\d{2}\$/.test(value || '');
}

export async function hashPassword(password: string) {
  if (!password) return '';
  if (isBcryptHash(password)) return password;
  return bcrypt.hash(password, 12);
}

export async function normalizePasswordForStorage(password?: string | null, existingHash?: string | null) {
  if (password === undefined || password === null) return existingHash || null;
  const trimmed = String(password).trim();
  if (!trimmed) return existingHash || null;
  if (isBcryptHash(trimmed)) return trimmed;
  return bcrypt.hash(trimmed, 12);
}

export async function verifyPassword(password: string, hash: string) {
  if (!hash) return false;
  if (!isBcryptHash(hash)) {
    return hash === password;
  }
  return bcrypt.compare(password, hash);
}

export function toSafeUser(row: Record<string, any>) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    name: row.name,
    email: row.email,
    role: row.role,
    designation: row.designation,
    status: row.status,
    createdDate: row.created_date,
    teamId: row.team_id || '',
    mustChangePassword: !!row.must_change_password,
  };
}

export async function authenticateRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const path = req.path;
  const isPublicPath = path === '/api/auth/login' || path === '/api/auth/register' || path === '/api/db-status' || path === '/api/users/check-admin';

  if (isPublicPath || req.method === 'OPTIONS') {
    return next();
  }

  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const jwtPayload = verifyJwt(token);
  if (!jwtPayload) {
    destroySession(token);
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }

  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired.' });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: 'Database connection unavailable.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, employee_id, role, status, must_change_password FROM users WHERE id = $1 LIMIT 1',
      [String(jwtPayload.sub || session.userId)]
    );
    const user = result.rows[0];
    if (!user || String(user.status || '').toLowerCase() !== 'active') {
      destroySession(token);
      return res.status(401).json({ error: 'Account is unavailable.' });
    }

    req.user = { id: user.id, employeeId: user.employee_id, role: user.role || 'RO' };
    const passwordChangePath = path === '/api/auth/verify-password' || path === '/api/auth/logout' || path === '/api/auth/me';
    if (user.must_change_password && !passwordChangePath) {
      return res.status(403).json({ error: 'Password change is required before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    next();
  } catch (error) {
    console.error('Authentication lookup failed:', error);
    return res.status(503).json({ error: 'Authentication service unavailable.' });
  }
}

export function requireRole(allowedRoles: string | string[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userRole = normalizeRole(req.user?.role);
    if (!req.user || !roles.some((role) => normalizeRole(role) === userRole || userRole === 'ADMIN')) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    next();
  };
}

export function getActiveSessions() {
  return sessions;
}

export function registerAuthRoutes(app: Express) {
  app.post('/api/auth/login', async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid credentials payload.' });
      }

      const { employeeId, password, rememberMe } = parsed.data;
      const cleanEmployeeId = sanitizeValue(employeeId);
      const cleanPassword = sanitizeValue(password);
      const pool = getPool();
      if (!pool) {
        return res.status(503).json({ error: 'Database connection unavailable.' });
      }

      const result = await pool.query(
        'SELECT * FROM users WHERE LOWER(TRIM(employee_id)) = LOWER(TRIM($1)) OR LOWER(TRIM(id)) = LOWER(TRIM($1)) LIMIT 1',
        [cleanEmployeeId]
      );

      if (!result.rows.length) {
        return res.status(401).json({ error: 'Invalid employee ID or password.' });
      }

      const row = result.rows[0];
      if (String(row.status || '').toLowerCase() !== 'active') {
        return res.status(403).json({ error: 'This account is inactive.' });
      }
      const storedHash = row.password || '';
      let passwordMatches = await verifyPassword(cleanPassword, storedHash);

      if (!passwordMatches && !isBcryptHash(storedHash) && storedHash === cleanPassword) {
        passwordMatches = true;
      }

      if (!passwordMatches) {
        return res.status(401).json({ error: 'Invalid employee ID or password.' });
      }

      if (!isBcryptHash(storedHash) && storedHash === cleanPassword) {
        const migratedHash = await normalizePasswordForStorage(cleanPassword, storedHash);
        if (migratedHash && migratedHash !== storedHash) {
          await pool.query('UPDATE users SET password = $1 WHERE id = $2', [migratedHash, row.id]);
        }
      }

      const ttl = rememberMe ? REMEMBER_ME_TTL_MS : SESSION_TTL_MS;
      const token = createJwt({ sub: row.id, employeeId: row.employee_id, role: row.role || 'RO' }, ttl);
      const session: SessionRecord = {
        token,
        userId: row.id,
        employeeId: row.employee_id,
        role: row.role || 'RO',
        expiresAt: Date.now() + ttl,
        rememberMe: !!rememberMe,
      };
      setSession(session);

      const safeUser = {
        id: row.id,
        employeeId: row.employee_id,
        name: row.name,
        email: row.email,
        role: row.role,
        designation: row.designation,
        status: row.status,
        createdDate: row.created_date,
        teamId: row.team_id || '',
        mustChangePassword: !!row.must_change_password,
      };

      res.json({ success: true, token, user: safeUser });
    } catch (error: any) {
      console.error('Auth login failed:', error);
      res.status(500).json({ error: 'Login failed.' });
    }
  });

  app.post('/api/auth/register', async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid registration payload.' });
      }

      const payload = parsed.data;
      const pool = getPool();
      if (!pool) {
        return res.status(503).json({ error: 'Database connection unavailable.' });
      }

      // Registration exists solely for the initial administrator bootstrap. All
      // subsequent user creation is performed through the protected admin route.
      const existingUsers = await pool.query('SELECT 1 FROM users LIMIT 1');
      if (existingUsers.rowCount) {
        return res.status(403).json({ error: 'Initial administrator is already configured.' });
      }

      const hashedPassword = await normalizePasswordForStorage(payload.password);
      const query = `
        INSERT INTO users (id, name, employee_id, email, role, designation, status, created_date, password, must_change_password)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (employee_id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          designation = EXCLUDED.designation,
          status = EXCLUDED.status,
          created_date = EXCLUDED.created_date,
          password = EXCLUDED.password,
          must_change_password = EXCLUDED.must_change_password
        RETURNING *
      `;
      const values = [payload.id || `u_${Date.now()}`, sanitizeValue(payload.name), sanitizeValue(payload.employeeId).toUpperCase(), payload.email.toLowerCase(), 'ADMIN', 'Administrator', 'Active', payload.createdDate, hashedPassword, false];
      const result = await pool.query(query, values);
      const row = result.rows[0];
      res.status(201).json({ success: true, user: toSafeUser(row) });
    } catch (error: any) {
      console.error('Auth registration failed:', error);
      res.status(500).json({ error: 'User creation failed.' });
    }
  });

  app.get('/api/auth/me', authenticateRequest, (req: AuthenticatedRequest, res) => {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Not signed in.' });
    }
    const jwtPayload = verifyJwt(token);
    const session = sessions.get(token);
    if (!jwtPayload || !session || session.expiresAt <= Date.now()) {
      destroySession(token);
      return res.status(401).json({ error: 'Session expired.' });
    }
    res.json({ success: true, user: { id: session.userId, employeeId: session.employeeId, role: session.role } });
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    const token = getToken(req);
    if (token) {
      destroySession(token);
    }
    res.json({ success: true });
  });

  app.post('/api/auth/validate-password', authenticateRequest, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = z.object({ password: z.string().min(5) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid password payload.' });
      }

      const pool = getPool();
      if (!pool) {
        return res.status(503).json({ error: 'Database connection unavailable.' });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      const result = await pool.query('SELECT password FROM users WHERE id = $1 LIMIT 1', [userId]);
      if (!result.rows.length) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const storedHash = result.rows[0].password || '';
      const isValid = await verifyPassword(parsed.data.password, storedHash);
      res.json({ success: true, valid: isValid });
    } catch (error: any) {
      console.error('Password validation failed:', error);
      res.status(500).json({ error: 'Password validation failed.' });
    }
  });

  app.post('/api/auth/verify-password', authenticateRequest, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = passwordChangeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid password payload.' });
      }

      const pool = getPool();
      if (!pool) {
        return res.status(503).json({ error: 'Database connection unavailable.' });
      }

      const { currentPassword, newPassword } = parsed.data;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      const result = await pool.query('SELECT password FROM users WHERE id = $1 LIMIT 1', [userId]);
      if (!result.rows.length) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const storedHash = result.rows[0].password || '';
      const isCurrentPasswordValid = await verifyPassword(currentPassword, storedHash);
      if (!isCurrentPasswordValid) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      const hashedPassword = await hashPassword(newPassword);
      await pool.query('UPDATE users SET password = $1, must_change_password = FALSE WHERE id = $2', [hashedPassword, userId]);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Password change failed:', error);
      res.status(500).json({ error: 'Password update failed.' });
    }
  });
}
