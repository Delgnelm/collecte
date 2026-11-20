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
process.env.SUPERADMIN_EMAIL = 'denis.safieddine@gmail.com';
process.env.SUPERADMIN_PASSWORD = 'TestPassword2026!';
process.env.SUPERADMIN_NAME = 'Denis Safieddine';
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
const { bootstrapPlatform } = await import('../lib/campaign.js');
const { buildSectorDispatchEmail } = await import('../services/emailService.js');

let app: ReturnType<typeof createApp>;
let superAdminToken = '';
let defaultTenantId = '';

async function requestJson<T>(
  route: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const socket = new PassThrough() as unknown as Socket;
    Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1' });

    const req = new IncomingMessage(socket);
    req.method = options.method ?? 'GET';
    req.url = route;
    req.headers = {
      host: '127.0.0.1',
      ...(options.headers ?? {}),
    };

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

describe('API Collecte École Multi-Tenant — Intégration complète', () => {
  before(async () => {
    await prisma.$connect();
    const { tenant } = await bootstrapPlatform();
    defaultTenantId = tenant.id;
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
      tenant: { id: string; slug: string };
      campaign: { name: string; isDonorFormOpen: boolean; isVolunteerFormOpen: boolean };
    }>('/api/public/campaign');
    assert.equal(pub.status, 200);
    assert.equal(pub.data.tenant.slug, 'ecole-saint-laurent');
    assert.equal(pub.data.campaign.isDonorFormOpen, true);
    assert.equal(pub.data.campaign.isVolunteerFormOpen, true);
  });

  it('authentifie le SuperAdmin par JWT (401 si invalide/absent, 200 si valide)', async () => {
    const unauth = await requestJson<{ error: string }>('/api/admin/campaign');
    assert.equal(unauth.status, 401);

    const badLogin = await requestJson<{ error: string }>('/api/admin/login', {
      method: 'POST',
      body: { email: 'denis.safieddine@gmail.com', password: 'WrongPassword!' },
    });
    assert.equal(badLogin.status, 401);

    const validLogin = await requestJson<{
      token: string;
      user: { email: string; role: string };
    }>('/api/admin/login', {
      method: 'POST',
      body: { email: 'denis.safieddine@gmail.com', password: 'TestPassword2026!' },
    });
    assert.equal(validLogin.status, 200);
    assert.equal(validLogin.data.user.role, 'SUPERADMIN');
    assert.ok(validLogin.data.token.length > 20);
    superAdminToken = validLogin.data.token;
  });

  it('gère les tenants, l’isolation RBAC stricte, le changement de mot de passe et les URL publiques /t/:slug', async () => {
    // Création d'un second tenant avec un administrateur dédié
    const createTenantRes = await requestJson<{
      tenant: { id: string; slug: string; name: string };
      adminUser: { id: string; email: string; role: string };
    }>('/api/superadmin/tenants', {
      method: 'POST',
      token: superAdminToken,
      body: {
        name: 'École des Érables',
        slug: 'ecole-erables',
        city: 'Québec, QC',
        adminEmail: 'admin@erables.ca',
        adminPassword: 'ErablesPassword2026!',
        adminFullName: 'Sophie Lavoie',
      },
    });
    assert.equal(createTenantRes.status, 201);
    const tenant2Id = createTenantRes.data.tenant.id;

    // Connexion en tant que Tenant Admin du tenant 2
    const tenantLogin = await requestJson<{
      token: string;
      user: { role: string; tenantId: string };
    }>('/api/admin/login', {
      method: 'POST',
      body: { email: 'admin@erables.ca', password: 'ErablesPassword2026!' },
    });
    assert.equal(tenantLogin.status, 200);
    assert.equal(tenantLogin.data.user.role, 'TENANT_ADMIN');
    assert.equal(tenantLogin.data.user.tenantId, tenant2Id);
    const tenant2Token = tenantLogin.data.token;

    // Le Tenant Admin ne peut pas accéder aux routes SuperAdmin (403)
    const forbiddenSuper = await requestJson('/api/superadmin/tenants', {
      token: tenant2Token,
    });
    assert.equal(forbiddenSuper.status, 403);

    // Même avec un en-tête X-Tenant-Id falsifié pointant sur le tenant 1, le Tenant Admin reste bloqué sur son propre tenant
    const spoofedCampaign = await requestJson<{ tenant: { id: string; slug: string } }>(
      '/api/admin/campaign',
      {
        token: tenant2Token,
        headers: { 'x-tenant-id': defaultTenantId },
      }
    );
    assert.equal(spoofedCampaign.status, 200);
    assert.equal(spoofedCampaign.data.tenant.id, tenant2Id);
    assert.equal(spoofedCampaign.data.tenant.slug, 'ecole-erables');

    // Portail public par slug : soumission sur ecole-erables isolée du tenant 1
    const pub2 = await requestJson<{ tenant: { slug: string } }>(
      '/api/public/tenants/ecole-erables/campaign'
    );
    assert.equal(pub2.status, 200);
    assert.equal(pub2.data.tenant.slug, 'ecole-erables');

    const pointTenant2 = await requestJson('/api/public/tenants/ecole-erables/donation-points', {
      method: 'POST',
      body: {
        address: '500 Grande Allée, Québec, QC',
        lat: 46.805,
        lng: -71.22,
      },
    });
    assert.equal(pointTenant2.status, 201);

    const tenant1View = await requestJson<{ donationPoints: unknown[] }>('/api/admin/campaign', {
      token: superAdminToken,
      headers: { 'x-tenant-id': defaultTenantId },
    });
    assert.equal(tenant1View.data.donationPoints.length, 0);

    // Changement de mot de passe par l'administrateur connecté
    const badPwChange = await requestJson('/api/admin/change-password', {
      method: 'POST',
      token: tenant2Token,
      body: { currentPassword: 'WrongPassword!', newPassword: 'NewPassword2026!' },
    });
    assert.equal(badPwChange.status, 401);

    const okPwChange = await requestJson('/api/admin/change-password', {
      method: 'POST',
      token: tenant2Token,
      body: { currentPassword: 'ErablesPassword2026!', newPassword: 'NewPassword2026!' },
    });
    assert.equal(okPwChange.status, 200);

    const reloginNewPw = await requestJson('/api/admin/login', {
      method: 'POST',
      body: { email: 'admin@erables.ca', password: 'NewPassword2026!' },
    });
    assert.equal(reloginNewPw.status, 200);

    // Nettoyage du tenant 2 par le SuperAdmin
    const delTenant2 = await requestJson(`/api/superadmin/tenants/${tenant2Id}`, {
      method: 'DELETE',
      token: superAdminToken,
    });
    assert.equal(delTenant2.status, 200);
  });

  it('rejette les charges utiles invalides et GeoJSON malformés via Zod (400)', async () => {
    const badPoint = await requestJson<{ error: string }>('/api/public/donation-points', {
      method: 'POST',
      body: { address: 'ab', lat: 200, lng: -73.5 },
    });
    assert.equal(badPoint.status, 400);

    const badSector = await requestJson<{ error: string }>('/api/admin/sectors', {
      method: 'POST',
      token: superAdminToken,
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
      token: superAdminToken,
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
      token: superAdminToken,
      body: { isDonorFormOpen: true, isVolunteerFormOpen: true },
    });
    assert.equal(reopenForms.status, 200);
  });

  it('gère les polygones de secteur, la détection Turf.js, le recalcul lors de l’édition et la suppression', async () => {
    const createNorth = await requestJson<{
      sector: { id: string; name: string; accessToken: string };
    }>('/api/admin/sectors', {
      method: 'POST',
      token: superAdminToken,
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

    const expandRes = await requestJson<{
      recalculation: { assignedCount: number; outOfSectorCount: number; updatedCount: number };
    }>(`/api/admin/sectors/${northSectorId}`, {
      method: 'PATCH',
      token: superAdminToken,
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

    const tempSectorRes = await requestJson<{ sector: { id: string } }>('/api/admin/sectors', {
      method: 'POST',
      token: superAdminToken,
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
      token: superAdminToken,
    });
    assert.equal(delSouth.status, 200);
    assert.equal(delSouth.data.recalculation.outOfSectorCount, 1);

    const adminData = await requestJson<{
      donationPoints: Array<{ id: string; sectorId: string | null }>;
    }>('/api/admin/campaign', { token: superAdminToken });
    const pt2 = adminData.data.donationPoints.find((p) => p.id === secondPointId);
    assert.equal(pt2?.sectorId, northSectorId);
  });

  it('inscrit et assigne des bénévoles, génère les courriels HTML, isole la vue terrain et purge les données Loi 25', async () => {
    const adminBefore = await requestJson<{
      sectors: Array<{ id: string; name: string; accessToken: string }>;
      donationPoints: Array<{ id: string; sectorId: string | null }>;
    }>('/api/admin/campaign', { token: superAdminToken });

    const northSector = adminBefore.data.sectors[0];
    assert.ok(northSector);
    const northPoints = adminBefore.data.donationPoints.filter(
      (p) => p.sectorId === northSector.id
    );
    const outsidePoint = adminBefore.data.donationPoints.find((p) => p.sectorId === null);
    assert.ok(northPoints.length === 2);
    assert.ok(outsidePoint);

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

    const assign1 = await requestJson(`/api/admin/volunteers/${v1.data.volunteer.id}`, {
      method: 'PATCH',
      token: superAdminToken,
      body: { sectorId: northSector.id },
    });
    const assign2 = await requestJson(`/api/admin/volunteers/${v2.data.volunteer.id}`, {
      method: 'PATCH',
      token: superAdminToken,
      body: { sectorId: northSector.id },
    });
    assert.equal(assign1.status, 200);
    assert.equal(assign2.status, 200);

    const sampleEmail = buildSectorDispatchEmail({
      campaignName: 'Collecte École',
      campaignCity: 'Montréal',
      sectorName: northSector.name,
      sectorColor: '#2563EB',
      volunteerName: 'Camille Gagnon',
      teammates: [{ id: v2.data.volunteer.id, fullName: 'Lucas Bouchard', phone: '514-555-0222' }],
      fieldUrl: `https://collecte.exemple.ca/terrain/${northSector.accessToken}`,
      pointsCount: northPoints.length,
    });
    assert.match(sampleEmail.html, /Secteur Nord/);
    assert.match(sampleEmail.html, /Lucas Bouchard/);
    assert.ok(sampleEmail.html.includes(`/terrain/${northSector.accessToken}`));

    const dispatchRes = await requestJson<{
      mode: string;
      simulatedCount: number;
      details: Array<{ fieldUrl: string }>;
    }>('/api/admin/campaign/dispatch-emails', {
      method: 'POST',
      token: superAdminToken,
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'collecte.exemple.ca',
      },
    });
    assert.equal(dispatchRes.status, 200);
    assert.equal(dispatchRes.data.mode, 'simulated');
    assert.equal(dispatchRes.data.simulatedCount, 2);
    assert.ok(
      dispatchRes.data.details.every(
        (d) => d.fieldUrl === `https://collecte.exemple.ca/terrain/${northSector.accessToken}`
      )
    );

    const invalidField = await requestJson('/api/field/00000000-0000-4000-8000-000000000000');
    assert.equal(invalidField.status, 404);

    const validField = await requestJson<{
      sector: { id: string; name: string };
      teammates: Array<{ fullName: string }>;
      points: Array<{ id: string; status: string }>;
    }>(`/api/field/${northSector.accessToken}`);
    assert.equal(validField.status, 200);
    assert.equal(validField.data.points.length, 2);
    assert.equal(validField.data.teammates.length, 2);

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

    const crossSectorUpdate = await requestJson(
      `/api/field/${northSector.accessToken}/points/${outsidePoint.id}/status`,
      { method: 'PATCH', body: { status: 'COLLECTED' } }
    );
    assert.equal(crossSectorUpdate.status, 404);

    const purgeBad = await requestJson('/api/admin/campaign/purge-pii', {
      method: 'POST',
      token: superAdminToken,
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
      token: superAdminToken,
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

    const oldTokenCheck = await requestJson(`/api/field/${northSector.accessToken}`);
    assert.equal(oldTokenCheck.status, 404);

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
