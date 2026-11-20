import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, requireSuperAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createTenantSchema,
  createTenantUserSchema,
  updateTenantSchema,
  updateTenantUserSchema,
} from '../schemas/validation.js';

export const superadminRouter = Router();

superadminRouter.use(requireAdmin, requireSuperAdmin);

superadminRouter.get('/tenants', async (_req, res, next) => {
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        users: {
          where: { role: 'TENANT_ADMIN' },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
        campaigns: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          include: {
            _count: {
              select: {
                sectors: true,
                volunteers: { where: { isAnonymized: false } },
                donationPoints: true,
              },
            },
            donationPoints: {
              select: { status: true },
            },
          },
        },
      },
    });

    const formatted = tenants.map((t) => {
      const campaign = t.campaigns[0] ?? null;
      const collectedPoints = campaign
        ? campaign.donationPoints.filter((p) => p.status === 'COLLECTED').length
        : 0;

      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        isActive: t.isActive,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        users: t.users,
        campaign: campaign
          ? {
              id: campaign.id,
              name: campaign.name,
              city: campaign.city,
              isDonorFormOpen: campaign.isDonorFormOpen,
              isVolunteerFormOpen: campaign.isVolunteerFormOpen,
              lastPurgedAt: campaign.lastPurgedAt,
            }
          : null,
        stats: {
          usersCount: t.users.length,
          sectorsCount: campaign?._count.sectors ?? 0,
          volunteersCount: campaign?._count.volunteers ?? 0,
          donationPointsCount: campaign?._count.donationPoints ?? 0,
          collectedPointsCount: collectedPoints,
        },
      };
    });

    res.json({ tenants: formatted });
  } catch (error) {
    next(error);
  }
});

superadminRouter.post('/tenants', validateBody(createTenantSchema), async (req, res, next) => {
  try {
    const {
      name,
      slug,
      city,
      campaignName,
      centerLat,
      centerLng,
      adminEmail,
      adminPassword,
      adminFullName,
    } = req.body;

    if (adminEmail && !adminPassword) {
      res.status(400).json({
        error: 'Un mot de passe administrateur (min. 8 caractères) est requis lorsque le courriel est renseigné.',
      });
      return;
    }

    const passwordHash =
      adminEmail && adminPassword ? await bcrypt.hash(adminPassword, 10) : null;

    const created = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name,
          slug,
          isActive: true,
        },
      });

      const campaign = await tx.campaign.create({
        data: {
          tenantId: tenant.id,
          name: campaignName || `Grande Collecte — ${name}`,
          city: city || 'Montréal, QC',
          centerLat: centerLat ?? 45.5017,
          centerLng: centerLng ?? -73.5673,
          zoomLevel: 13,
          isDonorFormOpen: true,
          isVolunteerFormOpen: true,
        },
      });

      let adminUser = null;
      if (adminEmail && passwordHash) {
        adminUser = await tx.user.create({
          data: {
            email: adminEmail.trim().toLowerCase(),
            passwordHash,
            fullName: adminFullName || `Admin ${name}`,
            role: 'TENANT_ADMIN',
            tenantId: tenant.id,
            isActive: true,
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        });
      }

      return { tenant, campaign, adminUser };
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

superadminRouter.patch('/tenants/:id', validateBody(updateTenantSchema), async (req, res, next) => {
  try {
    const tenantId = String(req.params.id);
    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: req.body,
    });
    res.json({ tenant: updated });
  } catch (error) {
    next(error);
  }
});

superadminRouter.delete('/tenants/:id', async (req, res, next) => {
  try {
    const tenantId = String(req.params.id);
    const totalCount = await prisma.tenant.count();
    if (totalCount <= 1) {
      res.status(400).json({
        error: 'Impossible de supprimer le dernier tenant actif de la plateforme.',
      });
      return;
    }

    await prisma.tenant.delete({ where: { id: tenantId } });
    res.json({ deletedId: tenantId });
  } catch (error) {
    next(error);
  }
});

superadminRouter.post(
  '/tenants/:id/users',
  validateBody(createTenantUserSchema),
  async (req, res, next) => {
    try {
      const tenantId = String(req.params.id);
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });

      if (!tenant) {
        res.status(404).json({ error: 'Tenant introuvable.' });
        return;
      }

      const passwordHash = await bcrypt.hash(req.body.password, 10);
      const user = await prisma.user.create({
        data: {
          email: req.body.email.trim().toLowerCase(),
          fullName: req.body.fullName,
          passwordHash,
          role: 'TENANT_ADMIN',
          tenantId: tenant.id,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          tenantId: true,
          isActive: true,
          createdAt: true,
        },
      });

      res.status(201).json({ user });
    } catch (error) {
      next(error);
    }
  }
);

superadminRouter.patch('/users/:userId', validateBody(updateTenantUserSchema), async (req, res, next) => {
  try {
    const userId = String(req.params.userId);
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Utilisateur introuvable.' });
      return;
    }

    const updateData: {
      fullName?: string;
      isActive?: boolean;
      passwordHash?: string;
    } = {};

    if (req.body.fullName !== undefined) updateData.fullName = req.body.fullName;
    if (req.body.isActive !== undefined) {
      if (existing.role === 'SUPERADMIN' && req.body.isActive === false) {
        res.status(400).json({ error: 'Impossible de désactiver le compte SuperAdmin.' });
        return;
      }
      updateData.isActive = req.body.isActive;
    }
    if (req.body.password !== undefined) {
      updateData.passwordHash = await bcrypt.hash(req.body.password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        tenantId: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.json({ user: updated });
  } catch (error) {
    next(error);
  }
});

superadminRouter.delete('/users/:userId', async (req, res, next) => {
  try {
    const userId = String(req.params.userId);
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Utilisateur introuvable.' });
      return;
    }

    if (existing.role === 'SUPERADMIN') {
      res.status(400).json({ error: 'Impossible de supprimer le compte SuperAdmin.' });
      return;
    }

    await prisma.user.delete({ where: { id: existing.id } });
    res.json({ deletedId: existing.id });
  } catch (error) {
    next(error);
  }
});
