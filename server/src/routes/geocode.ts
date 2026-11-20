import { Router } from 'express';
import { z } from 'zod';
import { geocodeLimiter } from '../middleware/rateLimiter.js';
import { searchAddresses, searchCities } from '../services/geocoding/index.js';

export const geocodeRouter = Router();

const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Saisissez au moins 2 caractères').max(120),
  lat: z.coerce.number().finite().min(-90).max(90).optional(),
  lng: z.coerce.number().finite().min(-180).max(180).optional(),
});

const cityQuerySchema = z.object({
  q: z.string().trim().min(2, 'Saisissez au moins 2 caractères').max(120),
});

geocodeRouter.get('/search', geocodeLimiter, async (req, res, next) => {
  try {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Paramètre de recherche invalide.' });
      return;
    }

    const { q, lat, lng } = parsed.data;
    const bias = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
    const result = await searchAddresses(q, bias);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

geocodeRouter.get('/cities', geocodeLimiter, async (req, res, next) => {
  try {
    const parsed = cityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Paramètre de recherche de ville invalide.' });
      return;
    }

    const result = await searchCities(parsed.data.q);
    res.json(result);
  } catch (error) {
    next(error);
  }
});
