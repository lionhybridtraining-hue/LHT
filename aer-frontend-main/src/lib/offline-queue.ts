import type { LogSetPayload } from "@/services/athlete-strength";
import { submitSetsApi } from "@/services/athlete-strength";

export interface QueuedSubmission {
  plan_id: string;
  session_id?: string;
  sets: LogSetPayload[];
  _retries?: number;
}

const QUEUE_KEY = "lht_pending_sets";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function notify(): void {
  const count = getPendingCount();
  listeners.forEach((fn) => fn(count));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPendingCount(): number {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return 0;
    return (JSON.parse(raw) as QueuedSubmission[]).length;
  } catch {
    return 0;
  }
}

function readQueue(): QueuedSubmission[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedSubmission[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedSubmission[]): void {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(QUEUE_KEY);
    } else {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
  } catch {
    // Storage full — silently ignore
  }
}

export function enqueue(payload: QueuedSubmission): void {
  const queue = readQueue();
  queue.push({ ...payload, _retries: 0 });
  writeQueue(queue);
  notify();
}

let flushing = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const queue = readQueue();
    if (queue.length === 0) return;
    const remaining: QueuedSubmission[] = [];

    for (const item of queue) {
      try {
        await submitSetsApi({
          plan_id: item.plan_id,
          session_id: item.session_id,
          sets: item.sets,
        });
        // Success — item is consumed
      } catch {
        const retries = (item._retries ?? 0) + 1;
        if (retries < MAX_RETRIES) {
          remaining.push({ ...item, _retries: retries });
          // Exponential backoff before next attempt within this flush
          await delay(BASE_DELAY_MS * Math.pow(2, retries - 1));
        }
        // If max retries exceeded, item is dropped (data loss prevention: it was best-effort)
        break; // Stop on first failure to preserve order
      }
    }

    // Keep remaining items + any unprocessed items after the break
    if (remaining.length > 0) {
      const failedIndex = queue.indexOf(
        queue.find((q) => q === remaining[0]) ?? queue[0]
      );
      const unprocessed = queue.slice(failedIndex + 1);
      writeQueue([...remaining, ...unprocessed]);
    } else {
      writeQueue([]);
    }
  } finally {
    flushing = false;
    notify();
  }
}

// Auto-flush when connection restores
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flush();
  });

  // Flush on app start if items are pending
  if (document.readyState === "complete") {
    flush();
  } else {
    window.addEventListener("load", () => flush(), { once: true });
  }
}
