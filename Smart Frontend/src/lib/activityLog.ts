const STORAGE_KEY = 'se:activity';
const MAX_ENTRIES = 50;

export type ActivityEvent =
  | {
      type: 'expense';
      id: string;
      groupId: string;
      groupName: string;
      description: string;
      amount: number;
      timestamp: number;
    }
  | {
      type: 'settlement';
      id: string;
      groupId: string;
      groupName: string;
      receiverName: string;
      amount: number;
      timestamp: number;
    };

export function logActivity(userId: string, event: ActivityEvent): void {
  const key = `${STORAGE_KEY}:${userId}`;
  const existing = readRaw(key);
  const updated = [event, ...existing].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {
    // Storage quota exceeded — silently discard
  }
  window.dispatchEvent(new Event('se:activity'));
}

export function getActivity(userId: string): ActivityEvent[] {
  return readRaw(`${STORAGE_KEY}:${userId}`);
}

function readRaw(key: string): ActivityEvent[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ActivityEvent[]) : [];
  } catch {
    return [];
  }
}
