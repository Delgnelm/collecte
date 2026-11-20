import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface EmailTeammate {
  id: string;
  fullName: string;
  phone: string;
}

export interface BuildSectorEmailInput {
  campaignName: string;
  campaignCity: string;
  sectorName: string;
  sectorColor: string;
  volunteerName: string;
  teammates: EmailTeammate[];
  fieldUrl: string;
  pointsCount: number;
}

export function buildSectorDispatchEmail(input: BuildSectorEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const safeCampaign = escapeHtml(input.campaignName);
  const safeCity = escapeHtml(input.campaignCity);
  const safeSector = escapeHtml(input.sectorName);
  const safeColor = /^#[0-9A-Fa-f]{6}$/.test(input.sectorColor) ? input.sectorColor : '#1E3A8A';
  const safeVolunteer = escapeHtml(input.volunteerName);
  const safeUrl = escapeHtml(input.fieldUrl);

  const teammatesHtml =
    input.teammates.length > 0
      ? input.teammates
          .map(
            (t) =>
              `<li style="margin-bottom:6px;"><strong>${escapeHtml(t.fullName)}</strong>${
                t.phone ? ` — <span style="color:#475569;">${escapeHtml(t.phone)}</span>` : ''
              }</li>`
          )
          .join('')
      : '<li style="color:#64748b;">Vous êtes actuellement le seul bénévole assigné à ce secteur.</li>';

  const teammatesText =
    input.teammates.length > 0
      ? input.teammates.map((t) => `- ${t.fullName}${t.phone ? ` (${t.phone})` : ''}`).join('\n')
      : '- Aucun autre coéquipier assigné pour le moment.';

  const subject = `[${input.campaignName}] Votre parcours terrain — ${input.sectorName}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background-color:#1e3a8a;padding:24px 28px;color:#ffffff;">
              <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#bfdbfe;">Feuille de route bénévole</p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;">${safeCampaign}</h1>
              <p style="margin:6px 0 0 0;font-size:14px;color:#dbeafe;">${safeCity}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px 0;font-size:16px;">Bonjour <strong>${safeVolunteer}</strong>,</p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.5;color:#334155;">
                Merci de votre précieuse aide pour la collecte porte-à-porte ! Voici votre secteur assigné ainsi que le lien sécurisé vers votre carte terrain interactive.
              </p>

              <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-left:6px solid ${safeColor};border-radius:10px;padding:16px 18px;margin-bottom:22px;">
                <p style="margin:0 0 4px 0;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;">Votre secteur</p>
                <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${safeSector}</p>
                <p style="margin:6px 0 0 0;font-size:14px;color:#475569;">${input.pointsCount} point(s) de cueillette actuellement répertorié(s)</p>
              </div>

              <div style="text-align:center;margin:26px 0;">
                <a href="${safeUrl}" style="display:inline-block;background-color:#1e3a8a;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:10px;">
                  Ouvrir ma carte terrain
                </a>
              </div>

              <p style="margin:0 0 22px 0;font-size:12px;color:#64748b;word-break:break-all;text-align:center;">
                Lien direct : <a href="${safeUrl}" style="color:#2563eb;">${safeUrl}</a>
              </p>

              <h2 style="margin:0 0 10px 0;font-size:15px;color:#0f172a;">Vos coéquipiers du secteur</h2>
              <ul style="margin:0 0 22px 0;padding-left:18px;font-size:14px;line-height:1.6;color:#1e293b;">
                ${teammatesHtml}
              </ul>

              <div style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;font-size:13px;line-height:1.5;color:#1e40af;">
                <strong>Astuce terrain (Hors-ligne) :</strong> Ouvrez ce lien sur votre téléphone avant de partir sur la route pour mettre automatiquement la carte et les adresses en cache sur votre appareil, même en cas de perte de réseau cellulaire.
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
              Ce lien personnel est strictement réservé aux bénévoles de votre secteur. Merci de ne pas le partager publiquement.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `${input.campaignName} (${input.campaignCity})`,
    '',
    `Bonjour ${input.volunteerName},`,
    '',
    `Votre secteur assigné : ${input.sectorName} (${input.pointsCount} point(s) de cueillette)`,
    `Lien sécurisé vers votre carte terrain : ${input.fieldUrl}`,
    '',
    'Vos coéquipiers du secteur :',
    teammatesText,
    '',
    'Astuce : ouvrez le lien avant le départ pour activer le mode hors-ligne de la PWA.',
  ].join('\n');

  return { subject, html, text };
}

export interface EmailDispatchDetail {
  sectorId: string;
  sectorName: string;
  volunteerId: string;
  volunteerName: string;
  email: string;
  fieldUrl: string;
  status: 'sent' | 'simulated' | 'failed';
  error?: string;
}

export interface EmailDispatchResult {
  mode: 'smtp' | 'simulated';
  totalAttempted: number;
  sentCount: number;
  simulatedCount: number;
  failedCount: number;
  details: EmailDispatchDetail[];
}

function createSmtpTransport(): Transporter | null {
  if (env.SMTP_DRY_RUN || !env.SMTP_HOST) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        }
      : undefined,
  });
}

function resolveEffectiveBaseUrl(requestBaseUrl?: string): string {
  const configured = env.APP_BASE_URL;
  const isLocalConfigured = !configured || configured.includes('localhost') || configured.includes('127.0.0.1');
  if (isLocalConfigured && requestBaseUrl) {
    return requestBaseUrl.replace(/\/+$/, '');
  }
  return configured || requestBaseUrl?.replace(/\/+$/, '') || 'http://localhost:5173';
}

async function dispatchForSectors(
  sectorIds: string[],
  requestBaseUrl?: string
): Promise<EmailDispatchResult> {
  const sectors = await prisma.sector.findMany({
    where: { id: { in: sectorIds } },
    include: {
      campaign: true,
      volunteers: {
        where: { isAnonymized: false },
        orderBy: { fullName: 'asc' },
      },
      _count: {
        select: {
          donationPoints: {
            where: { isAnonymized: false },
          },
        },
      },
    },
  });

  const transporter = createSmtpTransport();
  const mode: 'smtp' | 'simulated' = transporter ? 'smtp' : 'simulated';
  const details: EmailDispatchDetail[] = [];
  let sentCount = 0;
  let simulatedCount = 0;
  let failedCount = 0;
  const notifiedVolunteerIds: string[] = [];
  const baseUrl = resolveEffectiveBaseUrl(requestBaseUrl);

  for (const sector of sectors) {
    const fieldUrl = `${baseUrl}/terrain/${sector.accessToken}`;

    for (const volunteer of sector.volunteers) {
      const teammates = sector.volunteers
        .filter((v) => v.id !== volunteer.id)
        .map((v) => ({
          id: v.id,
          fullName: v.fullName,
          phone: v.phone,
        }));

      const emailContent = buildSectorDispatchEmail({
        campaignName: sector.campaign.name,
        campaignCity: sector.campaign.city,
        sectorName: sector.name,
        sectorColor: sector.color,
        volunteerName: volunteer.fullName,
        teammates,
        fieldUrl,
        pointsCount: sector._count.donationPoints,
      });

      if (!transporter) {
        console.log(
          `[EMAIL SIMULATION] À: ${volunteer.email} | Secteur: ${sector.name} | Lien: ${fieldUrl}`
        );
        simulatedCount += 1;
        notifiedVolunteerIds.push(volunteer.id);
        details.push({
          sectorId: sector.id,
          sectorName: sector.name,
          volunteerId: volunteer.id,
          volunteerName: volunteer.fullName,
          email: volunteer.email,
          fieldUrl,
          status: 'simulated',
        });
        continue;
      }

      try {
        await transporter.sendMail({
          from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
          to: volunteer.email,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
        });
        sentCount += 1;
        notifiedVolunteerIds.push(volunteer.id);
        details.push({
          sectorId: sector.id,
          sectorName: sector.name,
          volunteerId: volunteer.id,
          volunteerName: volunteer.fullName,
          email: volunteer.email,
          fieldUrl,
          status: 'sent',
        });
      } catch (error) {
        failedCount += 1;
        details.push({
          sectorId: sector.id,
          sectorName: sector.name,
          volunteerId: volunteer.id,
          volunteerName: volunteer.fullName,
          email: volunteer.email,
          fieldUrl,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Erreur SMTP inconnue',
        });
      }
    }
  }

  if (notifiedVolunteerIds.length > 0) {
    await prisma.volunteer.updateMany({
      where: { id: { in: notifiedVolunteerIds } },
      data: { lastNotifiedAt: new Date() },
    });
  }

  return {
    mode,
    totalAttempted: details.length,
    sentCount,
    simulatedCount,
    failedCount,
    details,
  };
}

export async function sendSectorEmails(
  sectorId: string,
  baseUrl?: string
): Promise<EmailDispatchResult> {
  return dispatchForSectors([sectorId], baseUrl);
}

export async function sendCampaignEmails(
  campaignId: string,
  baseUrl?: string
): Promise<EmailDispatchResult> {
  const sectors = await prisma.sector.findMany({
    where: { campaignId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (sectors.length === 0) {
    return {
      mode: env.SMTP_DRY_RUN || !env.SMTP_HOST ? 'simulated' : 'smtp',
      totalAttempted: 0,
      sentCount: 0,
      simulatedCount: 0,
      failedCount: 0,
      details: [],
    };
  }

  return dispatchForSectors(
    sectors.map((s) => s.id),
    baseUrl
  );
}
