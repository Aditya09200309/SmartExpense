const DEMO_NAME_MAP: Record<string, string> = {
  'user 1': 'Rahul',
  'user 2': 'Arjun',
  'user 3': 'Amit',
};

export function normalizeDisplayName(name: string | null | undefined): string {
  if (!name) return '';
  const normalizedKey = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return DEMO_NAME_MAP[normalizedKey] ?? name;
}
