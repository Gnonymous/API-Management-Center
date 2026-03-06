import type { ConfigApiKeyItem } from '@/types/config';

const API_KEY_NAME_STORAGE_KEY = 'config-management:api-key-names:v1';

const normalizeText = (value: unknown): string => String(value ?? '').trim();

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

export function getApiKeyNameFingerprint(apiKey: string): string {
  const normalized = normalizeText(apiKey);
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= BigInt(normalized.charCodeAt(index));
    hash = (hash * FNV_PRIME) & 0xffffffffffffffffn;
  }

  return hash.toString(16).padStart(16, '0');
}

export function loadStoredApiKeyNameMap(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};

  try {
    const raw = localStorage.getItem(API_KEY_NAME_STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.entries(parsed as Record<string, unknown>).reduce<Record<string, string>>(
      (acc, [fingerprint, value]) => {
        const name = normalizeText(value);
        if (!name) return acc;
        acc[fingerprint] = name;
        return acc;
      },
      {}
    );
  } catch {
    return {};
  }
}

export function getStoredApiKeyName(apiKey: string): string {
  const normalized = normalizeText(apiKey);
  if (!normalized) return '';

  const map = loadStoredApiKeyNameMap();
  return map[getApiKeyNameFingerprint(normalized)] ?? '';
}

export function saveStoredApiKeyNames(
  items: Array<{ apiKey?: string; name?: string }>
): boolean {
  if (typeof localStorage === 'undefined') return false;

  const previousRaw = localStorage.getItem(API_KEY_NAME_STORAGE_KEY) ?? '';

  const nextMap = items.reduce<Record<string, string>>((acc, item) => {
    const apiKey = normalizeText(item.apiKey);
    const name = normalizeText(item.name);
    if (!apiKey || !name) return acc;
    acc[getApiKeyNameFingerprint(apiKey)] = name;
    return acc;
  }, {});

  try {
    if (Object.keys(nextMap).length === 0) {
      const changed = previousRaw !== '';
      localStorage.removeItem(API_KEY_NAME_STORAGE_KEY);
      return changed;
    }
    const nextRaw = JSON.stringify(nextMap);
    const changed = previousRaw !== nextRaw;
    localStorage.setItem(API_KEY_NAME_STORAGE_KEY, nextRaw);
    return changed;
  } catch {
    // Ignore storage write failures.
    return false;
  }
}

export function mergeStoredApiKeyNames(items: ConfigApiKeyItem[]): ConfigApiKeyItem[] {
  const storedMap = loadStoredApiKeyNameMap();

  return items.map((item) => {
    const apiKey = normalizeText(item.apiKey);
    if (!apiKey) return item;

    const name = normalizeText(item.name) || storedMap[getApiKeyNameFingerprint(apiKey)] || '';
    return name ? { apiKey, name } : { apiKey };
  });
}
