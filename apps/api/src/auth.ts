import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DB } from './db';
import { config } from './config';
import { AppError } from './errors';
const COOKIE = config.NODE_ENV === 'production' ? '__Host-oquplay' : 'oquplay_session';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export function nativeRequest(req: FastifyRequest) { return req.headers['x-oquplay-client'] === 'native' && !req.headers.origin; }
export function rawToken(req: FastifyRequest) {
 const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
 return nativeRequest(req) ? bearer : req.cookies[COOKIE];
}
export async function sessionFor(db: DB, req: FastifyRequest) {
 const token = rawToken(req); if (!token || token.length > 100) return null;
 const session = await db.authSession.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
 return session && session.expiresAt > new Date() ? session : null;
}
export async function requireSession(db: DB, req: FastifyRequest) { const s = await sessionFor(db, req); if (!s) throw new AppError('session_required', 401); return s; }
export async function requireUser(db: DB, req: FastifyRequest) { const s = await requireSession(db, req); if (!s.user) throw new AppError('login_required', 401); return s.user; }
export function publicUser(user: { id: string; email: string; name: string; role: string } | null) { return user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null; }
export async function newSession(db: DB, req: FastifyRequest, reply: FastifyReply, userId?: string) {
 const token = randomBytes(32).toString('base64url'), expiresAt = new Date(Date.now() + 7 * 86400000);
 const session = await db.authSession.create({ data: { tokenHash: hash(token), userId, expiresAt }, include: { user: true } });
 if (!nativeRequest(req)) reply.setCookie(COOKIE, token, { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: expiresAt });
 return { user: publicUser(session.user), ...(nativeRequest(req) ? { token } : {}) };
}
export async function revokeSession(db: DB, req: FastifyRequest, reply: FastifyReply) {
 const token = rawToken(req);
 if (token) await db.authSession.updateMany({ where: { tokenHash: hash(token) }, data: { expiresAt: new Date(0) } });
 reply.clearCookie(COOKIE, { path: '/', secure: config.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax' });
}
