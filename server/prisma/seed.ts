import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.campaign.findFirst();
  if (existing) {
    console.log(`Campagne déjà existante : "${existing.name}" (${existing.id})`);
    return;
  }

  const campaign = await prisma.campaign.create({
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

  console.log(`Campagne initiale créée : "${campaign.name}" (${campaign.id})`);
}

main()
  .catch((error) => {
    console.error('Erreur lors du seed Prisma:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
