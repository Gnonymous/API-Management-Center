/**
 * 共享 hook：封装 API 端点 provider + models 加载逻辑
 *
 * 从 ApiEndpointsPage 中提取核心数据流，供多个页面复用。
 * 本 hook 不涉及任何 UI 状态（如搜索、key 选择等），只关注 provider 列表和模型数据。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiKeysApi, authFilesApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type {
  AuthFileItem,
  Config,
  GeminiKeyConfig,
  OAuthModelAliasEntry,
  OpenAIProviderConfig,
  ProviderKeyConfig,
} from '@/types';
import { normalizeApiBase } from '@/utils/connection';
import type { ModelInfo } from '@/utils/models';

// ─── Types ────────────────────────────────────────────────────

export type EndpointSourceKind = 'auth-proxy' | 'configured-api';

export interface ProviderKeyOption {
  apiKey: string;
}

export type ProviderModelsStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ProviderModelsState {
  status: ProviderModelsStatus;
  models: ModelInfo[];
  error?: string;
}

export interface EndpointProviderEntry {
  id: string;
  sourceKind: EndpointSourceKind;
  providerKey: string;
  name: string;
  baseUrl: string;
  keyOptions: ProviderKeyOption[];
  order: number;
  configuredModels?: ModelInfo[];
  authFileNames?: string[];
  aliasLookup?: Record<string, string>;
  excludedPatterns?: string[];
  realBaseUrl?: string;
  realKeyOptions?: ProviderKeyOption[];
}

export interface SourceSection {
  id: EndpointSourceKind;
  title: string;
  items: EndpointProviderEntry[];
}

export const DEFAULT_MODELS_STATE: ProviderModelsState = {
  status: 'idle',
  models: [],
};

// ─── Pure helpers ─────────────────────────────────────────────

export const normalizeText = (value: unknown): string => String(value ?? '').trim();
export const normalizeProviderKey = (value: unknown): string =>
  normalizeText(value).toLowerCase();

export const isTruthyFlag = (value: unknown): boolean => {
  if (value === true) return true;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
  }
  return false;
};

export const dedupeModels = (models: ModelInfo[]): ModelInfo[] => {
  const seen = new Set<string>();
  const result: ModelInfo[] = [];

  models.forEach((model) => {
    const name = normalizeText(model.name);
    if (!name) return;

    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const alias = normalizeText(model.alias);
    const description = normalizeText(model.description);

    const next: ModelInfo = { name };
    if (alias && alias.toLowerCase() !== key) next.alias = alias;
    if (description) next.description = description;
    result.push(next);
  });

  return result;
};

export const normalizeExcludedPatterns = (patterns?: string[]): string[] => {
  if (!Array.isArray(patterns) || patterns.length === 0) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  patterns.forEach((pattern) => {
    const trimmed = normalizeText(pattern);
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(trimmed);
  });

  return normalized;
};

export const matchExcludePattern = (model: string, pattern: string): boolean => {
  if (!pattern.includes('*')) {
    return model.toLowerCase() === pattern.toLowerCase();
  }

  const regexSafePattern = pattern
    .split('*')
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const regex = new RegExp(`^${regexSafePattern}$`, 'i');
  return regex.test(model);
};

export const filterExcludedModels = (
  models: ModelInfo[],
  patterns?: string[]
): ModelInfo[] => {
  const normalizedPatterns = normalizeExcludedPatterns(patterns);
  if (normalizedPatterns.length === 0) return models;

  return models.filter((model) => {
    const candidates = [normalizeText(model.name), normalizeText(model.alias)].filter(
      Boolean
    );
    if (candidates.length === 0) return true;

    const excluded = candidates.some((candidate) =>
      normalizedPatterns.some((pattern) => matchExcludePattern(candidate, pattern))
    );
    return !excluded;
  });
};

export const normalizeApiKeyList = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const keys: string[] = [];

  input.forEach((item) => {
    const record =
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;

    const value =
      typeof item === 'string'
        ? item
        : record
          ? (record['api-key'] ?? record.apiKey ?? record.key ?? record.Key)
          : '';

    const apiKey = normalizeText(value);
    if (!apiKey) return;

    const key = apiKey.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    keys.push(apiKey);
  });

  return keys;
};

export const buildKeyOptions = (keys: string[]): ProviderKeyOption[] =>
  normalizeApiKeyList(keys).map((apiKey) => ({ apiKey }));

const resolveSimpleProviderName = (
  fallbackName: string,
  index: number,
  item: ProviderKeyConfig | GeminiKeyConfig
): string => {
  const prefix = normalizeText(item.prefix);
  if (prefix) return prefix;

  const baseUrl = normalizeText(item.baseUrl);
  if (baseUrl) return baseUrl;

  return `${fallbackName}#${index + 1}`;
};

const convertConfiguredModels = (
  models: Array<{ name: string; alias?: string }> | undefined
): ModelInfo[] => {
  if (!Array.isArray(models)) return [];

  const converted = models
    .map((model) => {
      const rawName = normalizeText(model.name);
      if (!rawName) return null;

      const alias = normalizeText(model.alias);
      if (alias && alias.toLowerCase() !== rawName.toLowerCase()) {
        return {
          name: alias,
          alias: rawName,
        } satisfies ModelInfo;
      }

      return { name: rawName } satisfies ModelInfo;
    })
    .filter(Boolean) as ModelInfo[];

  return dedupeModels(converted);
};

export const buildConfiguredEntries = (
  config: Config | null,
  baseUrl: string,
  keyOptions: ProviderKeyOption[]
): EndpointProviderEntry[] => {
  if (!config) return [];

  let order = 0;
  const entries: EndpointProviderEntry[] = [];

  (config.openaiCompatibility ?? []).forEach(
    (provider: OpenAIProviderConfig, index: number) => {
      const name = normalizeText(provider.name) || `openai-compat#${index + 1}`;
      const realKeyOptions = buildKeyOptions(
        (provider.apiKeyEntries ?? []).map((entry) => entry.apiKey)
      );
      entries.push({
        id: `configured:openai:${index}`,
        sourceKind: 'configured-api',
        providerKey: normalizeProviderKey(provider.name || name),
        name,
        baseUrl,
        keyOptions,
        order: order++,
        configuredModels: convertConfiguredModels(provider.models),
        realBaseUrl: normalizeText(provider.baseUrl),
        realKeyOptions,
      });
    }
  );

  (config.codexApiKeys ?? []).forEach((item: ProviderKeyConfig, index: number) => {
    entries.push({
      id: `configured:codex:${index}`,
      sourceKind: 'configured-api',
      providerKey: 'codex',
      name: resolveSimpleProviderName('codex', index, item),
      baseUrl,
      keyOptions,
      order: order++,
      configuredModels: convertConfiguredModels(item.models),
      realBaseUrl: normalizeText(item.baseUrl),
      realKeyOptions: buildKeyOptions([item.apiKey]),
    });
  });

  (config.claudeApiKeys ?? []).forEach((item: ProviderKeyConfig, index: number) => {
    entries.push({
      id: `configured:claude:${index}`,
      sourceKind: 'configured-api',
      providerKey: 'claude',
      name: resolveSimpleProviderName('claude', index, item),
      baseUrl,
      keyOptions,
      order: order++,
      configuredModels: convertConfiguredModels(item.models),
      realBaseUrl: normalizeText(item.baseUrl),
      realKeyOptions: buildKeyOptions([item.apiKey]),
    });
  });

  (config.geminiApiKeys ?? []).forEach((item: GeminiKeyConfig, index: number) => {
    entries.push({
      id: `configured:gemini:${index}`,
      sourceKind: 'configured-api',
      providerKey: 'gemini',
      name: resolveSimpleProviderName('gemini', index, item),
      baseUrl,
      keyOptions,
      order: order++,
      configuredModels: convertConfiguredModels(item.models),
      realBaseUrl: normalizeText(item.baseUrl),
      realKeyOptions: buildKeyOptions([item.apiKey]),
    });
  });

  (config.vertexApiKeys ?? []).forEach((item: ProviderKeyConfig, index: number) => {
    entries.push({
      id: `configured:vertex:${index}`,
      sourceKind: 'configured-api',
      providerKey: 'vertex',
      name: resolveSimpleProviderName('vertex', index, item),
      baseUrl,
      keyOptions,
      order: order++,
      configuredModels: convertConfiguredModels(item.models),
      realBaseUrl: normalizeText(item.baseUrl),
      realKeyOptions: buildKeyOptions([item.apiKey]),
    });
  });

  return entries;
};

export const buildAliasLookup = (
  entries?: OAuthModelAliasEntry[]
): Record<string, string> => {
  if (!Array.isArray(entries) || entries.length === 0) return {};

  const aliasLookup: Record<string, string> = {};
  entries.forEach((entry) => {
    const name = normalizeText(entry.name).toLowerCase();
    const alias = normalizeText(entry.alias);
    if (!name || !alias) return;
    aliasLookup[name] = alias;
  });
  return aliasLookup;
};

export const buildAuthProviderEntries = (
  authFiles: AuthFileItem[],
  aliasMap: Record<string, OAuthModelAliasEntry[]>,
  excludedMap: Record<string, string[]>,
  baseUrl: string,
  keyOptions: ProviderKeyOption[]
): EndpointProviderEntry[] => {
  const grouped = new Map<
    string,
    {
      label: string;
      order: number;
      files: Set<string>;
    }
  >();

  let order = 0;
  authFiles.forEach((file) => {
    if (isTruthyFlag(file.disabled) || isTruthyFlag(file.unavailable)) return;

    const rawProvider = normalizeText(file.provider || file.type);
    const providerKey = normalizeProviderKey(rawProvider);
    if (!providerKey) return;

    const fileName = normalizeText(file.name);
    if (!fileName) return;

    const existing = grouped.get(providerKey);
    if (existing) {
      existing.files.add(fileName);
      return;
    }

    grouped.set(providerKey, {
      label: rawProvider,
      order: order++,
      files: new Set([fileName]),
    });
  });

  return Array.from(grouped.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([providerKey, data]) => ({
      id: `auth:${providerKey}`,
      sourceKind: 'auth-proxy' as const,
      providerKey,
      name: data.label,
      baseUrl,
      keyOptions,
      order: data.order,
      authFileNames: Array.from(data.files),
      aliasLookup: buildAliasLookup(aliasMap[providerKey]),
      excludedPatterns: normalizeExcludedPatterns(excludedMap[providerKey]),
    }));
};

const normalizeAuthApiModels = (
  models: Array<{
    id: string;
    display_name?: string;
    type?: string;
    owned_by?: string;
  }>
): ModelInfo[] => {
  const normalized = models
    .map((model) => {
      const id = normalizeText(model.id);
      if (!id) return null;
      const alias = normalizeText(model.display_name);
      if (alias && alias.toLowerCase() !== id.toLowerCase()) {
        return { name: id, alias } satisfies ModelInfo;
      }
      return { name: id } satisfies ModelInfo;
    })
    .filter(Boolean) as ModelInfo[];

  return dedupeModels(normalized);
};

const applyAliasLookup = (
  models: ModelInfo[],
  lookup?: Record<string, string>
): ModelInfo[] => {
  if (!lookup || Object.keys(lookup).length === 0) {
    return dedupeModels(models);
  }

  const mapped = models.map((model) => {
    const rawName = normalizeText(model.name);
    if (!rawName) return model;

    const mappedAlias = normalizeText(lookup[rawName.toLowerCase()]);
    if (!mappedAlias) return model;
    if (mappedAlias.toLowerCase() === rawName.toLowerCase()) return model;

    return {
      ...model,
      name: mappedAlias,
      alias: rawName,
    } satisfies ModelInfo;
  });

  return dedupeModels(mapped);
};

// ─── Hook ─────────────────────────────────────────────────────

export interface UseEndpointProvidersResult {
  providerEntries: EndpointProviderEntry[];
  modelsByProvider: Record<string, ProviderModelsState>;
  pageLoading: boolean;
  reload: (forceRefresh?: boolean) => Promise<void>;
  reloadProviderModels: (providerId: string) => void;
  refreshSingleProviderModels: (entry: EndpointProviderEntry) => Promise<void>;
}

export function useEndpointProviders(): UseEndpointProvidersResult {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const authState = useAuthStore();
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const [providerEntries, setProviderEntries] = useState<EndpointProviderEntry[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<
    Record<string, ProviderModelsState>
  >({});
  const [pageLoading, setPageLoading] = useState(false);

  const providerFetchTokenRef = useRef<Record<string, number>>({});

  const fetchAuthProxyModels = useCallback(
    async (entry: EndpointProviderEntry): Promise<ModelInfo[]> => {
      const providerKey = normalizeProviderKey(entry.providerKey);
      if (!providerKey) return [];

      let models: ModelInfo[] = [];
      let definitionError: unknown = null;

      try {
        const definitionModels =
          await authFilesApi.getModelDefinitions(providerKey);
        models = normalizeAuthApiModels(definitionModels);
      } catch (error: unknown) {
        definitionError = error;
      }

      if (models.length === 0 && entry.authFileNames?.length) {
        const settled = await Promise.allSettled(
          entry.authFileNames.map((fileName) =>
            authFilesApi.getModelsForAuthFile(fileName)
          )
        );

        const collected: ModelInfo[] = [];
        let hasFulfilled = false;

        settled.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          hasFulfilled = true;
          collected.push(...normalizeAuthApiModels(result.value));
        });

        models = dedupeModels(collected);

        if (!hasFulfilled && definitionError) {
          throw definitionError;
        }
      }

      return filterExcludedModels(
        applyAliasLookup(models, entry.aliasLookup),
        entry.excludedPatterns
      );
    },
    []
  );

  const refreshSingleProviderModels = useCallback(
    async (entry: EndpointProviderEntry) => {
      const nextToken = (providerFetchTokenRef.current[entry.id] ?? 0) + 1;
      providerFetchTokenRef.current[entry.id] = nextToken;

      setModelsByProvider((prev) => ({
        ...prev,
        [entry.id]: {
          status: 'loading',
          models: prev[entry.id]?.models ?? [],
        },
      }));

      try {
        const models =
          entry.sourceKind === 'configured-api'
            ? dedupeModels(entry.configuredModels ?? [])
            : await fetchAuthProxyModels(entry);

        if (providerFetchTokenRef.current[entry.id] !== nextToken) return;

        setModelsByProvider((prev) => ({
          ...prev,
          [entry.id]: {
            status: 'success',
            models,
          },
        }));
      } catch (error: unknown) {
        if (providerFetchTokenRef.current[entry.id] !== nextToken) return;

        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : t('api_endpoints.models_load_failed');

        setModelsByProvider((prev) => ({
          ...prev,
          [entry.id]: {
            status: 'error',
            models: prev[entry.id]?.models ?? [],
            error: message,
          },
        }));
      }
    },
    [fetchAuthProxyModels, t]
  );

  const refreshAllProviderModels = useCallback(
    async (entries: EndpointProviderEntry[]) => {
      if (!entries.length) {
        setModelsByProvider({});
        return;
      }

      setModelsByProvider((prev) => {
        const next: Record<string, ProviderModelsState> = {};
        entries.forEach((entry) => {
          next[entry.id] = {
            status: 'loading',
            models: prev[entry.id]?.models ?? [],
          };
        });
        return next;
      });

      const concurrency = 4;
      for (let index = 0; index < entries.length; index += concurrency) {
        const batch = entries.slice(index, index + concurrency);
        await Promise.all(
          batch.map((entry) => refreshSingleProviderModels(entry))
        );
      }
    },
    [refreshSingleProviderModels]
  );

  const loadProxyApiKeys = useCallback(
    async (config: Config): Promise<ProviderKeyOption[]> => {
      const fromConfig = normalizeApiKeyList(config.apiKeys);
      if (fromConfig.length > 0) {
        return fromConfig.map((apiKey) => ({ apiKey }));
      }

      try {
        const fromApi = await apiKeysApi.list();
        const normalized = normalizeApiKeyList(fromApi);
        return normalized.map((apiKey) => ({ apiKey }));
      } catch {
        return [];
      }
    },
    []
  );

  const loadPageData = useCallback(
    async (forceRefresh = false) => {
      if (
        authState.connectionStatus !== 'connected' ||
        !authState.apiBase
      ) {
        setProviderEntries([]);
        setModelsByProvider({});
        return;
      }

      setPageLoading(true);

      try {
        const baseUrl = normalizeApiBase(authState.apiBase);
        const config = (await fetchConfig(undefined, forceRefresh)) as Config;

        const [keyOptions, authFilesResult, aliasResult, excludedResult] =
          await Promise.all([
            loadProxyApiKeys(config),
            authFilesApi
              .list()
              .catch(() => ({ files: [] as AuthFileItem[] })),
            authFilesApi
              .getOauthModelAlias()
              .catch(() => ({}) as Record<string, OAuthModelAliasEntry[]>),
            authFilesApi
              .getOauthExcludedModels()
              .catch(() => ({}) as Record<string, string[]>),
          ]);

        const authFiles = Array.isArray(authFilesResult?.files)
          ? authFilesResult.files
          : [];

        const authEntries = buildAuthProviderEntries(
          authFiles,
          aliasResult,
          excludedResult,
          baseUrl,
          keyOptions
        );
        const configuredEntries = buildConfiguredEntries(
          config,
          baseUrl,
          keyOptions
        );
        const entries = [...authEntries, ...configuredEntries];

        setProviderEntries(entries);

        await refreshAllProviderModels(entries);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        showNotification(message, 'error');
      } finally {
        setPageLoading(false);
      }
    },
    [
      authState.apiBase,
      authState.connectionStatus,
      fetchConfig,
      loadProxyApiKeys,
      refreshAllProviderModels,
      showNotification,
    ]
  );

  useEffect(() => {
    void loadPageData(false);
  }, [loadPageData]);

  const reloadProviderModels = useCallback(
    (providerId: string) => {
      const entry = providerEntries.find((item) => item.id === providerId);
      if (!entry) return;
      void refreshSingleProviderModels(entry);
    },
    [providerEntries, refreshSingleProviderModels]
  );

  return {
    providerEntries,
    modelsByProvider,
    pageLoading,
    reload: loadPageData,
    reloadProviderModels,
    refreshSingleProviderModels,
  };
}
