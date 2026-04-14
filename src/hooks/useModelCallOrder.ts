import { useMemo } from 'react';
import { parsePriorityValue } from '@/features/authFiles/constants';
import type { AuthFileItem, Config, ModelAlias, OpenAIProviderConfig, ProviderKeyConfig, GeminiKeyConfig } from '@/types';
import type {
  EndpointProviderEntry,
  OAuthAliasRule,
  ProviderModelsState,
} from '@/hooks/useEndpointProviders';

export type CallOrderDisplayMode = 'sequence' | 'priority-groups';
export type CallOrderPrioritySource = 'model' | 'provider' | 'auth-file' | 'default';

export interface ModelCallOrderCandidate {
  id: string;
  sourceKind: EndpointProviderEntry['sourceKind'];
  providerId: string;
  providerKey: string;
  providerName: string;
  authFileName?: string;
  matchedModelName: string;
  matchedAlias?: string;
  resolvedPriority: number;
  prioritySource: CallOrderPrioritySource;
  stableOrder: number;
}

export interface ModelCallOrderGroup {
  priority: number;
  items: ModelCallOrderCandidate[];
}

interface UseModelCallOrderOptions {
  targetModel: string;
  config: Config | null;
  authFiles: AuthFileItem[];
  providerEntries: EndpointProviderEntry[];
  modelsByProvider: Record<string, ProviderModelsState>;
}

interface UseModelCallOrderResult {
  normalizedTargetModel: string;
  routingStrategy: string;
  displayMode: CallOrderDisplayMode;
  candidates: ModelCallOrderCandidate[];
  groups: ModelCallOrderGroup[];
  allModelNames: string[];
}

const CONFIGURED_ENTRY_ID_PATTERN = /^configured:(openai|claude|codex|gemini|vertex):(\d+)$/;

const normalizeText = (value: unknown): string => String(value ?? '').trim();
const normalizeKey = (value: unknown): string => normalizeText(value).toLowerCase();

const matchesTargetModel = (
  targetKey: string,
  candidateName: unknown,
  candidateAlias?: unknown
): boolean => {
  if (!targetKey) return false;
  return [candidateName, candidateAlias].some((value) => normalizeKey(value) === targetKey);
};

const sortCandidates = (left: ModelCallOrderCandidate, right: ModelCallOrderCandidate): number => {
  if (right.resolvedPriority !== left.resolvedPriority) {
    return right.resolvedPriority - left.resolvedPriority;
  }
  if (left.stableOrder !== right.stableOrder) {
    return left.stableOrder - right.stableOrder;
  }
  const providerCompare = left.providerName.localeCompare(right.providerName);
  if (providerCompare !== 0) return providerCompare;
  return (left.authFileName ?? '').localeCompare(right.authFileName ?? '');
};

const collectAllModelNames = (
  providerEntries: EndpointProviderEntry[],
  modelsByProvider: Record<string, ProviderModelsState>
): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  providerEntries.forEach((entry) => {
    const models = modelsByProvider[entry.id]?.models ?? [];
    models.forEach((model) => {
      [model.name, model.alias].forEach((value) => {
        const text = normalizeText(value);
        const key = text.toLowerCase();
        if (!text || seen.has(key)) return;
        seen.add(key);
        result.push(text);
      });
    });
  });

  return result.sort((a, b) => a.localeCompare(b));
};

const matchesAuthProxyModel = (
  targetKey: string,
  modelName: string,
  aliasLookup?: Record<string, OAuthAliasRule>
): boolean => {
  const normalizedModelName = normalizeKey(modelName);
  if (!normalizedModelName) return false;

  if (normalizedModelName === targetKey) return true;

  const matchedEntry = Object.entries(aliasLookup ?? {}).find(([rawName, rule]) => {
    const normalizedAlias = normalizeKey(rule.alias);
    return normalizedAlias === targetKey && normalizeKey(rawName) === normalizedModelName;
  });

  if (matchedEntry) return true;

  const matchedRawEntry = aliasLookup?.[normalizedModelName];
  return matchedRawEntry?.fork === true && normalizedModelName === targetKey;
};

const findMatchingDisplayModel = (
  targetKey: string,
  entry: EndpointProviderEntry,
  modelsByProvider: Record<string, ProviderModelsState>
) => {
  const models = modelsByProvider[entry.id]?.models ?? [];
  if (entry.sourceKind === 'auth-proxy') {
    return models.find((model) => matchesAuthProxyModel(targetKey, model.name, entry.aliasLookup));
  }
  return models.find((model) => matchesTargetModel(targetKey, model.name, model.alias));
};

const resolveConfigProvider = (
  config: Config | null,
  entryId: string
): OpenAIProviderConfig | ProviderKeyConfig | GeminiKeyConfig | null => {
  const matched = entryId.match(CONFIGURED_ENTRY_ID_PATTERN);
  if (!matched || !config) return null;

  const [, source, indexText] = matched;
  const index = Number.parseInt(indexText, 10);
  if (!Number.isInteger(index) || index < 0) return null;

  switch (source) {
    case 'openai':
      return config.openaiCompatibility?.[index] ?? null;
    case 'claude':
      return config.claudeApiKeys?.[index] ?? null;
    case 'codex':
      return config.codexApiKeys?.[index] ?? null;
    case 'gemini':
      return config.geminiApiKeys?.[index] ?? null;
    case 'vertex':
      return config.vertexApiKeys?.[index] ?? null;
    default:
      return null;
  }
};

const findMatchingModelPriority = (models: ModelAlias[] | undefined, targetKey: string) =>
  (models ?? []).find((model) => matchesTargetModel(targetKey, model.name, model.alias));

export function useModelCallOrder({
  targetModel,
  config,
  authFiles,
  providerEntries,
  modelsByProvider,
}: UseModelCallOrderOptions): UseModelCallOrderResult {
  return useMemo(() => {
    const normalizedTargetModel = normalizeText(targetModel);
    const targetKey = normalizedTargetModel.toLowerCase();
    const routingStrategy = config?.routingStrategy === 'fill-first' ? 'fill-first' : 'round-robin';
    const displayMode: CallOrderDisplayMode =
      routingStrategy === 'fill-first' ? 'sequence' : 'priority-groups';
    const allModelNames = collectAllModelNames(providerEntries, modelsByProvider);

    if (!targetKey) {
      return {
        normalizedTargetModel,
        routingStrategy,
        displayMode,
        candidates: [],
        groups: [],
        allModelNames,
      };
    }

    const authFileMap = new Map(authFiles.map((file, index) => [normalizeText(file.name), { file, index }]));
    const candidates: ModelCallOrderCandidate[] = [];

    providerEntries.forEach((entry) => {
      const matchedModel = findMatchingDisplayModel(targetKey, entry, modelsByProvider);
      if (!matchedModel) return;

      if (entry.sourceKind === 'configured-api') {
        const providerConfig = resolveConfigProvider(config, entry.id);
        const matchedRawModel = findMatchingModelPriority(providerConfig?.models, targetKey);
        const providerPriority =
          providerConfig && 'priority' in providerConfig ? providerConfig.priority : undefined;
        const resolvedPriority = matchedRawModel?.priority ?? providerPriority ?? 0;
        const prioritySource: CallOrderPrioritySource = matchedRawModel?.priority !== undefined
          ? 'model'
          : providerPriority !== undefined
            ? 'provider'
            : 'default';

        candidates.push({
          id: entry.id,
          sourceKind: entry.sourceKind,
          providerId: entry.id,
          providerKey: entry.providerKey,
          providerName: entry.name,
          matchedModelName: normalizeText(matchedModel.name) || normalizedTargetModel,
          matchedAlias: normalizeText(matchedModel.alias) || undefined,
          resolvedPriority,
          prioritySource,
          stableOrder: entry.order,
        });
        return;
      }

      const authFileNames = entry.authFileNames?.length ? entry.authFileNames : [entry.name];
      authFileNames.forEach((authFileName, authFileIndex) => {
        const authFileInfo = authFileMap.get(normalizeText(authFileName));
        const authPriority = authFileInfo
          ? parsePriorityValue(authFileInfo.file.priority ?? authFileInfo.file['priority'])
          : undefined;

        candidates.push({
          id: `${entry.id}:${authFileName}`,
          sourceKind: entry.sourceKind,
          providerId: entry.id,
          providerKey: entry.providerKey,
          providerName: entry.name,
          authFileName,
          matchedModelName: normalizeText(matchedModel.name) || normalizedTargetModel,
          matchedAlias: normalizeText(matchedModel.alias) || undefined,
          resolvedPriority: authPriority ?? 0,
          prioritySource: authPriority !== undefined ? 'auth-file' : 'default',
          stableOrder: entry.order * 1000 + (authFileInfo?.index ?? authFileIndex),
        });
      });
    });

    candidates.sort(sortCandidates);

    const groups: ModelCallOrderGroup[] = [];
    candidates.forEach((candidate) => {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.priority === candidate.resolvedPriority) {
        lastGroup.items.push(candidate);
        return;
      }
      groups.push({ priority: candidate.resolvedPriority, items: [candidate] });
    });

    return {
      normalizedTargetModel,
      routingStrategy,
      displayMode,
      candidates,
      groups,
      allModelNames,
    };
  }, [authFiles, config, modelsByProvider, providerEntries, targetModel]);
}
