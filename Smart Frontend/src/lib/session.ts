const TOKEN_STORAGE_KEY = 'token';
const USER_STORAGE_KEY = 'user';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  optOutNudges?: boolean;
}

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.email === 'string' &&
    (candidate.optOutNudges === undefined || typeof candidate.optOutNudges === 'boolean')
  );
}

export function readStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function isTokenValid(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function readStoredUser(): SessionUser | null {
  const rawUser = localStorage.getItem(USER_STORAGE_KEY);

  if (!rawUser) return null;

  try {
    const parsedUser = JSON.parse(rawUser);
    return isSessionUser(parsedUser) ? parsedUser : null;
  } catch {
    return null;
  }
}

export function writeStoredUser(user: SessionUser): void {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
}

export function clearStoredSession(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  clearStoredUser();
}

export function hasStoredSession(): boolean {
  const token = readStoredToken();
  return Boolean(token && isTokenValid(token));
}
