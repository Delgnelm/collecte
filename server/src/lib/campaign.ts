import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';

export async function ensureTenantCampaign(tenantId: string) {
  const existing = await prisma.campaign.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    return existing;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  return prisma.campaign.create({
    data: {
      tenantId,
      name: tenant ? `Grande Collecte — ${tenant.name}` : 'Grande Collecte Annuelle',
      city: 'Montréal, QC',
      centerLat: 45.5017,
      centerLng: -73.5673,
      zoomLevel: 13,
      isDonorFormOpen: true,
      isVolunteerFormOpen: true,
    },
  });
}

export async function bootstrapPlatform() {
  const existingSuperAdmin = await prisma.user.findUnique({
    where: { email: env.SUPERADMIN_EMAIL },
  });

  if (!existingSuperAdmin) {
    const passwordHash = await bcrypt.hash(env.SUPERADMIN_PASSWORD, 10);
    await prisma.user.create({
      data: {
        email: env.SUPERADMIN_EMAIL,
        passwordHash,
        fullName: env.SUPERADMIN_NAME,
        role: 'SUPERADMIN',
        tenantId: null,
        isActive: true,
      },
    });
  }

  let defaultTenant = await prisma.tenant.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!defaultTenant) {
    defaultTenant = await prisma.tenant.create({
      data: {
        name: 'École Saint-Laurent',
        slug: 'ecole-saint-laurent',
        isActive: true,
      },
    });
  }

  const defaultCampaign = await ensureTenantCampaign(defaultTenant.id);
  return { tenant: defaultTenant, campaign: defaultCampaign };
}

export async function resolvePublicTenant(slug?: string) {
  if (slug) {
    return prisma.tenant.findFirst({
      where: {
        slug: slug.trim().toLowerCase(),
        isActive: true,
      },
    });
  }

  const active = await prisma.tenant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (active) {
    return active;
  }

  const anyTenant = await prisma.tenant.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!anyTenant) {
    const { tenant } = await bootstrapPlatform();
    return tenant;
  }

  return null;
}

export async function ensureDefaultCampaign() {
  const { campaign } = await bootstrapPlatform();
  return campaign;
}
