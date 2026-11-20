import { Router, type NextFunction, type Request, type Response } from 'express';
import { ensureTenantCampaign, resolvePublicTenant } from '../lib/campaign.js';
import { prisma } from '../lib/prisma.js';
import { publicSubmissionLimiter } from '../middleware/rateLimiter.js';
import { validateBody } from '../middleware/validate.js';
import { createDonationPointSchema, createVolunteerSchema } from '../schemas/validation.js';
import { findMatchingSectorId } from '../services/geoService.js';

export const publicRouter = Router();

function extractSlug(req: Request): string | undefined {
  if (typeof req.params.slug === 'string' && req.params.slug.trim()) {
    return req.params.slug;
  }
  if (typeof req.query.tenant === 'string' && req.query.tenant.trim()) {
    return req.query.tenant;
  }
  return undefined;
}

async function handleGetCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const tenant = await resolvePublicTenant(extractSlug(req));
    if (!tenant) {
      res.status(404).json({ error: 'Organisation ou campagne introuvable ou désactivée.' });
      return;
    }

    const campaign = await ensureTenantCampaign(tenant.id);
    const [totalPoints, totalSectors, totalVolunteers] = await Promise.all([
      prisma.donationPoint.count({ where: { campaignId: campaign.id } }),
      prisma.sector.count({ where: { campaignId: campaign.id } }),
      prisma.volunteer.count({ where: { campaignId: campaign.id } }),
    ]);

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      campaign: {
        id: campaign.id,
        name: campaign.name,
        city: campaign.city,
        centerLat: campaign.centerLat,
        centerLng: campaign.centerLng,
        zoomLevel: campaign.zoomLevel,
        isDonorFormOpen: campaign.isDonorFormOpen,
        isVolunteerFormOpen: campaign.isVolunteerFormOpen,
      },
      stats: {
        totalPoints,
        totalSectors,
        totalVolunteers,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function handleCreateDonationPoint(req: Request, res: Response, next: NextFunction) {
  try {
    const tenant = await resolvePublicTenant(extractSlug(req));
    if (!tenant) {
      res.status(404).json({ error: 'Organisation ou campagne introuvable ou désactivée.' });
      return;
    }

    const campaign = await ensureTenantCampaign(tenant.id);
    if (!campaign.isDonorFormOpen) {
      res.status(403).json({
        error: 'Le formulaire d’inscription des donateurs est actuellement fermé.',
      });
      return;
    }

    const { address, lat, lng, donorName, instructions, preferredTimeSlot } = req.body;
    const sectors = await prisma.sector.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, geoJsonPolygon: true },
    });

    const matchedSectorId = findMatchingSectorId(lat, lng, sectors);
    const matchedSector = sectors.find((s) => s.id === matchedSectorId) ?? null;

    const created = await prisma.donationPoint.create({
      data: {
        campaignId: campaign.id,
        sectorId: matchedSectorId,
        address,
        lat,
        lng,
        donorName: donorName || null,
        instructions: instructions || null,
        preferredTimeSlot: preferredTimeSlot || null,
        status: 'PENDING',
      },
      select: {
        id: true,
        address: true,
        lat: true,
        lng: true,
        status: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      point: created,
      inSector: Boolean(matchedSectorId),
      sectorName: matchedSector?.name ?? null,
      message: matchedSector
        ? `Merci ! Votre adresse a été assignée au secteur "${matchedSector.name}".`
        : 'Merci ! Votre adresse a été enregistrée (hors secteur actuel : l’équipe organisatrice ajustera la zone prochainement).',
    });
  } catch (error) {
    next(error);
  }
}

async function handleCreateVolunteer(req: Request, res: Response, next: NextFunction) {
  try {
    const tenant = await resolvePublicTenant(extractSlug(req));
    if (!tenant) {
      res.status(404).json({ error: 'Organisation ou campagne introuvable ou désactivée.' });
      return;
    }

    const campaign = await ensureTenantCampaign(tenant.id);
    if (!campaign.isVolunteerFormOpen) {
      res.status(403).json({
        error: 'Le formulaire d’inscription des bénévoles est actuellement fermé.',
      });
      return;
    }

    const { fullName, email, phone, notes } = req.body;
    const volunteer = await prisma.volunteer.create({
      data: {
        campaignId: campaign.id,
        sectorId: null,
        fullName,
        email: email.toLowerCase(),
        phone,
        notes: notes || null,
      },
      select: {
        id: true,
        fullName: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      volunteer,
      message:
        'Merci pour votre engagement ! Vous recevrez votre lien terrain par courriel dès qu’un secteur vous sera attribué.',
    });
  } catch (error) {
    next(error);
  }
}

publicRouter.get('/campaign', handleGetCampaign);
publicRouter.get('/tenants/:slug/campaign', handleGetCampaign);

publicRouter.post(
  '/donation-points',
  publicSubmissionLimiter,
  validateBody(createDonationPointSchema),
  handleCreateDonationPoint
);
publicRouter.post(
  '/tenants/:slug/donation-points',
  publicSubmissionLimiter,
  validateBody(createDonationPointSchema),
  handleCreateDonationPoint
);

publicRouter.post(
  '/volunteers',
  publicSubmissionLimiter,
  validateBody(createVolunteerSchema),
  handleCreateVolunteer
);
publicRouter.post(
  '/tenants/:slug/volunteers',
  publicSubmissionLimiter,
  validateBody(createVolunteerSchema),
  handleCreateVolunteer
);
