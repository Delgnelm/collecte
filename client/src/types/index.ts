export type DonationStatus = 'PENDING' | 'COLLECTED' | 'ABSENT';
export type UserRole = 'SUPERADMIN' | 'TENANT_ADMIN';

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeocodingSuggestion {
  id: string;
  label: string;
  street?: string;
  houseNumber?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  lat: number;
  lng: number;
  extent?: [number, number, number, number];
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
}

export interface TenantAdminUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  users: TenantAdminUser[];
  campaign: {
    id: string;
    name: string;
    city: string;
    isDonorFormOpen: boolean;
    isVolunteerFormOpen: boolean;
    lastPurgedAt: string | null;
  } | null;
  stats: {
    usersCount: number;
    sectorsCount: number;
    volunteersCount: number;
    donationPointsCount: number;
    collectedPointsCount: number;
  };
}

export interface Campaign {
  id: string;
  tenantId?: string;
  name: string;
  city: string;
  centerLat: number;
  centerLng: number;
  zoomLevel: number;
  isDonorFormOpen: boolean;
  isVolunteerFormOpen: boolean;
  lastPurgedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicCampaignResponse {
  tenant: TenantInfo;
  campaign: Omit<Campaign, 'lastPurgedAt'>;
  stats: {
    totalPoints: number;
    totalSectors: number;
    totalVolunteers: number;
  };
}

export interface SectorPointStats {
  sectorId: string;
  sectorName: string;
  color: string;
  total: number;
  pending: number;
  collected: number;
  absent: number;
}

export interface Sector {
  id: string;
  campaignId: string;
  name: string;
  color: string;
  geoJsonPolygon: GeoJsonPolygon;
  accessToken: string;
  createdAt: string;
  updatedAt: string;
  volunteerCount?: number;
  pointStats?: SectorPointStats;
}

export interface Volunteer {
  id: string;
  campaignId: string;
  sectorId: string | null;
  fullName: string;
  email: string;
  phone: string;
  notes: string | null;
  isAnonymized: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
}

export interface DonationPoint {
  id: string;
  campaignId?: string;
  sectorId?: string | null;
  address: string;
  lat: number;
  lng: number;
  donorName: string | null;
  instructions: string | null;
  preferredTimeSlot: string | null;
  status: DonationStatus;
  isAnonymized?: boolean;
  updatedAt: string;
  createdAt?: string;
}

export interface AdminStats {
  global: {
    total: number;
    pending: number;
    collected: number;
    absent: number;
    outOfSector: number;
  };
  bySector: SectorPointStats[];
  totalActiveVolunteers: number;
  anonymizedPointsCount: number;
}

export interface AdminMeResponse {
  user: AuthUser;
  tenants: TenantInfo[];
}

export interface AdminCampaignResponse {
  tenant: TenantInfo;
  campaign: Campaign;
  sectors: Sector[];
  volunteers: Volunteer[];
  donationPoints: DonationPoint[];
  stats: AdminStats;
}

export interface RecalculationSummary {
  totalPoints: number;
  assignedCount: number;
  outOfSectorCount: number;
  updatedCount: number;
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

export interface FieldTeammate {
  id: string;
  fullName: string;
  phone: string;
}

export interface FieldPayload {
  campaign: {
    id: string;
    name: string;
    city: string;
    centerLat: number;
    centerLng: number;
    zoomLevel: number;
  };
  sector: {
    id: string;
    name: string;
    color: string;
    geoJsonPolygon: GeoJsonPolygon;
  };
  teammates: FieldTeammate[];
  points: DonationPoint[];
}

export interface PurgeResult {
  message: string;
  purgedAt: string;
  anonymizedPointsCount: number;
  anonymizedVolunteersCount: number;
  rotatedTokensCount: number;
  preservedStats: {
    global: AdminStats['global'];
    bySector: SectorPointStats[];
  };
}
