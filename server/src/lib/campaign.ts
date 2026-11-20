import { prisma } from './prisma.js';

export async function ensureDefaultCampaign() {
  const existing = await prisma.campaign.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    return existing;
  }

  return prisma.campaign.create({
    data: {
      name: 'Grande Collecte Annuelle — École Saint-Laurent',
      city: 'Montréal, QC',
      centerLat: 45.5017,
      centerLng: -73.5673,
      zoomLevel: 13,
      isDonorFormOpen: true,
      isVolunteerFormOpen: true,
    },
  });
}
