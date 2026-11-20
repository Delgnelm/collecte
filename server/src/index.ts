import { createApp } from './app.js';
import { env } from './config/env.js';
import { ensureDefaultCampaign } from './lib/campaign.js';
import { prisma } from './lib/prisma.js';

async function start() {
  try {
    await prisma.$connect();
    await ensureDefaultCampaign();

    const app = createApp();
    const server = app.listen(env.PORT, () => {
      console.log(`Serveur Collecte École démarré sur http://localhost:${env.PORT}`);
      console.log(`Fournisseur de géocodage actif : ${env.GEOCODING_PROVIDER}`);
      console.log(
        `Mode courriel : ${env.SMTP_DRY_RUN || !env.SMTP_HOST ? 'SIMULATION (SMTP_DRY_RUN)' : `SMTP (${env.SMTP_HOST})`}`
      );
    });

    const shutdown = async () => {
      server.close();
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Échec du démarrage du serveur :', error);
    process.exit(1);
  }
}

start();
