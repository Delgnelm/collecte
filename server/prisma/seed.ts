import 'dotenv/config';
import { bootstrapPlatform } from '../src/lib/campaign.js';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  const { tenant, campaign } = await bootstrapPlatform();
  console.log(
    `Plateforme initialisée — Tenant: "${tenant.name}" (${tenant.slug}) | Campagne: "${campaign.name}" (${campaign.id})`
  );
}

main()
  .catch((error) => {
    console.error('Erreur lors du seed Prisma:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
