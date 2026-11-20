import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import { ensureTenantCampaign } from '../lib/campaign.js';
import { prisma } from '../lib/prisma.js';
import {
  type AuthenticatedRequest,
  authenticateUser,
  requireAdmin,
  resolveActiveTenant,
  signAuthToken,
} from '../middleware/auth.js';
import { adminLoginLimiter } from '../middleware/rateLimiter.js';
import { validateBody } from '../middleware/validate.js';
import {
  changePasswordSchema,
  createSectorSchema,
  loginSchema,
  purgePiiSchema,
  updateCampaignSchema,
  updateDonationPointSchema,
  updateSectorSchema,
  updateVolunteerSchema,
} from '../schemas/validation.js';
import { sendCampaignEmails, sendSectorEmails } from '../services/emailService.js';
import {
  parseGeoJsonPolygon,
  recalculateCampaignAssignments,
  serializePolygonForDb,
} from '../services/geoService.js';

export const adminRouter = Router();

const SECTOR_PALETTE = [
  '#2563EB',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#DB2777',
  '#0891B2',
  '#DC2626',
  '#4F46E5',
];

function resolveRequestBaseUrl(req: Request): string | undefined {
  const forwardedHost = req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.get('host')?.trim();
  if (!host) return undefined;

  const forwardedProto = req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto = forwardedProto || req.protocol || 'http';
  return `${proto}://${host}`;
}

function computeStats(
  sectors: Array<{ id: string; name: string; color: string }>,
  allPoints: Array<{ sectorId: string | null; status: string }>
) {
  const global = {
    total: allPoints.length,
    pending: 0,
    collected: 0,
    absent: 0,
    outOfSector: 0,
  };

  const sectorMap = new Map<
    string,
    {
      sectorId: string;
      sectorName: string;
      color: string;
      total: number;
      pending: number;
      collected: number;
      absent: number;
    }
  >();

  for (const sector of sectors) {
    sectorMap.set(sector.id, {
      sectorId: sector.id,
      sectorName: sector.name,
      color: sector.color,
      total: 0,
      pending: 0,
      collected: 0,
      absent: 0,
    });
  }

  for (const pt of allPoints) {
    if (pt.status === 'COLLECTED') global.collected += 1;
    else if (pt.status === 'ABSENT') global.absent += 1;
    else global.pending += 1;

    if (!pt.sectorId) {
      global.outOfSector += 1;
      continue;
    }

    const entry = sectorMap.get(pt.sectorId);
    if (entry) {
      entry.total += 1;
      if (pt.status === 'COLLECTED') entry.collected += 1;
      else if (pt.status === 'ABSENT') entry.absent += 1;
      else entry.pending += 1;
    }
  }

  return {
    global,
    bySector: Array.from(sectorMap.values()),
  };
}

adminRouter.post('/login', adminLoginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await authenticateUser(email, password);
    if (!user) {
      res.status(401).json({ error: 'Identifiants administrateur invalides.' });
      return;
    }

    const token = signAuthToken(user);
    res.json({
      token,
      user,
      admin: { email: user.email },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.use(requireAdmin);

adminRouter.get('/me', async (req: AuthenticatedRequest, res, next) => {
  try {
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.sub },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, isActive: true },
        },
      },
    });

    if (!dbUser || !dbUser.isActive) {
      res.status(401).json({ error: 'Compte introuvable ou désactivé.' });
      return;
    }

    const userView = {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.fullName,
      role: dbUser.role === 'SUPERADMIN' ? 'SUPERADMIN' : 'TENANT_ADMIN',
      tenantId: dbUser.tenantId,
      tenantName: dbUser.tenant?.name ?? null,
      tenantSlug: dbUser.tenant?.slug ?? null,
    };

    const tenants =
      userView.role === 'SUPERADMIN'
        ? await prisma.tenant.findMany({
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, slug: true, isActive: true },
          })
        : [];

    res.json({
      user: userView,
      admin: { email: userView.email },
      tenants,
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  '/change-password',
  validateBody(changePasswordSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const authUser = req.user;
      if (!authUser) {
        res.status(401).json({ error: 'Authentification requise.' });
        return;
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: authUser.sub },
      });

      if (!dbUser || !dbUser.isActive) {
        res.status(401).json({ error: 'Compte introuvable.' });
        return;
      }

      const valid = await bcrypt.compare(req.body.currentPassword, dbUser.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Le mot de passe actuel est incorrect.' });
        return;
      }

      const newHash = await bcrypt.hash(req.body.newPassword, 10);
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { passwordHash: newHash },
      });

      res.json({ message: 'Mot de passe mis à jour avec succès.' });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.get('/campaign', async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenant = await resolveActiveTenant(req);
    const campaign = await ensureTenantCampaign(tenant.id);

    const [sectors, activeVolunteers, activePoints, allPointsForStats] = await Promise.all([
      prisma.sector.findMany({
        where: { campaignId: campaign.id },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.volunteer.findMany({
        where: { campaignId: campaign.id, isAnonymized: false },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.donationPoint.findMany({
        where: { campaignId: campaign.id, isAnonymized: false },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.donationPoint.findMany({
        where: { campaignId: campaign.id },
        select: { sectorId: true, status: true, isAnonymized: true },
      }),
    ]);

    const stats = computeStats(sectors, allPointsForStats);
    const sectorStatsMap = new Map(stats.bySector.map((s) => [s.sectorId, s]));

    const serializedSectors = sectors.map((sector) => {
      const volunteerCount = activeVolunteers.filter((v) => v.sectorId === sector.id).length;
      const sectorStats = sectorStatsMap.get(sector.id);
      return {
        id: sector.id,
        campaignId: sector.campaignId,
        name: sector.name,
        color: sector.color,
        geoJsonPolygon: parseGeoJsonPolygon(sector.geoJsonPolygon),
        accessToken: sector.accessToken,
        createdAt: sector.createdAt,
        updatedAt: sector.updatedAt,
        volunteerCount,
        pointStats: sectorStats ?? {
          sectorId: sector.id,
          sectorName: sector.name,
          color: sector.color,
          total: 0,
          pending: 0,
          collected: 0,
          absent: 0,
        },
      };
    });

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        isActive: tenant.isActive,
      },
      campaign,
      sectors: serializedSectors,
      volunteers: activeVolunteers,
      donationPoints: activePoints,
      stats: {
        ...stats,
        totalActiveVolunteers: activeVolunteers.length,
        anonymizedPointsCount: allPointsForStats.filter((p) => p.isAnonymized).length,
      },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch(
  '/campaign',
  validateBody(updateCampaignSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const tenant = await resolveActiveTenant(req);
      const campaign = await ensureTenantCampaign(tenant.id);
      const updated = await prisma.campaign.update({
        where: { id: campaign.id },
        data: req.body,
      });
      res.json({ campaign: updated });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.post(
  '/sectors',
  validateBody(createSectorSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const tenant = await resolveActiveTenant(req);
      const campaign = await ensureTenantCampaign(tenant.id);
      const existingCount = await prisma.sector.count({ where: { campaignId: campaign.id } });
      const sectorNumber = existingCount + 1;

      const name = req.body.name || `Secteur ${sectorNumber}`;
      const color = req.body.color || SECTOR_PALETTE[existingCount % SECTOR_PALETTE.length];

      const created = await prisma.sector.create({
        data: {
          campaignId: campaign.id,
          name,
          color,
          geoJsonPolygon: serializePolygonForDb(req.body.geoJsonPolygon) as never,
          accessToken: crypto.randomUUID(),
        },
      });

      const recalculation = await recalculateCampaignAssignments(campaign.id);

      res.status(201).json({
        sector: {
          ...created,
          geoJsonPolygon: parseGeoJsonPolygon(created.geoJsonPolygon),
        },
        recalculation,
      });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.patch(
  '/sectors/:id',
  validateBody(updateSectorSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const tenant = await resolveActiveTenant(req);
      const campaign = await ensureTenantCampaign(tenant.id);
      const existing = await prisma.sector.findFirst({
        where: { id: String(req.params.id), campaignId: campaign.id },
      });

      if (!existing) {
        res.status(404).json({ error: 'Secteur introuvable.' });
        return;
      }

      const updateData: {
        name?: string;
        color?: string;
        geoJsonPolygon?: never;
      } = {};

      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.color !== undefined) updateData.color = req.body.color;
      if (req.body.geoJsonPolygon !== undefined) {
        updateData.geoJsonPolygon = serializePolygonForDb(req.body.geoJsonPolygon) as never;
      }

      const updated = await prisma.sector.update({
        where: { id: existing.id },
        data: updateData,
      });

      const recalculation =
        req.body.geoJsonPolygon !== undefined
          ? await recalculateCampaignAssignments(campaign.id)
          : null;

      res.json({
        sector: {
          ...updated,
          geoJsonPolygon: parseGeoJsonPolygon(updated.geoJsonPolygon),
        },
        recalculation,
      });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.delete('/sectors/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenant = await resolveActiveTenant(req);
    const campaign = await ensureTenantCampaign(tenant.id);
    const existing = await prisma.sector.findFirst({
      where: { id: String(req.params.id), campaignId: campaign.id },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Secteur introuvable.' });
      return;
    }

    await prisma.sector.delete({ where: { id: existing.id } });
    const recalculation = await recalculateCampaignAssignments(campaign.id);

    res.json({
      deletedId: existing.id,
      recalculation,
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/sectors/:id/rotate-token', async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenant = await resolveActiveTenant(req);
    const campaign = await ensureTenantCampaign(tenant.id);
    const existing = await prisma.sector.findFirst({
      where: { id: String(req.params.id), campaignId: campaign.id },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Secteur introuvable.' });
      return;
    }

    const updated = await prisma.sector.update({
      where: { id: existing.id },
      data: { accessToken: crypto.randomUUID() },
    });

    res.json({
      sector: {
        ...updated,
        geoJsonPolygon: parseGeoJsonPolygon(updated.geoJsonPolygon),
      },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/campaign/recalculate', async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenant = await resolveActiveTenant(req);
    const campaign = await ensureTenantCampaign(tenant.id);
    const recalculation = await recalculateCampaignAssignments(campaign.id);
    res.json({ recalculation });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch(
  '/volunteers/:id',
  validateBody(updateVolunteerSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const tenant = await resolveActiveTenant(req);
      const campaign = await ensureTenantCampaign(tenant.id);
      const existing = await prisma.volunteer.findFirst({
        where: { id: String(req.params.id), campaignId: campaign.id, isAnonymized: false },
      });

      if (!existing) {
        res.status(404).json({ error: 'Bénévole introuvable.' });
        return;
      }

      if (typeof req.body.sectorId === 'string') {
        const targetSector = await prisma.sector.findFirst({
          where: { id: req.body.sectorId, campaignId: campaign.id },
          select: { id: true },
        });
        if (!targetSector) {
          res.status(404).json({ error: 'Secteur cible introuvable.' });
          return;
        }
      }

      const updated = await prisma.volunteer.update({
        where: { id: existing.id },
        data: req.body,
      });

      res.json({ volunteer: updated });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.delete('/volunteers/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenant = await resolveActiveTenant(req);
    const campaign = await ensureTenantCampaign(tenant.id);
    const existing = await prisma.volunteer.findFirst({
      where: { id: String(req.params.id), campaignId: campaign.id },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Bénévole introuvable.' });
      return;
    }

    await prisma.volunteer.delete({ where: { id: existing.id } });
    res.json({ deletedId: existing.id });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch(
  '/donation-points/:id',
  validateBody(updateDonationPointSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const tenant = await resolveActiveTenant(req);
      const campaign = await ensureTenantCampaign(tenant.id);
      const existing = await prisma.donationPoint.findFirst({
        where: { id: String(req.params.id), campaignId: campaign.id, isAnonymized: false },
      });

      if (!existing) {
        res.status(404).json({ error: 'Point de cueillette introuvable.' });
        return;
      }

      if (typeof req.body.sectorId === 'string') {
        const targetSector = await prisma.sector.findFirst({
          where: { id: req.body.sectorId, campaignId: campaign.id },
          select: { id: true },
        });
        if (!targetSector) {
          res.status(404).json({ error: 'Secteur cible introuvable.' });
          return;
        }
      }

      const updated = await prisma.donationPoint.update({
        where: { id: existing.id },
        data: req.body,
      });

      res.json({ point: updated });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.delete('/donation-points/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenant = await resolveActiveTenant(req);
    const campaign = await ensureTenantCampaign(tenant.id);
    const existing = await prisma.donationPoint.findFirst({
      where: { id: String(req.params.id), campaignId: campaign.id },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Point de cueillette introuvable.' });
      return;
    }

    await prisma.donationPoint.delete({ where: { id: existing.id } });
    res.json({ deletedId: existing.id });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/campaign/dispatch-emails', async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenant = await resolveActiveTenant(req);
    const campaign = await ensureTenantCampaign(tenant.id);
    const result = await sendCampaignEmails(campaign.id, resolveRequestBaseUrl(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/sectors/:id/dispatch-emails', async (req: AuthenticatedRequest, res, next) => {
  try {
    const tenant = await resolveActiveTenant(req);
    const campaign = await ensureTenantCampaign(tenant.id);
    const sector = await prisma.sector.findFirst({
      where: { id: String(req.params.id), campaignId: campaign.id },
      select: { id: true },
    });

    if (!sector) {
      res.status(404).json({ error: 'Secteur introuvable.' });
      return;
    }

    const result = await sendSectorEmails(sector.id, resolveRequestBaseUrl(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  '/campaign/purge-pii',
  validateBody(purgePiiSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const tenant = await resolveActiveTenant(req);
      const campaign = await ensureTenantCampaign(tenant.id);
      const purgedAt = new Date();

      const result = await prisma.$transaction(async (tx) => {
        const pointsToAnonymize = await tx.donationPoint.findMany({
          where: { campaignId: campaign.id, isAnonymized: false },
          select: { id: true },
        });

        const volunteersToAnonymize = await tx.volunteer.findMany({
          where: { campaignId: campaign.id, isAnonymized: false },
          select: { id: true },
        });

        const sectors = await tx.sector.findMany({
          where: { campaignId: campaign.id },
          select: { id: true, name: true, color: true },
          orderBy: { createdAt: 'asc' },
        });

        if (pointsToAnonymize.length > 0) {
          await tx.donationPoint.updateMany({
            where: { id: { in: pointsToAnonymize.map((p) => p.id) } },
            data: {
              address: 'Données purgées (Loi 25)',
              donorName: null,
              instructions: null,
              preferredTimeSlot: null,
              lat: 0,
              lng: 0,
              isAnonymized: true,
            },
          });
        }

        for (const vol of volunteersToAnonymize) {
          await tx.volunteer.update({
            where: { id: vol.id },
            data: {
              fullName: 'Bénévole anonymisé',
              email: `purge-${vol.id}@anonymise.local`,
              phone: '',
              notes: null,
              isAnonymized: true,
            },
          });
        }

        for (const sector of sectors) {
          await tx.sector.update({
            where: { id: sector.id },
            data: { accessToken: crypto.randomUUID() },
          });
        }

        await tx.campaign.update({
          where: { id: campaign.id },
          data: { lastPurgedAt: purgedAt },
        });

        const allPointsAfter = await tx.donationPoint.findMany({
          where: { campaignId: campaign.id },
          select: { sectorId: true, status: true },
        });

        return {
          anonymizedPointsCount: pointsToAnonymize.length,
          anonymizedVolunteersCount: volunteersToAnonymize.length,
          rotatedTokensCount: sectors.length,
          preservedStats: computeStats(sectors, allPointsAfter),
        };
      });

      res.json({
        message:
          'Purge Loi 25 effectuée : les données personnelles ont été anonymisées et les liens terrain révoqués. Les statistiques globales et par secteur sont conservées.',
        purgedAt,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);
