import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(__dirname, '../../../.env');

if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

export type GeocodingProviderName = 'photon' | 'mapbox' | 'google';

function parseProvider(value: string | undefined): GeocodingProviderName {
  if (value === 'mapbox' || value === 'google') {
    return value;
  }
  return 'photon';
}

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET || 'dev-insecure-secret-change-me-in-production-32chars';

if (nodeEnv === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('change-me'))) {
  throw new Error(
    'CONFIGURATION INVALIDE : JWT_SECRET doit être défini avec au moins 32 caractères aléatoires en production.'
  );
}

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT || 4000),
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  APP_BASE_URL: (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  JWT_SECRET: jwtSecret,
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'admin@ecole.local').trim().toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'ChangeMe2026!',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH?.trim() || '',
  GEOCODING_PROVIDER: parseProvider(process.env.GEOCODING_PROVIDER),
  PHOTON_BASE_URL: (process.env.PHOTON_BASE_URL || 'https://photon.komoot.io').replace(/\/+$/, ''),
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN?.trim() || '',
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY?.trim() || '',
  SMTP_HOST: process.env.SMTP_HOST?.trim() || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER?.trim() || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME?.trim() || 'Collecte École',
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL?.trim() || 'collecte@ecole.local',
  SMTP_DRY_RUN: process.env.SMTP_DRY_RUN !== 'false',
  DISABLE_RATE_LIMIT: process.env.DISABLE_RATE_LIMIT === 'true',
} as const;
