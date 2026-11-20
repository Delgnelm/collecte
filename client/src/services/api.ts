import type {
  AdminCampaignResponse,
  AdminMeResponse,
  AuthUser,
  Campaign,
  DonationPoint,
  DonationStatus,
  EmailDispatchResult,
  FieldPayload,
  GeocodingSuggestion,
  GeoJsonPolygon,
  PublicCampaignResponse,
  PurgeResult,
  RecalculationSummary,
  Sector,
  TenantAdminUser,
  TenantInfo,
  TenantSummary,
  Volunteer,
} from '../types';

const TOKEN_STORAGE_KEY = 'collecte_admin_token';
const SELECTED_TENANT_KEY = 'collecte_selected_tenant_id';

export class ApiError extends Error {
  readonly status: number;
  readonly details?: Array<{ field: string; message: string }>;

  constructor(
    status: number,
    message: string,
    details?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = 'ApiError';
  }
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function getSelectedTenantId(): string | null {
  try {
    return localStorage.getItem(SELECTED_TENANT_KEY);
  } catch {
    return null;
  }
}

export function setSelectedTenantId(tenantId: string | null): void {
  try {
    if (tenantId) {
      localStorage.setItem(SELECTED_TENANT_KEY, tenantId);
    } else {
      localStorage.removeItem(SELECTED_TENANT_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = false, headers: customHeaders, ...rest } = options;
  const headers = new Headers(customHeaders);

  if (rest.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth) {
    const token = getAdminToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const selectedTenant = getSelectedTenantId();
    if (selectedTenant) {
      headers.set('X-Tenant-Id', selectedTenant);
    }
  }

  const response = await fetch(path, {
    ...rest,
    headers,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    if (auth && response.status === 401) {
      setAdminToken(null);
    }
    const message = payload?.error || `Erreur HTTP ${response.status}`;
    throw new ApiError(response.status, message, payload?.details);
  }

  return payload as T;
}

export const api = {
  // Public
  getPublicCampaign(tenantSlug?: string) {
    const path = tenantSlug
      ? `/api/public/tenants/${encodeURIComponent(tenantSlug)}/campaign`
      : '/api/public/campaign';
    return request<PublicCampaignResponse>(path);
  },

  submitDonationPoint(
    data: {
      address: string;
      lat: number;
      lng: number;
      donorName?: string;
      instructions?: string;
      preferredTimeSlot?: string;
    },
    tenantSlug?: string
  ) {
    const path = tenantSlug
      ? `/api/public/tenants/${encodeURIComponent(tenantSlug)}/donation-points`
      : '/api/public/donation-points';
    return request<{
      point: DonationPoint;
      inSector: boolean;
      sectorName: string | null;
      message: string;
    }>(path, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  submitVolunteer(
    data: {
      fullName: string;
      email: string;
      phone: string;
      notes?: string;
    },
    tenantSlug?: string
  ) {
    const path = tenantSlug
      ? `/api/public/tenants/${encodeURIComponent(tenantSlug)}/volunteers`
      : '/api/public/volunteers';
    return request<{
      volunteer: { id: string; fullName: string };
      message: string;
    }>(path, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Geocoding
  searchAddresses(q: string, bias?: { lat: number; lng: number }) {
    const params = new URLSearchParams({ q });
    if (bias) {
      params.set('lat', String(bias.lat));
      params.set('lng', String(bias.lng));
    }
    return request<{ provider: string; suggestions: GeocodingSuggestion[] }>(
      `/api/geocode/search?${params.toString()}`
    );
  },

  searchCities(q: string) {
    const params = new URLSearchParams({ q });
    return request<{ provider: string; suggestions: GeocodingSuggestion[] }>(
      `/api/geocode/cities?${params.toString()}`
    );
  },

  // Field
  getFieldData(accessToken: string) {
    return request<FieldPayload>(`/api/field/${encodeURIComponent(accessToken)}`);
  },

  updateFieldPointStatus(accessToken: string, pointId: string, status: DonationStatus) {
    return request<{ point: DonationPoint }>(
      `/api/field/${encodeURIComponent(accessToken)}/points/${encodeURIComponent(pointId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    );
  },

  // Admin Auth & Profile
  adminLogin(email: string, password: string) {
    return request<{ token: string; user: AuthUser }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  getAdminMe() {
    return request<AdminMeResponse>('/api/admin/me', { auth: true });
  },

  changePassword(currentPassword: string, newPassword: string) {
    return request<{ message: string }>('/api/admin/change-password', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  // SuperAdmin Tenants
  getTenants() {
    return request<{ tenants: TenantSummary[] }>('/api/superadmin/tenants', { auth: true });
  },

  createTenant(data: {
    name: string;
    slug: string;
    city?: string;
    centerLat?: number;
    centerLng?: number;
    campaignName?: string;
    adminEmail?: string;
    adminPassword?: string;
    adminFullName?: string;
  }) {
    return request<{ tenant: TenantInfo; campaign: Campaign; adminUser: TenantAdminUser | null }>(
      '/api/superadmin/tenants',
      {
        method: 'POST',
        auth: true,
        body: JSON.stringify(data),
      }
    );
  },

  updateTenant(tenantId: string, data: { name?: string; slug?: string; isActive?: boolean }) {
    return request<{ tenant: TenantInfo }>(
      `/api/superadmin/tenants/${encodeURIComponent(tenantId)}`,
      {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify(data),
      }
    );
  },

  deleteTenant(tenantId: string) {
    return request<{ deletedId: string }>(
      `/api/superadmin/tenants/${encodeURIComponent(tenantId)}`,
      {
        method: 'DELETE',
        auth: true,
      }
    );
  },

  createTenantUser(
    tenantId: string,
    data: { fullName: string; email: string; password: string }
  ) {
    return request<{ user: TenantAdminUser }>(
      `/api/superadmin/tenants/${encodeURIComponent(tenantId)}/users`,
      {
        method: 'POST',
        auth: true,
        body: JSON.stringify(data),
      }
    );
  },

  updateTenantUser(
    userId: string,
    data: { fullName?: string; isActive?: boolean; password?: string }
  ) {
    return request<{ user: TenantAdminUser }>(
      `/api/superadmin/users/${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify(data),
      }
    );
  },

  deleteTenantUser(userId: string) {
    return request<{ deletedId: string }>(
      `/api/superadmin/users/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        auth: true,
      }
    );
  },

  // Tenant Admin Campaign
  getAdminCampaign() {
    return request<AdminCampaignResponse>('/api/admin/campaign', { auth: true });
  },

  updateCampaign(data: Partial<Campaign>) {
    return request<{ campaign: Campaign }>('/api/admin/campaign', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(data),
    });
  },

  createSector(data: { name?: string; color?: string; geoJsonPolygon: GeoJsonPolygon }) {
    return request<{ sector: Sector; recalculation: RecalculationSummary }>('/api/admin/sectors', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(data),
    });
  },

  updateSector(
    sectorId: string,
    data: { name?: string; color?: string; geoJsonPolygon?: GeoJsonPolygon }
  ) {
    return request<{ sector: Sector; recalculation: RecalculationSummary | null }>(
      `/api/admin/sectors/${encodeURIComponent(sectorId)}`,
      {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify(data),
      }
    );
  },

  deleteSector(sectorId: string) {
    return request<{ deletedId: string; recalculation: RecalculationSummary }>(
      `/api/admin/sectors/${encodeURIComponent(sectorId)}`,
      {
        method: 'DELETE',
        auth: true,
      }
    );
  },

  rotateSectorToken(sectorId: string) {
    return request<{ sector: Sector }>(
      `/api/admin/sectors/${encodeURIComponent(sectorId)}/rotate-token`,
      {
        method: 'POST',
        auth: true,
      }
    );
  },

  recalculateAssignments() {
    return request<{ recalculation: RecalculationSummary }>('/api/admin/campaign/recalculate', {
      method: 'POST',
      auth: true,
    });
  },

  updateVolunteer(volunteerId: string, data: { sectorId?: string | null; notes?: string | null }) {
    return request<{ volunteer: Volunteer }>(
      `/api/admin/volunteers/${encodeURIComponent(volunteerId)}`,
      {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify(data),
      }
    );
  },

  deleteVolunteer(volunteerId: string) {
    return request<{ deletedId: string }>(
      `/api/admin/volunteers/${encodeURIComponent(volunteerId)}`,
      {
        method: 'DELETE',
        auth: true,
      }
    );
  },

  updateDonationPoint(
    pointId: string,
    data: { sectorId?: string | null; status?: DonationStatus; instructions?: string | null }
  ) {
    return request<{ point: DonationPoint }>(
      `/api/admin/donation-points/${encodeURIComponent(pointId)}`,
      {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify(data),
      }
    );
  },

  deleteDonationPoint(pointId: string) {
    return request<{ deletedId: string }>(
      `/api/admin/donation-points/${encodeURIComponent(pointId)}`,
      {
        method: 'DELETE',
        auth: true,
      }
    );
  },

  dispatchAllEmails() {
    return request<EmailDispatchResult>('/api/admin/campaign/dispatch-emails', {
      method: 'POST',
      auth: true,
    });
  },

  dispatchSectorEmails(sectorId: string) {
    return request<EmailDispatchResult>(
      `/api/admin/sectors/${encodeURIComponent(sectorId)}/dispatch-emails`,
      {
        method: 'POST',
        auth: true,
      }
    );
  },

  purgePii() {
    return request<PurgeResult>('/api/admin/campaign/purge-pii', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ confirmation: 'PURGER' }),
    });
  },
};
