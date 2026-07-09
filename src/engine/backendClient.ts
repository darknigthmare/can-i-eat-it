import type { BackendHealth, LearnedDish, PublicDatabaseExport, PublicDishContribution, RestaurantMemory, ScanRecord } from '../types';

const DEFAULT_BACKEND_URL = 'http://localhost:4177';
const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const BACKEND_URL = (metaEnv?.VITE_CIEI_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, '');

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export function getBackendBaseUrl(): string {
  return BACKEND_URL;
}

export async function pingBackend(timeoutMs = 1400): Promise<BackendHealth | null> {
  return request<BackendHealth>('/health', { timeoutMs }).catch(() => null);
}

export async function fetchLearnedDishes(): Promise<LearnedDish[]> {
  const response = await request<{ items: LearnedDish[] }>('/api/learned-dishes');
  return response.items ?? [];
}

export async function pushLearnedDish(dish: LearnedDish): Promise<LearnedDish | null> {
  const response = await request<{ item: LearnedDish }>('/api/learned-dishes', {
    method: 'POST',
    body: dish,
  }).catch(() => null);
  return response?.item ?? null;
}

export async function deleteRemoteLearnedDish(id: string): Promise<boolean> {
  const response = await request<{ ok: boolean }>(`/api/learned-dishes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).catch(() => null);
  return Boolean(response?.ok);
}

export async function pushScanRecord(record: ScanRecord): Promise<boolean> {
  const response = await request<{ ok: boolean }>('/api/scans', {
    method: 'POST',
    body: record,
    timeoutMs: 2400,
  }).catch(() => null);
  return Boolean(response?.ok);
}

export async function fetchRestaurants(): Promise<RestaurantMemory[]> {
  const response = await request<{ items: RestaurantMemory[] }>('/api/restaurants');
  return response.items ?? [];
}


export async function searchRestaurantsRemote(query: string, city = '', limit = 80): Promise<RestaurantMemory[]> {
  const params = new URLSearchParams({ q: query, city, limit: String(limit) });
  const response = await request<{ items: RestaurantMemory[] }>(`/api/restaurants/search?${params.toString()}`, { timeoutMs: 3200 });
  return response.items ?? [];
}

export async function pushRestaurantMemory(restaurant: RestaurantMemory): Promise<RestaurantMemory | null> {
  const response = await request<{ item: RestaurantMemory }>('/api/restaurants', {
    method: 'POST',
    body: restaurant,
    timeoutMs: 2400,
  }).catch(() => null);
  return response?.item ?? null;
}


export async function fetchCommunityContributions(status = '', limit = 300): Promise<PublicDishContribution[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  const response = await request<{ items: PublicDishContribution[] }>(`/api/contributions?${params.toString()}`);
  return response.items ?? [];
}

export async function pushCommunityContribution(contribution: PublicDishContribution): Promise<PublicDishContribution | null> {
  const response = await request<{ item: PublicDishContribution }>('/api/contributions', {
    method: 'POST',
    body: contribution,
    timeoutMs: 3200,
  }).catch(() => null);
  return response?.item ?? null;
}

export async function updateContributionStatus(
  id: string,
  status: PublicDishContribution['status'],
  moderationNotes = '',
  trustScore?: number,
): Promise<PublicDishContribution | null> {
  const response = await request<{ item: PublicDishContribution }>(`/api/contributions/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: { status, moderationNotes, trustScore },
    timeoutMs: 3200,
  }).catch(() => null);
  return response?.item ?? null;
}

export async function fetchPublicDatabase(): Promise<PublicDatabaseExport | null> {
  return await request<PublicDatabaseExport>('/api/public-db', { timeoutMs: 4500 }).catch(() => null);
}

export async function searchPublicDatabase(query: string): Promise<PublicDishContribution[]> {
  const params = new URLSearchParams({ q: query, limit: '80' });
  const response = await request<{ items: PublicDishContribution[] }>(`/api/public-db/search?${params.toString()}`, { timeoutMs: 4500 });
  return response.items ?? [];
}

async function request<T>(path: string, options: { method?: HttpMethod; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Backend HTTP ${response.status}`);
    }

    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}
