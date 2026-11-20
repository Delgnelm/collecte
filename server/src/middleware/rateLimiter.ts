import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const shouldSkip = () => env.DISABLE_RATE_LIMIT || process.env.DISABLE_RATE_LIMIT === 'true';

export const publicSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  message: {
    error: 'Trop de soumissions effectuées depuis cette adresse IP. Veuillez réessayer dans 15 minutes.',
  },
});

export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  message: {
    error: 'Trop de tentatives de connexion administrateur. Veuillez patienter 15 minutes.',
  },
});

export const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  message: {
    error: 'Limite de requêtes de recherche d’adresse atteinte. Réessayez dans une minute.',
  },
});

export const fieldLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  message: {
    error: 'Trop de requêtes sur l’accès terrain. Veuillez patienter quelques instants.',
  },
});
