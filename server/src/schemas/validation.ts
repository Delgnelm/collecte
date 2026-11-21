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

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export type GeoJsonBoundary = GeoJsonPolygon | GeoJsonMultiPolygon;

function closeRing(ring: Array<[number, number]>): number[][] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const isClosed = first[0] === last[0] && first[1] === last[1];
  return isClosed ? ring : [...ring, [first[0], first[1]]];
}

function normalizePolygon(raw: z.infer<typeof rawPolygonSchema>): GeoJsonPolygon {
  return {
    type: 'Polygon',
    coordinates: raw.coordinates.map(closeRing),
  };
}

const rawBoundaryPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(coordinateSchema).min(3).max(5000)).min(1),
});

const rawBoundaryMultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(coordinateSchema).min(3).max(5000)).min(1)).min(1),
});

const rawBoundaryGeometrySchema = z.union([rawBoundaryPolygonSchema, rawBoundaryMultiPolygonSchema]);

const rawFeatureBoundarySchema = z.object({
  type: z.literal('Feature'),
  geometry: rawBoundaryGeometrySchema,
  properties: z.record(z.unknown()).optional().nullable(),
});

function countBoundaryVertices(boundary: GeoJsonBoundary): number {
  if (boundary.type === 'Polygon') {
    return boundary.coordinates.reduce((sum, ring) => sum + ring.length, 0);
  }
  return boundary.coordinates.reduce(
    (sum, poly) => sum + poly.reduce((pSum, ring) => pSum + ring.length, 0),
    0
  );
}

export const geoJsonBoundarySchema = z
  .union([rawBoundaryGeometrySchema, rawFeatureBoundarySchema])
  .transform((val): GeoJsonBoundary => {
    const geom = val.type === 'Feature' ? val.geometry : val;
    if (geom.type === 'Polygon') {
      return {
        type: 'Polygon',
        coordinates: geom.coordinates.map(closeRing),
      };
    }
    return {
      type: 'MultiPolygon',
      coordinates: geom.coordinates.map((poly) => poly.map(closeRing)),
    };
  })
  .refine(
    (boundary) => countBoundaryVertices(boundary) <= 5000,
    'La zone principale ne peut pas dépasser 5000 sommets'
  );

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
  boundaryGeoJson: geoJsonBoundarySchema.nullable().optional(),
  isDonorFormOpen: z.boolean().optional(),
  isVolunteerFormOpen: z.boolean().optional(),
});

export const createSectorSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: hexColorSchema.optional(),
  geoJsonPolygon: geoJsonPolygonSchema,
  clipToBoundary: z.boolean().optional(),
});

export const updateSectorSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(80).optional(),
  color: hexColorSchema.optional(),
  geoJsonPolygon: geoJsonPolygonSchema.optional(),
  clipToBoundary: z.boolean().optional(),
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

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Le slug doit contenir au moins 2 caractères')
  .max(60, 'Le slug ne peut pas dépasser 60 caractères')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Le slug ne peut contenir que des lettres minuscules, chiffres et tirets');

export const createTenantSchema = z.object({
  name: z.string().trim().min(2, 'Nom de l’organisation requis').max(120),
  slug: slugSchema,
  city: z.string().trim().min(2).max(140).optional(),
  campaignName: z.string().trim().min(2).max(140).optional(),
  centerLat: z.number().finite().min(-90).max(90).optional(),
  centerLng: z.number().finite().min(-180).max(180).optional(),
  adminEmail: z.string().trim().email('Courriel administrateur invalide').max(160).optional(),
  adminPassword: z
    .string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .max(120)
    .optional(),
  adminFullName: z.string().trim().min(2).max(120).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: slugSchema.optional(),
  isActive: z.boolean().optional(),
});

export const createTenantUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom complet requis').max(120),
  email: z.string().trim().email('Adresse courriel invalide').max(160),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').max(120),
});

export const updateTenantUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').max(120).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: z.string().min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères').max(120),
});
