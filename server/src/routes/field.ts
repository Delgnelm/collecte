import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { fieldLimiter } from '../middleware/rateLimiter.js';
import { validateBody } from '../middleware/validate.js';
import { fieldStatusUpdateSchema, uuidParamSchema } from '../schemas/validation.js';
import { parseGeoJsonPolygon } from '../services/geoService.js';

export const fieldRouter = Router();

fieldRouter.get('/:accessToken', fieldLimiter, async (req, res, next) => {
  try {
    const tokenCheck = uuidParamSchema.safeParse(req.params.accessToken);
    if (!tokenCheck.success) {
      res.status(404).json({ error: 'Secteur introuvable ou lien expiré.' });
      return;
    }

    const sector = await prisma.sector.findUnique({
      where: { accessToken: tokenCheck.data },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            city: true,
            centerLat: true,
            centerLng: true,
            zoomLevel: true,
          },
        },
        volunteers: {
          where: { isAnonymized: false },
          orderBy: { fullName: 'asc' },
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
        donationPoints: {
          where: { isAnonymized: false },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            address: true,
            lat: true,
            lng: true,
            donorName: true,
            instructions: true,
            preferredTimeSlot: true,
            status: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!sector) {
      res.status(404).json({ error: 'Secteur introuvable ou lien expiré.' });
      return;
    }

    res.json({
      campaign: sector.campaign,
      sector: {
        id: sector.id,
        name: sector.name,
        color: sector.color,
        geoJsonPolygon: parseGeoJsonPolygon(sector.geoJsonPolygon),
      },
      teammates: sector.volunteers,
      points: sector.donationPoints,
    });
  } catch (error) {
    next(error);
  }
});

fieldRouter.patch(
  '/:accessToken/points/:pointId/status',
  fieldLimiter,
  validateBody(fieldStatusUpdateSchema),
  async (req, res, next) => {
    try {
      const tokenCheck = uuidParamSchema.safeParse(req.params.accessToken);
      if (!tokenCheck.success) {
        res.status(404).json({ error: 'Secteur introuvable ou lien expiré.' });
        return;
      }

      const sector = await prisma.sector.findUnique({
        where: { accessToken: tokenCheck.data },
        select: { id: true },
      });

      if (!sector) {
        res.status(404).json({ error: 'Secteur introuvable ou lien expiré.' });
        return;
      }

      const existingPoint = await prisma.donationPoint.findFirst({
        where: {
          id: String(req.params.pointId),
          sectorId: sector.id,
          isAnonymized: false,
        },
        select: { id: true },
      });

      if (!existingPoint) {
        res.status(404).json({ error: 'Point de cueillette introuvable dans ce secteur.' });
        return;
      }

      const updatedPoint = await prisma.donationPoint.update({
        where: { id: existingPoint.id },
        data: { status: req.body.status },
        select: {
          id: true,
          address: true,
          lat: true,
          lng: true,
          donorName: true,
          instructions: true,
          preferredTimeSlot: true,
          status: true,
          updatedAt: true,
        },
      });

      res.json({ point: updatedPoint });
    } catch (error) {
      next(error);
    }
  }
);
