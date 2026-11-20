import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '../..');
const testDbPath = path.join(serverRoot, 'prisma', 'test.db');
const prismaCli = path.join(serverRoot, 'node_modules', 'prisma', 'build', 'index.js');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-secret-key-for-collecte-ecole-32chars';
process.env.ADMIN_EMAIL = 'admin@ecole.local';
process.env.ADMIN_PASSWORD = 'TestPassword2026!';
process.env.DISABLE_RATE_LIMIT = 'true';
process.env.SMTP_DRY_RUN = 'true';
process.env.APP_BASE_URL = 'http://localhost:5173';

if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

execFileSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
  cwd: serverRoot,
  env: { ...process.env },
  stdio: 'pipe',
});

const { createApp } = await import('../app.js');
const { prisma } = await import('../lib/prisma.js');
const { ensureDefaultCampaign } = await import('../lib/campaign.js');
const { buildSectorDispatchEmail } = await import('../services/emailService.js');

let app: ReturnType<typeof createApp>;
let adminToken = '';

async function requestJson<T>(
  route: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const socket = new PassThrough() as unknown as Socket;
    Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1' });

    const req = new IncomingMessage(socket);
    req.method = options.method ?? 'GET';
    req.url = route;
    req.headers = { host: '127.0.0.1' };

    let payloadBuf: Buffer | null = null;
    if (options.body !== undefined) {
      payloadBuf = Buffer.from(JSON.stringify(options.body), 'utf8');
      req.headers['content-type'] = 'application/json';
      req.headers['content-length'] = String(payloadBuf.length);
    }
    if (options.token) {
      req.headers.authorization = `Bearer ${options.token}`;
    }

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];

    res.write = ((chunk: unknown) => {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return true;
    }) as typeof res.write;

    res.end = ((chunk?: unknown) => {
      if (chunk !== undefined && chunk !== null && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        const data = (raw ? JSON.parse(raw) : {}) as T;
        resolve({ status: res.statusCode, data });
      } catch (err) {
        reject(err);
      }
      return res;
    }) as typeof res.end;

    app(req, res);

    if (payloadBuf) {
      req.push(payloadBuf);
    }
    req.push(null);
  });
}

describe('API Collecte École — Intégration complète', () => {
  before(async () => {
    await prisma.$connect();
    await ensureDefaultCampaign();
    app = createApp();
  });

  after(async () => {
    await prisma.$disconnect();
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const target = `${testDbPath}${suffix}`;
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    }
  });

  it('vérifie la santé du serveur et la campagne publique', async () => {
    const health = await requestJson<{ status: string; database: string }>('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');
    assert.equal(health.data.database, 'connected');

    const pub = await requestJson<{
      campaign: { name: string; isDonorFormOpen: boolean; isVolunteerFormOpen: boolean };
    }>('/api/public/campaign');
    assert.equal(pub.status, 200);
    assert.equal(pub.data.campaign.isDonorFormOpen, true);
    assert.equal(pub.data.campaign.isVolunteerFormOpen, true);
  });

  it('protège les routes admin par JWT (401 si invalide/absent, 200 si valide)', async () => {
    const unauth = await requestJson<{ error: string }>('/api/admin/campaign');
    assert.equal(unauth.status, 401);

    const badLogin = await requestJson<{ error: string }>('/api/admin/login', {
      method: 'POST',
      body: { email: 'admin@ecole.local', password: 'WrongPassword!' },
    });
    assert.equal(badLogin.status, 401);

    const validLogin = await requestJson<{ token: string; admin: { email: string } }>(
      '/api/admin/login',
      {
        method: 'POST',
        body: { email: 'admin@ecole.local', password: 'TestPassword2026!' },
      }
    );
    assert.equal(validLogin.status, 200);
    assert.ok(validLogin.data.token.length > 20);
    adminToken = validLogin.data.token;
  });

  it('rejette les charges utiles invalides et GeoJSON malformés via Zod (400)', async () => {
    const badPoint = await requestJson<{ error: string }>('/api/public/donation-points', {
      method: 'POST',
      body: { address: 'ab', lat: 200, lng: -73.5 },
    });
    assert.equal(badPoint.status, 400);

    const badSector = await requestJson<{ error: string }>('/api/admin/sectors', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Secteur Invalide',
        geoJsonPolygon: {
          type: 'Polygon',
          coordinates: [
            [
              [-73.57, 45.5],
              [-73.56, 45.5],
            ],
          ],
        },
      },
    });
    assert.equal(badSector.status, 400);
  });

  it('respecte les interrupteurs d’ouverture/fermeture des formulaires publics', async () => {
    const closeForms = await requestJson('/api/admin/campaign', {
      method: 'PATCH',
      token: adminToken,
      body: { isDonorFormOpen: false, isVolunteerFormOpen: false },
    });
    assert.equal(closeForms.status, 200);

    const closedDonor = await requestJson('/api/public/donation-points', {
      method: 'POST',
      body: {
        address: '100 Rue Test, Montréal, QC',
        lat: 45.505,
        lng: -73.565,
      },
    });
    assert.equal(closedDonor.status, 403);

    const closedVol = await requestJson('/api/public/volunteers', {
      method: 'POST',
      body: {
        fullName: 'Jean Test',
        email: 'jean@test.ca',
        phone: '514-555-0100',
      },
    });
    assert.equal(closedVol.status, 403);

    const reopenForms = await requestJson('/api/admin/campaign', {
      method: 'PATCH',
      token: adminToken,
      body: { isDonorFormOpen: true, isVolunteerFormOpen: true },
    });
    assert.equal(reopenForms.status, 200);
  });

  it('gère les polygones de secteur, la détection Turf.js, le recalcul lors de l’édition et la suppression', async () => {
    // 1. Créer Secteur Nord couvrant [-73.57, 45.50] à [-73.56, 45.51]
    const createNorth = await requestJson<{
      sector: { id: string; name: string; accessToken: string };
    }>('/api/admin/sectors', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Secteur Nord',
        color: '#2563EB',
        geoJsonPolygon: {
          type: 'Polygon',
          coordinates: [
            [
              [-73.57, 45.5],
              [-73.56, 45.5],
              [-73.56, 45.51],
              [-73.57, 45.51],
              [-73.57, 45.5],
            ],
          ],
        },
      },
    });
    assert.equal(createNorth.status, 201);
    const northSectorId = createNorth.data.sector.id;

    // 2. Point dans Secteur Nord -> assigné automatiquement
    const insideRes = await requestJson<{
      point: { id: string };
      inSector: boolean;
      sectorName: string | null;
    }>('/api/public/donation-points', {
      method: 'POST',
      body: {
        address: '10 Rue Principale, Montréal, QC',
        lat: 45.505,
        lng: -73.565,
        donorName: 'Alice Martin',
        instructions: 'Sur le perron',
      },
    });
    assert.equal(insideRes.status, 201);
    assert.equal(insideRes.data.inSector, true);
    assert.equal(insideRes.data.sectorName, 'Secteur Nord');

    // 3. Point juste à l'est (-73.555) -> hors secteur pour le moment
    const outsideRes = await requestJson<{
      point: { id: string };
      inSector: boolean;
    }>('/api/public/donation-points', {
      method: 'POST',
      body: {
        address: '25 Rue Est, Montréal, QC',
        lat: 45.505,
        lng: -73.555,
        donorName: 'Bob Gagnon',
      },
    });
    assert.equal(outsideRes.status, 201);
    assert.equal(outsideRes.data.inSector, false);
    const secondPointId = outsideRes.data.point.id;

    // 4. Étendre Secteur Nord jusqu'à -73.55 -> recalcul Turf.js doit assigner le 2e point
    const expandRes = await requestJson<{
      recalculation: { assignedCount: number; outOfSectorCount: number; updatedCount: number };
    }>(`/api/admin/sectors/${northSectorId}`, {
      method: 'PATCH',
      token: adminToken,
      body: {
        geoJsonPolygon: {
          type: 'Polygon',
          coordinates: [
            [
              [-73.57, 45.5],
              [-73.55, 45.5],
              [-73.55, 45.51],
              [-73.57, 45.51],
              [-73.57, 45.5],
            ],
          ],
        },
      },
    });
    assert.equal(expandRes.status, 200);
    assert.equal(expandRes.data.recalculation.assignedCount, 2);
    assert.equal(expandRes.data.recalculation.outOfSectorCount, 0);

    // 5. Créer et supprimer un secteur temporaire vérifiant la remise hors secteur
    const tempSectorRes = await requestJson<{ sector: { id: string } }>('/api/admin/sectors', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Secteur Sud',
        color: '#059669',
        geoJsonPolygon: {
          type: 'Polygon',
          coordinates: [
            [
              [-73.57, 45.48],
              [-73.55, 45.48],
              [-73.55, 45.49],
              [-73.57, 45.49],
              [-73.57, 45.48],
            ],
          ],
        },
      },
    });
    assert.equal(tempSectorRes.status, 201);
    const southSectorId = tempSectorRes.data.sector.id;

    const southPointRes = await requestJson<{ point: { id: string }; inSector: boolean }>(
      '/api/public/donation-points',
      {
        method: 'POST',
        body: { address: '80 Rue Sud, Montréal, QC', lat: 45.485, lng: -73.56 },
      }
    );
    assert.equal(southPointRes.status, 201);
    assert.equal(southPointRes.data.inSector, true);

    const delSouth = await requestJson<{
      recalculation: { outOfSectorCount: number };
    }>(`/api/admin/sectors/${southSectorId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delSouth.status, 200);
    assert.equal(delSouth.data.recalculation.outOfSectorCount, 1);

    // Vérifie que le point 2 est bien assigné au Secteur Nord
    const adminData = await requestJson<{
      donationPoints: Array<{ id: string; sectorId: string | null }>;
    }>('/api/admin/campaign', { token: adminToken });
    const pt2 = adminData.data.donationPoints.find((p) => p.id === secondPointId);
    assert.equal(pt2?.sectorId, northSectorId);
  });

  it('inscrit et assigne des bénévoles, génère les courriels HTML, isole la vue terrain et purge les données Loi 25', async () => {
    const adminBefore = await requestJson<{
      sectors: Array<{ id: string; name: string; accessToken: string }>;
      donationPoints: Array<{ id: string; sectorId: string | null }>;
    }>('/api/admin/campaign', { token: adminToken });

    const northSector = adminBefore.data.sectors[0];
    assert.ok(northSector);
    const northPoints = adminBefore.data.donationPoints.filter(
      (p) => p.sectorId === northSector.id
    );
    const outsidePoint = adminBefore.data.donationPoints.find((p) => p.sectorId === null);
    assert.ok(northPoints.length === 2);
    assert.ok(outsidePoint);

    // Inscription de deux bénévoles
    const v1 = await requestJson<{ volunteer: { id: string } }>('/api/public/volunteers', {
      method: 'POST',
      body: {
        fullName: 'Camille Gagnon',
        email: 'camille@ecole.ca',
        phone: '514-555-0111',
        notes: 'J’ai une voiture',
      },
    });
    const v2 = await requestJson<{ volunteer: { id: string } }>('/api/public/volunteers', {
      method: 'POST',
      body: {
        fullName: 'Lucas Bouchard',
        email: 'lucas@ecole.ca',
        phone: '514-555-0222',
      },
    });
    assert.equal(v1.status, 201);
    assert.equal(v2.status, 201);

    // Assignation au Secteur Nord
    const assign1 = await requestJson(`/api/admin/volunteers/${v1.data.volunteer.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { sectorId: northSector.id },
    });
    const assign2 = await requestJson(`/api/admin/volunteers/${v2.data.volunteer.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { sectorId: northSector.id },
    });
    assert.equal(assign1.status, 200);
    assert.equal(assign2.status, 200);

    // Vérification du contenu HTML du courriel généré
    const sampleEmail = buildSectorDispatchEmail({
      campaignName: 'Collecte École',
      campaignCity: 'Montréal',
      sectorName: northSector.name,
      sectorColor: '#2563EB',
      volunteerName: 'Camille Gagnon',
      teammates: [{ id: v2.data.volunteer.id, fullName: 'Lucas Bouchard', phone: '514-555-0222' }],
      fieldUrl: `http://localhost:5173/terrain/${northSector.accessToken}`,
      pointsCount: northPoints.length,
    });
    assert.match(sampleEmail.html, /Secteur Nord/);
    assert.match(sampleEmail.html, /Lucas Bouchard/);
    assert.ok(sampleEmail.html.includes(`/terrain/${northSector.accessToken}`));

    // Envoi simulé via API
    const dispatchRes = await requestJson<{
      mode: string;
      simulatedCount: number;
      details: Array<{ fieldUrl: string }>;
    }>('/api/admin/campaign/dispatch-emails', {
      method: 'POST',
      token: adminToken,
    });
    assert.equal(dispatchRes.status, 200);
    assert.equal(dispatchRes.data.mode, 'simulated');
    assert.equal(dispatchRes.data.simulatedCount, 2);
    assert.ok(
      dispatchRes.data.details.every((d) =>
        d.fieldUrl.endsWith(`/terrain/${northSector.accessToken}`)
      )
    );

    // Vue terrain : rejet 404 sur jeton invalide
    const invalidField = await requestJson('/api/field/00000000-0000-4000-8000-000000000000');
    assert.equal(invalidField.status, 404);

    // Vue terrain : retourne uniquement les 2 points du Secteur Nord
    const validField = await requestJson<{
      sector: { id: string; name: string };
      teammates: Array<{ fullName: string }>;
      points: Array<{ id: string; status: string }>;
    }>(`/api/field/${northSector.accessToken}`);
    assert.equal(validField.status, 200);
    assert.equal(validField.data.points.length, 2);
    assert.equal(validField.data.teammates.length, 2);

    // Marquer point 1 COLLECTED et point 2 ABSENT
    const markCollected = await requestJson<{ point: { status: string } }>(
      `/api/field/${northSector.accessToken}/points/${northPoints[0].id}/status`,
      { method: 'PATCH', body: { status: 'COLLECTED' } }
    );
    assert.equal(markCollected.status, 200);
    assert.equal(markCollected.data.point.status, 'COLLECTED');

    const markAbsent = await requestJson<{ point: { status: string } }>(
      `/api/field/${northSector.accessToken}/points/${northPoints[1].id}/status`,
      { method: 'PATCH', body: { status: 'ABSENT' } }
    );
    assert.equal(markAbsent.status, 200);
    assert.equal(markAbsent.data.point.status, 'ABSENT');

    // Isolation : impossible de modifier un point hors secteur depuis ce jeton
    const crossSectorUpdate = await requestJson(
      `/api/field/${northSector.accessToken}/points/${outsidePoint.id}/status`,
      { method: 'PATCH', body: { status: 'COLLECTED' } }
    );
    assert.equal(crossSectorUpdate.status, 404);

    // Purge Loi 25
    const purgeBad = await requestJson('/api/admin/campaign/purge-pii', {
      method: 'POST',
      token: adminToken,
      body: { confirmation: 'WRONG' },
    });
    assert.equal(purgeBad.status, 400);

    const purgeRes = await requestJson<{
      anonymizedPointsCount: number;
      anonymizedVolunteersCount: number;
      rotatedTokensCount: number;
      preservedStats: {
        global: { total: number; collected: number; absent: number; pending: number };
        bySector: Array<{ sectorId: string; total: number; collected: number; absent: number }>;
      };
    }>('/api/admin/campaign/purge-pii', {
      method: 'POST',
      token: adminToken,
      body: { confirmation: 'PURGER' },
    });
    assert.equal(purgeRes.status, 200);
    assert.equal(purgeRes.data.anonymizedPointsCount, 3);
    assert.equal(purgeRes.data.anonymizedVolunteersCount, 2);
    assert.equal(purgeRes.data.rotatedTokensCount, 1);
    assert.equal(purgeRes.data.preservedStats.global.total, 3);
    assert.equal(purgeRes.data.preservedStats.global.collected, 1);
    assert.equal(purgeRes.data.preservedStats.global.absent, 1);
    assert.equal(purgeRes.data.preservedStats.global.pending, 1);

    const northStats = purgeRes.data.preservedStats.bySector.find(
      (s) => s.sectorId === northSector.id
    );
    assert.equal(northStats?.total, 2);
    assert.equal(northStats?.collected, 1);
    assert.equal(northStats?.absent, 1);

    // L'ancien jeton terrain ne fonctionne plus après purge
    const oldTokenCheck = await requestJson(`/api/field/${northSector.accessToken}`);
    assert.equal(oldTokenCheck.status, 404);

    // Vérifie en base que les PII ont bien été effacées
    const dbPoints = await prisma.donationPoint.findMany();
    for (const p of dbPoints) {
      assert.equal(p.isAnonymized, true);
      assert.equal(p.donorName, null);
      assert.equal(p.instructions, null);
      assert.equal(p.lat, 0);
      assert.equal(p.lng, 0);
      assert.equal(p.address, 'Données purgées (Loi 25)');
    }
    const dbVols = await prisma.volunteer.findMany();
    for (const v of dbVols) {
      assert.equal(v.isAnonymized, true);
      assert.equal(v.fullName, 'Bénévole anonymisé');
      assert.equal(v.phone, '');
      assert.match(v.email, /@anonymise\.local$/);
    }
  });
});
