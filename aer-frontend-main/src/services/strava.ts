import { getAccessToken } from '@/lib/supabase';

const API_BASE = '/.netlify/functions';

export interface StravaStatusData {
  connected: boolean;
  athleteId: string;
  stravaAthleteId?: number;
  scope?: string | null;
  tokenExpiresAt?: string | null;
  lastSyncAt?: string | null;
}

export interface StravaSyncData {
  athleteId: string;
  activitiesFetched: number;
  sessionsUpserted: number;
  syncedAt: string;
  tokenRefreshed: boolean;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.error || `API error ${res.status}`);
  }

  return payload as T;
}

export function getStravaStatus(): Promise<StravaStatusData> {
  return apiFetch('/strava-status');
}

export async function getStravaConnectUrl(): Promise<string> {
  const response = await apiFetch<{ authorizeUrl: string }>('/strava-connect');
  return response.authorizeUrl;
}

export function syncStrava(afterUnixSeconds?: number): Promise<StravaSyncData> {
  const body = Number.isFinite(afterUnixSeconds)
    ? { afterUnixSeconds: Math.floor(afterUnixSeconds as number) }
    : {};

  return apiFetch('/strava-sync', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
