import { getAccessToken } from "@/lib/supabase";

const API_BASE = "/.netlify/functions";
const SESSION_KEY_PREFIX = "lht-record-login";

export async function recordLoginEvent() {
  const token = await getAccessToken();
  if (!token) return;

  const res = await fetch(`${API_BASE}/record-login`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload && payload.error ? payload.error : `record-login failed (${res.status})`);
  }
}

export function hasRecordedLoginInSession(userId: string) {
  if (!userId) return false;
  return window.sessionStorage.getItem(`${SESSION_KEY_PREFIX}:${userId}`) === "1";
}

export function markLoginRecordedInSession(userId: string) {
  if (!userId) return;
  window.sessionStorage.setItem(`${SESSION_KEY_PREFIX}:${userId}`, "1");
}
