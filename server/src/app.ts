import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { adminRouter } from './routes/admin.js';
import { fieldRouter } from './routes/field.js';
import { geocodeRouter } from './routes/geocode.js';
import { healthRouter } from './routes/health.js';
import { publicRouter } from './routes/public.js';
import { superadminRouter } from './routes/superadmin.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origine CORS non autorisée : ${origin}`));
      },
      credentials: false,
    })
  );

  app.use(express.json({ limit: '1mb' }));

  app.use('/api', healthRouter);
  app.use('/api/geocode', geocodeRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/field', fieldRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/superadmin', superadminRouter);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Endpoint API introuvable.' });
  });

  app.use(errorHandler);

  return app;
}
