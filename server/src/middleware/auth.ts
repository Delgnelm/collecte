import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { bootstrapPlatform } from '../lib/campaign.js';
import { prisma } from '../lib/prisma.js';
import { HttpError } from './errorHandler.js';

export type UserRole = 'SUPERADMIN' | 'TENANT_ADMIN';

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  email: string;
  fullName: string;
  tenantId: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
  admin?: AuthTokenPayload;
}

export interface AuthenticatedUserView {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthenticatedUserView | null> {
  const normalizedEmail = email.trim().toLowerCase();

  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      tenant: {
        select: { id: true, name: true, slug: true, isActive: true },
      },
    },
  });

  if (!user && normalizedEmail === env.SUPERADMIN_EMAIL) {
    await bootstrapPlatform();
    user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, isActive: true },
        },
      },
    });
  }

  if (!user || !user.isActive) {
    return null;
  }

  const role = user.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'TENANT_ADMIN';
  if (role === 'TENANT_ADMIN' && (!user.tenantId || !user.tenant || !user.tenant.isActive)) {
    return null;
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role,
    tenantId: user.tenantId,
    tenantName: user.tenant?.name ?? null,
    tenantSlug: user.tenant?.slug ?? null,
  };
}

export function signAuthToken(user: AuthenticatedUserView): string {
  const payload: AuthTokenPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
    tenantId: user.tenantId,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '12h' });
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentification administrateur requise.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Jeton d’authentification manquant.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    if (decoded.role !== 'SUPERADMIN' && decoded.role !== 'TENANT_ADMIN') {
      res.status(403).json({ error: 'Accès refusé.' });
      return;
    }
    req.user = decoded;
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée ou jeton invalide. Veuillez vous reconnecter.' });
  }
}

export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== 'SUPERADMIN') {
    res.status(403).json({ error: 'Accès réservé au SuperAdmin.' });
    return;
  }
  next();
}

export async function resolveActiveTenant(req: AuthenticatedRequest) {
  const user = req.user;
  if (!user) {
    throw new HttpError(401, 'Authentification requise.');
  }

  if (user.role === 'TENANT_ADMIN') {
    if (!user.tenantId) {
      throw new HttpError(403, 'Aucun tenant associé à ce compte.');
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
    });
    if (!tenant || !tenant.isActive) {
      throw new HttpError(403, 'Ce tenant est désactivé ou introuvable.');
    }
    return tenant;
  }

  // SUPERADMIN : peut cibler n'importe quel tenant via X-Tenant-Id ou ?tenantId=
  const requestedTenantId =
    (typeof req.headers['x-tenant-id'] === 'string' && req.headers['x-tenant-id'].trim()) ||
    (typeof req.query.tenantId === 'string' && req.query.tenantId.trim()) ||
    null;

  if (requestedTenantId) {
    const target = await prisma.tenant.findUnique({
      where: { id: requestedTenantId },
    });
    if (!target) {
      throw new HttpError(404, 'Tenant sélectionné introuvable.');
    }
    return target;
  }

  const firstActive = await prisma.tenant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (firstActive) {
    return firstActive;
  }

  const firstAny = await prisma.tenant.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (firstAny) {
    return firstAny;
  }

  const { tenant } = await bootstrapPlatform();
  return tenant;
}
