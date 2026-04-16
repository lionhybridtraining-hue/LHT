import { getAccessToken } from '@/lib/supabase';

const API_BASE = '/.netlify/functions';

export interface AthleteProfileCompletion {
  missingOnboarding: string[];
  missingPersonal: string[];
  onboardingComplete: boolean;
  personalComplete: boolean;
}

export interface AthleteProfileData {
  athlete: {
    id: string;
    email: string;
    name: string | null;
    dateOfBirth: string | null;
    heightCm: number | null;
    weightKg: number | null;
    sex: 'male' | 'female' | 'other' | null;
    strengthLevel: 'beginner' | 'intermediate' | 'advanced' | null;
    gymAccess: 'full_gym' | 'limited_equipment' | 'no_gym';
  };
  onboarding: {
    fullName: string | null;
    phone: string | null;
    goalDistance: number | null;
    weeklyFrequency: number | null;
    experienceLevel: string | null;
    consistencyLevel: string | null;
  };
  completion: AthleteProfileCompletion;
  profileComplete: boolean;
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

export function fetchAthleteProfile(): Promise<AthleteProfileData> {
  return apiFetch('/athlete-profile');
}

export function saveAthleteProfile(payload: {
  fullName: string;
  phone: string;
  goalDistance?: number;
  weeklyFrequency?: number;
  experienceLevel?: string;
  consistencyLevel?: string;
  dateOfBirth: string;
  heightCm: number;
  weightKg: number;
  sex: 'male' | 'female' | 'other';
  strengthLevel?: 'beginner' | 'intermediate' | 'advanced' | null;
  gymAccess?: 'full_gym' | 'limited_equipment' | 'no_gym';
}): Promise<AthleteProfileData> {
  return apiFetch('/athlete-profile', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
