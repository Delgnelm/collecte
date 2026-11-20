import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { formatZodError } from './validate.js';

export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'HttpError';
  }
}

interface PrismaKnownErrorLike {
  code?: string;
  message?: string;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation échouée.',
      details: formatZodError(err),
    });
    return;
  }

  const prismaErr = err as PrismaKnownErrorLike;
  if (prismaErr && typeof prismaErr === 'object' && typeof prismaErr.code === 'string') {
    if (prismaErr.code === 'P2025') {
      res.status(404).json({ error: 'Ressource introuvable.' });
      return;
    }
    if (prismaErr.code === 'P2002') {
      res.status(409).json({ error: 'Conflit : une ressource identique existe déjà.' });
      return;
    }
    if (prismaErr.code === 'P2003') {
      res.status(400).json({ error: 'Référence invalide vers une ressource liée.' });
      return;
    }
  }

  console.error('[API ERROR]', err);
  const message =
    env.NODE_ENV === 'production'
      ? 'Erreur interne du serveur.'
      : err instanceof Error
        ? err.message
        : 'Erreur interne du serveur.';

  res.status(500).json({ error: message });
}
