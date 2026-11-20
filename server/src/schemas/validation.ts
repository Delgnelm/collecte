import { z } from 'zod';

const coordinateSchema = z
  .tuple([
    z.number().finite().min(-180, 'Longitude invalide').max(180, 'Longitude invalide'),
    z.number().finite().min(-90, 'Latitude invalide').max(90, 'Latitude invalide'),
  ]);

const rawPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z
    .array(
      z
        .array(coordinateSchema)
        .min(3, 'Un anneau de polygone doit contenir au moins 3 sommets')
        .max(500, 'Le polygone ne peut pas dépasser 500 sommets')
    )
    .min(1, 'Le polygone doit contenir au moins un anneau'),
});

const rawFeaturePolygonSchema = z.object({
  type: z.literal('Feature'),
  geometry: rawPolygonSchema,
  properties: z.record(z.unknown()).optional().nullable(),
});

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

function normalizePolygon(raw: z.infer<typeof rawPolygonSchema>): GeoJsonPolygon {
  const closedRings = raw.coordinates.map((ring) => {
    const first = ring[0];
    const last = ring[ring.length - 1];
    const isClosed = first[0] === last[0] && first[1] === last[1];
    const closed = isClosed ? ring : [...ring, [first[0], first[1]] as [number, number]];
    return closed;
  });

  return {
    type: 'Polygon',
    coordinates: closedRings,
  };
}

export const geoJsonPolygonSchema = z
  .union([rawPolygonSchema, rawFeaturePolygonSchema])
  .transform((val): GeoJsonPolygon => {
    const poly = val.type === 'Feature' ? val.geometry : val;
    return normalizePolygon(poly);
  })
  .refine(
    (poly) => poly.coordinates.every((ring) => ring.length >= 4 && ring.length <= 501),
    'Chaque anneau GeoJSON doit comporter au moins 4 coordonnées fermées (max 500 sommets)'
  );

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'La couleur doit être un code hexadécimal valide (ex: #2563EB)');

export const donationStatusSchema = z.enum(['PENDING', 'COLLECTED', 'ABSENT']);

export const loginSchema = z.object({
  email: z.string().trim().email('Adresse courriel invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const updateCampaignSchema = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(140, 'Nom trop long').optional(),
  city: z.string().trim().min(2, 'Ville requise').max(140, 'Ville trop longue').optional(),
  centerLat: z.number().finite().min(-90).max(90).optional(),
  centerLng: z.number().finite().min(-180).max(180).optional(),
  zoomLevel: z.number().int().min(3).max(19).optional(),
  isDonorFormOpen: z.boolean().optional(),
  isVolunteerFormOpen: z.boolean().optional(),
});

export const createSectorSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: hexColorSchema.optional(),
  geoJsonPolygon: geoJsonPolygonSchema,
});

export const updateSectorSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(80).optional(),
  color: hexColorSchema.optional(),
  geoJsonPolygon: geoJsonPolygonSchema.optional(),
});

export const createDonationPointSchema = z.object({
  address: z.string().trim().min(5, 'Veuillez sélectionner une adresse complète').max(260),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  donorName: z.string().trim().max(120).optional().nullable(),
  instructions: z.string().trim().max(400).optional().nullable(),
  preferredTimeSlot: z.string().trim().max(80).optional().nullable(),
});

export const createVolunteerSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom complet requis').max(120),
  email: z.string().trim().email('Adresse courriel invalide').max(160),
  phone: z
    .string()
    .trim()
    .min(7, 'Numéro de téléphone invalide')
    .max(30, 'Numéro de téléphone trop long'),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const updateVolunteerSchema = z.object({
  sectorId: z.string().cuid().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const updateDonationPointSchema = z.object({
  sectorId: z.string().cuid().nullable().optional(),
  status: donationStatusSchema.optional(),
  instructions: z.string().trim().max(400).nullable().optional(),
});

export const fieldStatusUpdateSchema = z.object({
  status: donationStatusSchema,
});

export const purgePiiSchema = z.object({
  confirmation: z.literal('PURGER', {
    errorMap: () => ({ message: 'Veuillez saisir exactement PURGER pour confirmer.' }),
  }),
});

export const uuidParamSchema = z.string().uuid('Jeton d’accès terrain invalide');
