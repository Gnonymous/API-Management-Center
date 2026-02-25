import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  IconSearch,
  IconChevronDown,
  IconCheck,
  IconBot,
  IconDiamond,
  IconFileText,
  IconZap,
} from '@/components/ui/icons';
import { useNotificationStore } from '@/stores';
import {
  useEndpointProviders,
  normalizeText,
  DEFAULT_MODELS_STATE,
  type EndpointProviderEntry,
  type ProviderModelsState,
  type SourceSection,
} from '@/hooks/useEndpointProviders';
import type {
  ClaudeSettings,
  ModelSlotKey,
  ModelSlotConfig,
  ModelSlotIconKey,
} from '@/types/agentSettings';
import { MODEL_SLOTS } from '@/types/agentSettings';
import {
  clearSavedSettingsFileHandle,
  ensureHandlePermission,
  isFileSystemAccessSupported,
  loadSavedSettingsFileHandle,
  pickSettingsFile,
  readJsonFromHandle,
  saveSettingsFileHandle,
  writeJsonToHandle,
} from '@/utils/fileSystemAccess';
import { normalizeApiBase } from '@/utils/connection';
import type { ModelInfo } from '@/utils/models';
import styles from './AgentSettingsPage.module.scss';

type ThinkingLevel = 'low' | 'medium' | 'high' | 'xhigh';
type ThinkingCapability = 'codex' | 'non-codex' | 'unknown';

const THINKING_LEVELS: ThinkingLevel[] = ['low', 'medium', 'high', 'xhigh'];
const THINKING_LEVEL_SET = new Set<ThinkingLevel>(THINKING_LEVELS);

const matchesSearch = (model: ModelInfo, query: string): boolean => {
  if (!query) return true;
  const q = query.toLowerCase();
  const name = normalizeText(model.name).toLowerCase();
  const alias = normalizeText(model.alias).toLowerCase();
  return name.includes(q) || alias.includes(q);
};

const buildClientBaseUrl = (baseUrl: string): string => {
  const normalized = normalizeApiBase(baseUrl);
  if (!normalized) return '';

  const trimmed = normalized.replace(/\/+$/g, '');
  if (/\/v1\/chat\/completions$/i.test(trimmed)) {
    return trimmed.replace(/\/chat\/completions$/i, '');
  }
  if (/\/v1$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
};

const buildChatCompletionsUrl = (baseUrl: string): string => {
  const clientBaseUrl = buildClientBaseUrl(baseUrl);
  if (!clientBaseUrl) return '';
  return `${clientBaseUrl}/chat/completions`;
};

const renderSlotIcon = (icon: ModelSlotIconKey) => {
  const size = 15;
  if (icon === 'main') return <IconBot size={size} />;
  if (icon === 'opus') return <IconDiamond size={size} />;
  if (icon === 'sonnet') return <IconFileText size={size} />;
  return <IconZap size={size} />;
};

const isCodexProvider = (entry?: EndpointProviderEntry | null): boolean => {
  if (!entry) return false;
  return normalizeText(entry.providerKey).toLowerCase() === 'codex';
};

const parseModelWithThinking = (
  value: string
): { baseModel: string; thinking: ThinkingLevel | null } => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return { baseModel: '', thinking: null };
  }

  const match = normalized.match(/^(.*)\(([^()]+)\)$/);
  if (!match) {
    return { baseModel: normalized, thinking: null };
  }

  const baseModel = normalizeText(match[1]);
  const rawLevel = normalizeText(match[2]).toLowerCase() as ThinkingLevel;

  if (baseModel && THINKING_LEVEL_SET.has(rawLevel)) {
    return { baseModel, thinking: rawLevel };
  }

  return { baseModel: normalized, thinking: null };
};

const formatModelWithThinking = (
  baseModel: string,
  thinking: ThinkingLevel | null
): string => {
  const normalized = normalizeText(baseModel);
  if (!normalized) return '';
  if (!thinking) return normalized;
  return `${normalized}(${thinking})`;
};

const createEmptyStringSlotRecord = (): Record<ModelSlotKey, string> => ({
  ANTHROPIC_MODEL: '',
  ANTHROPIC_DEFAULT_OPUS_MODEL: '',
  ANTHROPIC_DEFAULT_SONNET_MODEL: '',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
});

const createEmptyThinkingSlotRecord = (): Record<ModelSlotKey, ThinkingLevel | null> => ({
  ANTHROPIC_MODEL: null,
  ANTHROPIC_DEFAULT_OPUS_MODEL: null,
  ANTHROPIC_DEFAULT_SONNET_MODEL: null,
  ANTHROPIC_DEFAULT_HAIKU_MODEL: null,
});

type PageStatus = 'idle' | 'loading' | 'loaded' | 'saving' | 'error';

interface ProviderOption {
  entry: EndpointProviderEntry;
  sectionTitle: string;
  modelsState: ProviderModelsState;
}

interface ConnectivityResult {
  ok: boolean;
  msg: string;
}

interface ModelSlotCardProps {
  slot: ModelSlotConfig;
  currentValue: string;
  displayValue: string;
  slotDirty: boolean;
  thinkingLevel: ThinkingLevel | null;
  selectedProviderId: string;
  sections: SourceSection[];
  modelsByProvider: Record<string, ProviderModelsState>;
  modelsLoading: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (model: string, providerId?: string) => void;
  onClear: () => void;
  onThinkingChange: (value: ThinkingLevel | null) => void;
  onProviderPick: (providerId: string) => void;
  onTestConnectivity: (model: string, providerId?: string) => Promise<ConnectivityResult>;
}

function ModelSlotCard({
  slot,
  currentValue,
  displayValue,
  slotDirty,
  thinkingLevel,
  selectedProviderId,
  sections,
  modelsByProvider,
  modelsLoading,
  expanded,
  onToggle,
  onSelect,
  onClear,
  onThinkingChange,
  onProviderPick,
  onTestConnectivity,
}: ModelSlotCardProps) {
  const { t } = useTranslation();
  const [modelSearch, setModelSearch] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectivityResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const providerOptions = useMemo<ProviderOption[]>(() => {
    return sections.flatMap((section) =>
      section.items.map((entry) => ({
        entry,
        sectionTitle: section.title,
        modelsState: modelsByProvider[entry.id] ?? DEFAULT_MODELS_STATE,
      }))
    );
  }, [sections, modelsByProvider]);

  const activeProviderOption = useMemo(() => {
    if (!activeProviderId) return null;
    return providerOptions.find((option) => option.entry.id === activeProviderId) ?? null;
  }, [activeProviderId, providerOptions]);

  const activeModels = useMemo(
    () => activeProviderOption?.modelsState.models ?? [],
    [activeProviderOption]
  );

  const currentModelInActiveProvider = useMemo(() => {
    if (!activeProviderOption) return false;
    const normalizedCurrent = normalizeText(currentValue).toLowerCase();
    if (!normalizedCurrent) return false;

    return activeModels.some((model) => {
      const name = normalizeText(model.name).toLowerCase();
      const alias = normalizeText(model.alias).toLowerCase();
      return name === normalizedCurrent || alias === normalizedCurrent;
    });
  }, [activeModels, activeProviderOption, currentValue]);

  const uniqueModels = useMemo(() => {
    const seen = new Set<string>();
    return activeModels.filter((model) => {
      const key = normalizeText(model.name).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activeModels]);

  const filteredModels = useMemo(
    () => uniqueModels.filter((model) => matchesSearch(model, modelSearch)),
    [uniqueModels, modelSearch]
  );

  const activeProviderIsCodex = isCodexProvider(activeProviderOption?.entry);
  const activeProviderSupportsThinking = activeProviderIsCodex && currentModelInActiveProvider;

  const handleManualApply = useCallback(() => {
    const trimmed = manualValue.trim();
    if (trimmed) {
      onSelect(trimmed, activeProviderOption?.entry.id);
      setManualValue('');
      setTestResult(null);
    }
  }, [activeProviderOption, manualValue, onSelect]);

  const handleManualKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        handleManualApply();
      }
    },
    [handleManualApply]
  );

  const handleProviderSelect = useCallback(
    (providerId: string) => {
      const selected = providerOptions.find((option) => option.entry.id === providerId);
      if (selected && !isCodexProvider(selected.entry) && thinkingLevel) {
        onThinkingChange(null);
      }

      onProviderPick(providerId);
      setActiveProviderId(providerId);
      setModelSearch('');
    },
    [onProviderPick, onThinkingChange, providerOptions, thinkingLevel]
  );

  const handleBackToProviders = useCallback(() => {
    setActiveProviderId(null);
    setModelSearch('');
  }, []);

  const handleTest = useCallback(async () => {
    if (!currentValue || testing) return;

    setTesting(true);
    try {
      const result = await onTestConnectivity(currentValue, activeProviderOption?.entry.id);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  }, [activeProviderOption, currentValue, onTestConnectivity, testing]);

  useEffect(() => {
    setTestResult(null);
  }, [currentValue, thinkingLevel]);

  useEffect(() => {
    if (!expanded) return;

    if (selectedProviderId) {
      const hasSelectedProvider = providerOptions.some(
        (option) => option.entry.id === selectedProviderId
      );
      if (hasSelectedProvider) {
        setActiveProviderId(selectedProviderId);
      }
    }
  }, [expanded, providerOptions, selectedProviderId]);

  useEffect(() => {
    if (!activeProviderId) return;
    const exists = providerOptions.some((option) => option.entry.id === activeProviderId);
    if (!exists) {
      setActiveProviderId(null);
    }
  }, [activeProviderId, providerOptions]);

  useEffect(() => {
    if (expanded && activeProviderOption && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [expanded, activeProviderOption]);

  return (
    <div
      className={`${styles.slotCard} ${expanded ? styles.active : ''} ${slotDirty ? styles.dirty : ''}`}
    >
      <div className={styles.slotHeader} onClick={onToggle}>
        <div className={styles.slotHeaderLeft}>
          <span className={styles.slotIcon}>{renderSlotIcon(slot.icon)}</span>
          <div className={styles.slotMeta}>
            <span className={styles.slotLabel}>{t(slot.labelKey)}</span>
            <span className={styles.slotDesc}>{t(slot.descKey)}</span>
          </div>
        </div>
        <div className={styles.slotHeaderRight}>
          {displayValue ? (
            <span className={styles.slotCurrentValue} title={displayValue}>
              {displayValue}
            </span>
          ) : (
            <span className={styles.slotNoValue}>{t('agent_settings.no_value')}</span>
          )}
          <span className={`${styles.slotChevron} ${expanded ? styles.expanded : ''}`}>
            <IconChevronDown size={16} />
          </span>
        </div>
      </div>

      {expanded && (
        <div className={styles.slotBody}>
          <div className={styles.manualInputRow}>
            <input
              className={styles.manualInput}
              type="text"
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              onKeyDown={handleManualKeyDown}
              placeholder={t('agent_settings.manual_input')}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!manualValue.trim()}
              onClick={handleManualApply}
            >
              {t('agent_settings.apply')}
            </Button>
            {currentValue && (
              <Button size="sm" variant="ghost" onClick={onClear}>
                {t('agent_settings.clear')}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleTest()}
              loading={testing}
              disabled={!currentValue || testing}
            >
              {testing
                ? t('agent_settings.testing_connectivity')
                : t('agent_settings.test_connectivity')}
            </Button>
          </div>

          {testResult && (
            <div className={`${styles.testResult} ${testResult.ok ? styles.success : styles.error}`}>
              {testResult.msg}
            </div>
          )}

          {!activeProviderOption ? (
            <>
              <div className={styles.providerIntro}>
                <p className={styles.providerIntroTitle}>{t('agent_settings.pick_provider')}</p>
                <p className={styles.providerIntroDesc}>{t('agent_settings.pick_provider_desc')}</p>
              </div>

              <div className={styles.providerGrid}>
                {providerOptions.map((option) => {
                  const { entry, sectionTitle, modelsState } = option;
                  const modelCount = modelsState.models.length;
                  const statusLabel =
                    modelsState.status === 'loading'
                      ? t('common.loading')
                      : modelCount > 0
                        ? t('api_endpoints.active')
                        : t('api_endpoints.inactive');

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={styles.providerCardBtn}
                      onClick={() => handleProviderSelect(entry.id)}
                    >
                      <div className={styles.providerCardHead}>
                        <span className={styles.providerCardName}>{entry.name}</span>
                        <span className={styles.providerCardStatus}>{statusLabel}</span>
                      </div>
                      <div className={styles.providerCardMeta}>
                        <span className={styles.providerCardSection}>{sectionTitle}</span>
                        <span className={styles.providerCardCount}>{modelCount}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {!providerOptions.length && (
                <div className={styles.noModels}>{t('agent_settings.no_providers')}</div>
              )}
            </>
          ) : (
            <>
              <div className={styles.providerToolbar}>
                <button
                  type="button"
                  className={styles.providerBackBtn}
                  onClick={handleBackToProviders}
                >
                  {t('agent_settings.back_to_providers')}
                </button>
                <div className={styles.providerCurrentMeta}>
                  <span className={styles.providerCurrentLabel}>{t('agent_settings.current_provider')}</span>
                  <span className={styles.providerCurrentName}>{activeProviderOption.entry.name}</span>
                </div>
              </div>

              {activeProviderSupportsThinking && (
                <div className={styles.thinkingSection}>
                  <div className={styles.thinkingHeader}>
                    <span className={styles.thinkingLabel}>{t('agent_settings.thinking_level')}</span>
                    <span className={styles.thinkingHint}>
                      {t('agent_settings.thinking_hint_codex_only')}
                    </span>
                  </div>
                  <div className={styles.thinkingOptions}>
                    <button
                      type="button"
                      className={`${styles.thinkingOption} ${thinkingLevel === null ? styles.active : ''}`}
                      onClick={() => onThinkingChange(null)}
                      disabled={!currentValue}
                    >
                      {t('agent_settings.thinking_none')}
                    </button>
                    {THINKING_LEVELS.map((level) => (
                      <button
                        key={`${slot.key}:${level}`}
                        type="button"
                        className={`${styles.thinkingOption} ${thinkingLevel === level ? styles.active : ''}`}
                        onClick={() => onThinkingChange(level)}
                        disabled={!currentValue}
                      >
                        {t(`agent_settings.thinking_${level}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.modelPickerSearch}>
                <IconSearch size={14} className={styles.modelPickerSearchIcon} />
                <input
                  ref={inputRef}
                  className={styles.modelPickerSearchInput}
                  type="text"
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                  placeholder={t('agent_settings.search_models')}
                />
              </div>

              {modelsLoading && activeModels.length === 0 ? (
                <div className={styles.modelsLoading}>
                  <span className="loading-spinner" aria-hidden="true" />
                  {t('agent_settings.models_loading')}
                </div>
              ) : (
                <div className={styles.modelTags}>
                  {filteredModels.map((model) => {
                    const modelName = normalizeText(model.name);
                    const isSelected = modelName.toLowerCase() === currentValue.toLowerCase();
                    const alias = normalizeText(model.alias);

                    return (
                      <button
                        key={modelName}
                        type="button"
                        className={`${styles.modelTag} ${isSelected ? styles.selected : ''}`}
                        onClick={() => {
                          onSelect(modelName, activeProviderOption.entry.id);
                          setTestResult(null);
                        }}
                        title={alias ? `${modelName} ← ${alias}` : modelName}
                      >
                        {isSelected && <IconCheck size={12} className={styles.modelTagCheck} />}
                        <span className={styles.modelTagContent}>
                          <span className={styles.modelTagPrimary}>{modelName}</span>
                          <span
                            className={`${styles.modelTagAlias} ${!alias ? styles.modelTagAliasPlaceholder : ''}`}
                          >
                            {alias ? `(${alias})` : '(placeholder)'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {!modelsLoading && filteredModels.length === 0 && (
                <div className={styles.noModels}>{t('agent_settings.no_models_in_provider')}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentSettingsPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [settings, setSettings] = useState<ClaudeSettings | null>(null);
  const [dirtyEnv, setDirtyEnv] = useState<Record<ModelSlotKey, string>>(createEmptyStringSlotRecord);
  const [thinkingBySlot, setThinkingBySlot] = useState<Record<ModelSlotKey, ThinkingLevel | null>>(
    createEmptyThinkingSlotRecord
  );
  const [selectedProviderBySlot, setSelectedProviderBySlot] = useState<Record<ModelSlotKey, string>>(
    createEmptyStringSlotRecord
  );
  const [pageStatus, setPageStatus] = useState<PageStatus>('idle');
  const [loadError, setLoadError] = useState('');
  const [expandedSlot, setExpandedSlot] = useState<ModelSlotKey | null>(null);

  const fsSupported = isFileSystemAccessSupported();

  const { providerEntries, modelsByProvider, pageLoading } = useEndpointProviders();

  const providerById = useMemo(() => {
    const map: Record<string, EndpointProviderEntry> = {};
    providerEntries.forEach((entry) => {
      map[entry.id] = entry;
    });
    return map;
  }, [providerEntries]);

  const sections = useMemo<SourceSection[]>(() => {
    const authItems = providerEntries.filter((entry) => entry.sourceKind === 'auth-proxy');
    const configuredItems = providerEntries.filter(
      (entry) => entry.sourceKind === 'configured-api'
    );

    const result: SourceSection[] = [];
    if (authItems.length > 0) {
      result.push({
        id: 'auth-proxy',
        title: t('api_endpoints.source_auth_proxy'),
        items: authItems,
      });
    }
    if (configuredItems.length > 0) {
      result.push({
        id: 'configured-api',
        title: t('api_endpoints.source_configured_api'),
        items: configuredItems,
      });
    }
    return result;
  }, [providerEntries, t]);

  const modelsLoading =
    pageLoading ||
    providerEntries.some((entry) => {
      const state = modelsByProvider[entry.id];
      return state?.status === 'loading';
    });

  const originalParsedBySlot = useMemo(() => {
    const env = settings?.env;
    return {
      ANTHROPIC_MODEL: parseModelWithThinking(normalizeText(env?.ANTHROPIC_MODEL)),
      ANTHROPIC_DEFAULT_OPUS_MODEL: parseModelWithThinking(
        normalizeText(env?.ANTHROPIC_DEFAULT_OPUS_MODEL)
      ),
      ANTHROPIC_DEFAULT_SONNET_MODEL: parseModelWithThinking(
        normalizeText(env?.ANTHROPIC_DEFAULT_SONNET_MODEL)
      ),
      ANTHROPIC_DEFAULT_HAIKU_MODEL: parseModelWithThinking(
        normalizeText(env?.ANTHROPIC_DEFAULT_HAIKU_MODEL)
      ),
    };
  }, [settings]);

  const originalEnv = useMemo<Record<ModelSlotKey, string>>(
    () => ({
      ANTHROPIC_MODEL: originalParsedBySlot.ANTHROPIC_MODEL.baseModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL: originalParsedBySlot.ANTHROPIC_DEFAULT_OPUS_MODEL.baseModel,
      ANTHROPIC_DEFAULT_SONNET_MODEL: originalParsedBySlot.ANTHROPIC_DEFAULT_SONNET_MODEL.baseModel,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: originalParsedBySlot.ANTHROPIC_DEFAULT_HAIKU_MODEL.baseModel,
    }),
    [originalParsedBySlot]
  );

  const originalThinkingBySlot = useMemo<Record<ModelSlotKey, ThinkingLevel | null>>(
    () => ({
      ANTHROPIC_MODEL: originalParsedBySlot.ANTHROPIC_MODEL.thinking,
      ANTHROPIC_DEFAULT_OPUS_MODEL: originalParsedBySlot.ANTHROPIC_DEFAULT_OPUS_MODEL.thinking,
      ANTHROPIC_DEFAULT_SONNET_MODEL: originalParsedBySlot.ANTHROPIC_DEFAULT_SONNET_MODEL.thinking,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: originalParsedBySlot.ANTHROPIC_DEFAULT_HAIKU_MODEL.thinking,
    }),
    [originalParsedBySlot]
  );

  const providerHasModel = useCallback(
    (entry: EndpointProviderEntry, modelName: string): boolean => {
      const normalizedModel = normalizeText(modelName).toLowerCase();
      if (!normalizedModel) return false;

      const state = modelsByProvider[entry.id] ?? DEFAULT_MODELS_STATE;
      return state.models.some((item) => {
        const name = normalizeText(item.name).toLowerCase();
        const alias = normalizeText(item.alias).toLowerCase();
        return name === normalizedModel || alias === normalizedModel;
      });
    },
    [modelsByProvider]
  );

  const matchProviderByModel = useCallback(
    (modelName: string): EndpointProviderEntry | null => {
      const normalizedModel = normalizeText(modelName);
      if (!normalizedModel) return null;

      const matched = providerEntries.find((entry) => providerHasModel(entry, normalizedModel));
      return matched ?? null;
    },
    [providerEntries, providerHasModel]
  );

  const resolveProviderForModel = useCallback(
    (slotKey: ModelSlotKey, modelName: string, preferredProviderId?: string) => {
      const normalizedModel = normalizeText(modelName);
      if (!normalizedModel) return null;

      const selectedProviderId = preferredProviderId || selectedProviderBySlot[slotKey];
      if (selectedProviderId && providerById[selectedProviderId]) {
        const selectedEntry = providerById[selectedProviderId];
        if (providerHasModel(selectedEntry, normalizedModel) || selectedEntry.keyOptions.length > 0) {
          return selectedEntry;
        }
      }

      const matchedByModel = matchProviderByModel(normalizedModel);
      if (matchedByModel) return matchedByModel;

      return providerEntries.find((entry) => entry.keyOptions.length > 0) ?? null;
    },
    [matchProviderByModel, providerById, providerEntries, providerHasModel, selectedProviderBySlot]
  );

  const resolveThinkingCapability = useCallback(
    (slotKey: ModelSlotKey, modelName: string, preferredProviderId?: string): ThinkingCapability => {
      const normalizedModel = normalizeText(modelName);
      if (!normalizedModel) return 'unknown';

      const selectedProviderId = preferredProviderId || selectedProviderBySlot[slotKey];
      if (selectedProviderId && providerById[selectedProviderId]) {
        const selectedProvider = providerById[selectedProviderId];
        if (providerHasModel(selectedProvider, normalizedModel)) {
          return isCodexProvider(selectedProvider) ? 'codex' : 'non-codex';
        }
      }

      const matchedProvider = matchProviderByModel(normalizedModel);
      if (matchedProvider) {
        return isCodexProvider(matchedProvider) ? 'codex' : 'non-codex';
      }

      return 'unknown';
    },
    [matchProviderByModel, providerById, providerHasModel, selectedProviderBySlot]
  );

  const buildModelValueForSlot = useCallback(
    (slotKey: ModelSlotKey, baseModel: string, preferredProviderId?: string): string => {
      const normalizedBase = normalizeText(baseModel);
      if (!normalizedBase) return '';

      const thinking = thinkingBySlot[slotKey];
      if (!thinking) return normalizedBase;

      const capability = resolveThinkingCapability(slotKey, normalizedBase, preferredProviderId);
      if (capability !== 'codex') return normalizedBase;

      return formatModelWithThinking(normalizedBase, thinking);
    },
    [resolveThinkingCapability, thinkingBySlot]
  );

  const isDirty = useMemo(
    () =>
      MODEL_SLOTS.some(
        (slot) =>
          dirtyEnv[slot.key] !== originalEnv[slot.key] ||
          thinkingBySlot[slot.key] !== originalThinkingBySlot[slot.key]
      ),
    [dirtyEnv, originalEnv, originalThinkingBySlot, thinkingBySlot]
  );

  const buildMergedSettings = useCallback(
    (baseSettings: ClaudeSettings): ClaudeSettings => {
      const mergedEnv = { ...(baseSettings.env ?? {}) };

      MODEL_SLOTS.forEach((slot) => {
        const slotChanged =
          dirtyEnv[slot.key] !== originalEnv[slot.key] ||
          thinkingBySlot[slot.key] !== originalThinkingBySlot[slot.key];

        if (!slotChanged) {
          const originalValue = normalizeText(baseSettings.env?.[slot.key]);
          if (originalValue) {
            mergedEnv[slot.key] = originalValue;
          } else {
            delete mergedEnv[slot.key];
          }
          return;
        }

        const value = buildModelValueForSlot(slot.key, dirtyEnv[slot.key]);
        if (value) {
          mergedEnv[slot.key] = value;
        } else {
          delete mergedEnv[slot.key];
        }
      });

      return {
        ...baseSettings,
        env: mergedEnv,
      };
    },
    [buildModelValueForSlot, dirtyEnv, originalEnv, originalThinkingBySlot, thinkingBySlot]
  );

  const previewJson = useMemo(() => {
    if (!settings) return '';
    return JSON.stringify(buildMergedSettings(settings), null, 2);
  }, [buildMergedSettings, settings]);

  const applyLoadedSettings = useCallback((data: ClaudeSettings) => {
    setSettings(data);
    const env = data.env ?? {};

    const parsedMain = parseModelWithThinking(normalizeText(env.ANTHROPIC_MODEL));
    const parsedOpus = parseModelWithThinking(normalizeText(env.ANTHROPIC_DEFAULT_OPUS_MODEL));
    const parsedSonnet = parseModelWithThinking(
      normalizeText(env.ANTHROPIC_DEFAULT_SONNET_MODEL)
    );
    const parsedHaiku = parseModelWithThinking(
      normalizeText(env.ANTHROPIC_DEFAULT_HAIKU_MODEL)
    );

    setDirtyEnv({
      ANTHROPIC_MODEL: parsedMain.baseModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL: parsedOpus.baseModel,
      ANTHROPIC_DEFAULT_SONNET_MODEL: parsedSonnet.baseModel,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: parsedHaiku.baseModel,
    });

    setThinkingBySlot({
      ANTHROPIC_MODEL: parsedMain.thinking,
      ANTHROPIC_DEFAULT_OPUS_MODEL: parsedOpus.thinking,
      ANTHROPIC_DEFAULT_SONNET_MODEL: parsedSonnet.thinking,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: parsedHaiku.thinking,
    });

    setSelectedProviderBySlot(createEmptyStringSlotRecord());
    setExpandedSlot(null);
    setLoadError('');
    setPageStatus('loaded');
  }, []);

  const readSettingsFromHandle = useCallback(
    async (
      handle: FileSystemFileHandle,
      options?: { silent?: boolean; allowPermissionPrompt?: boolean }
    ): Promise<boolean> => {
      const silent = options?.silent ?? false;
      const allowPermissionPrompt = options?.allowPermissionPrompt ?? true;

      setPageStatus('loading');
      setLoadError('');

      try {
        const hasPermission = await ensureHandlePermission(
          handle,
          'read',
          allowPermissionPrompt
        );
        if (!hasPermission) {
          throw new Error(t('agent_settings.file_permission_required'));
        }

        const data = await readJsonFromHandle<unknown>(handle);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error(t('agent_settings.invalid_json_object'));
        }

        applyLoadedSettings(data as ClaudeSettings);
        if (!silent) {
          showNotification(t('agent_settings.file_load_success'), 'success');
        }
        return true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(message);
        setPageStatus('error');
        if (!silent) {
          showNotification(`${t('agent_settings.file_load_failed')}: ${message}`, 'error');
        }
        return false;
      }
    },
    [applyLoadedSettings, showNotification, t]
  );

  const restoreSavedHandle = useCallback(async () => {
    if (!fsSupported) return;

    try {
      const savedHandle = await loadSavedSettingsFileHandle();
      if (!savedHandle) return;

      setFileHandle(savedHandle);

      const granted = await ensureHandlePermission(savedHandle, 'read', false);
      if (!granted) {
        return;
      }

      await readSettingsFromHandle(savedHandle, {
        silent: true,
        allowPermissionPrompt: false,
      });
    } catch {
      await clearSavedSettingsFileHandle().catch(() => undefined);
    }
  }, [fsSupported, readSettingsFromHandle]);

  useEffect(() => {
    if (!fsSupported) return undefined;

    const timer = window.setTimeout(() => {
      void restoreSavedHandle();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fsSupported, restoreSavedHandle]);

  useEffect(() => {
    if (!providerEntries.length) return;

    setSelectedProviderBySlot((prev) => {
      const next = { ...prev };
      let changed = false;

      MODEL_SLOTS.forEach((slot) => {
        if (next[slot.key]) return;
        const model = dirtyEnv[slot.key];
        if (!model) return;

        const matched = matchProviderByModel(model);
        if (!matched) return;

        next[slot.key] = matched.id;
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [dirtyEnv, matchProviderByModel, providerEntries.length]);

  useEffect(() => {
    setThinkingBySlot((prev) => {
      const next = { ...prev };
      let changed = false;

      MODEL_SLOTS.forEach((slot) => {
        if (!prev[slot.key]) return;

        const providerId = selectedProviderBySlot[slot.key];
        if (!providerId) return;

        const provider = providerById[providerId];
        if (!provider) return;

        if (!isCodexProvider(provider)) {
          next[slot.key] = null;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [providerById, selectedProviderBySlot]);

  const testModelConnectivity = useCallback(
    async (
      slotKey: ModelSlotKey,
      model: string,
      preferredProviderId?: string
    ): Promise<ConnectivityResult> => {
      const normalizedModel = normalizeText(model);
      if (!normalizedModel) {
        return {
          ok: false,
          msg: t('agent_settings.test_no_model'),
        };
      }

      const provider = resolveProviderForModel(slotKey, normalizedModel, preferredProviderId);
      if (!provider) {
        return {
          ok: false,
          msg: t('agent_settings.test_no_provider'),
        };
      }

      const modelWithThinking = buildModelValueForSlot(
        slotKey,
        normalizedModel,
        preferredProviderId
      );
      if (!modelWithThinking) {
        return {
          ok: false,
          msg: t('agent_settings.test_no_model'),
        };
      }

      const chatCompletionsUrl = buildChatCompletionsUrl(provider.baseUrl);
      if (!chatCompletionsUrl) {
        return {
          ok: false,
          msg: t('agent_settings.test_invalid_provider_base_url'),
        };
      }

      const currentKey = provider.keyOptions[0]?.apiKey ?? '';
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (currentKey) {
        requestHeaders.Authorization = `Bearer ${currentKey}`;
      }

      try {
        const response = await fetch(chatCompletionsUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify({
            model: modelWithThinking,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
          }),
        });

        if (response.ok) {
          return {
            ok: true,
            msg: t('agent_settings.test_success_provider', {
              provider: provider.name,
            }),
          };
        }

        const body = await response.text().catch(() => '');
        return {
          ok: false,
          msg: `${response.status} ${body.slice(0, 120)}`,
        };
      } catch (error: unknown) {
        return {
          ok: false,
          msg: error instanceof Error ? error.message : String(error),
        };
      }
    },
    [buildModelValueForSlot, resolveProviderForModel, t]
  );

  const handleOpenFile = useCallback(async () => {
    if (!fsSupported) {
      showNotification(t('agent_settings.browser_not_supported'), 'warning');
      return;
    }

    try {
      const handle = await pickSettingsFile();
      if (!handle) return;

      setFileHandle(handle);
      await saveSettingsFileHandle(handle).catch(() => undefined);

      await readSettingsFromHandle(handle, {
        silent: false,
        allowPermissionPrompt: true,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      showNotification(`${t('agent_settings.file_open_failed')}: ${message}`, 'error');
    }
  }, [fsSupported, readSettingsFromHandle, showNotification, t]);

  const handleReload = useCallback(async () => {
    if (!fsSupported) return;

    if (!fileHandle) {
      await handleOpenFile();
      return;
    }

    const ok = await readSettingsFromHandle(fileHandle, {
      silent: true,
      allowPermissionPrompt: true,
    });
    if (ok) {
      showNotification(t('agent_settings.file_reload_success'), 'success');
    }
  }, [fileHandle, fsSupported, handleOpenFile, readSettingsFromHandle, showNotification, t]);

  const handleSave = useCallback(async () => {
    if (!settings || !fileHandle || !fsSupported) return;

    setPageStatus('saving');

    try {
      const hasPermission = await ensureHandlePermission(fileHandle, 'readwrite', true);
      if (!hasPermission) {
        throw new Error(t('agent_settings.file_permission_required'));
      }

      const merged = buildMergedSettings(settings);
      await writeJsonToHandle(fileHandle, merged);
      setSettings(merged);
      setPageStatus('loaded');
      showNotification(t('agent_settings.save_success'), 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setPageStatus('error');
      setLoadError(message);
      showNotification(`${t('agent_settings.save_failed')}: ${message}`, 'error');
    }
  }, [buildMergedSettings, fileHandle, fsSupported, settings, showNotification, t]);

  const handleReset = useCallback(() => {
    setDirtyEnv({ ...originalEnv });
    setThinkingBySlot({ ...originalThinkingBySlot });
    setExpandedSlot(null);
  }, [originalEnv, originalThinkingBySlot]);

  const handleProviderPick = useCallback(
    (slotKey: ModelSlotKey, providerId: string) => {
      setSelectedProviderBySlot((prev) => ({
        ...prev,
        [slotKey]: providerId,
      }));

      const picked = providerById[providerId];
      if (picked && !isCodexProvider(picked)) {
        setThinkingBySlot((prev) => ({
          ...prev,
          [slotKey]: null,
        }));
      }
    },
    [providerById]
  );

  const handleModelSelect = useCallback(
    (slotKey: ModelSlotKey, model: string, providerId?: string) => {
      const parsed = parseModelWithThinking(model);
      const nextModel = parsed.baseModel;

      setDirtyEnv((prev) => ({
        ...prev,
        [slotKey]: nextModel,
      }));

      if (providerId) {
        setSelectedProviderBySlot((prev) => ({
          ...prev,
          [slotKey]: providerId,
        }));
      }

      if (!nextModel) {
        setThinkingBySlot((prev) => ({
          ...prev,
          [slotKey]: null,
        }));
        return;
      }

      const capability = resolveThinkingCapability(slotKey, nextModel, providerId);

      if (capability !== 'codex') {
        setThinkingBySlot((prev) => ({
          ...prev,
          [slotKey]: null,
        }));
        return;
      }

      if (parsed.thinking) {
        setThinkingBySlot((prev) => ({
          ...prev,
          [slotKey]: parsed.thinking,
        }));
      }
    },
    [resolveThinkingCapability]
  );

  const handleModelClear = useCallback((slotKey: ModelSlotKey) => {
    setDirtyEnv((prev) => ({
      ...prev,
      [slotKey]: '',
    }));
    setThinkingBySlot((prev) => ({
      ...prev,
      [slotKey]: null,
    }));
  }, []);

  const handleThinkingChange = useCallback((slotKey: ModelSlotKey, value: ThinkingLevel | null) => {
    setThinkingBySlot((prev) => ({
      ...prev,
      [slotKey]: value,
    }));
  }, []);

  const handleSlotToggle = useCallback((slotKey: ModelSlotKey) => {
    setExpandedSlot((prev) => (prev === slotKey ? null : slotKey));
  }, []);

  const isLoading = pageStatus === 'loading';
  const isSaving = pageStatus === 'saving';
  const currentFileName = fileHandle?.name ?? '~/.claude/settings.json';

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>{t('agent_settings.title')}</h1>
        <p className={styles.subtitle}>{t('agent_settings.description')}</p>
      </div>

      {!fsSupported && (
        <div className={styles.browserWarning}>
          <span className={styles.browserWarningIcon}>⚠️</span>
          <span>{t('agent_settings.browser_not_supported')}</span>
        </div>
      )}

      <Card>
        <div className={styles.fileSection}>
          <div className={styles.fileSectionHeader}>
            <h3 className={styles.fileSectionTitle}>{t('agent_settings.file_section_title')}</h3>
            <div className={styles.fileActions}>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleOpenFile()}
                disabled={isLoading || isSaving}
              >
                {t('agent_settings.open_file')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleReload()}
                disabled={!fsSupported || !fileHandle || isLoading || isSaving}
                loading={isLoading}
              >
                {t('agent_settings.reload_file')}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={!fsSupported || !fileHandle || !settings || !isDirty || isSaving}
                loading={isSaving}
              >
                {t('agent_settings.save_changes')}
              </Button>
            </div>
          </div>

          <div className={styles.fileStatusBar}>
            <span
              className={`${styles.fileStatusDot} ${pageStatus === 'loaded' ? styles.connected : styles.disconnected}`}
            />
            {!fsSupported ? (
              <span>{t('agent_settings.browser_not_supported')}</span>
            ) : isLoading ? (
              <span>{t('common.loading')}</span>
            ) : isSaving ? (
              <span>{t('agent_settings.saving')}</span>
            ) : pageStatus === 'loaded' && settings ? (
              <>
                <span>{t('agent_settings.file_loaded')}</span>
                <span className={styles.fileStatusName}>{currentFileName}</span>
              </>
            ) : pageStatus === 'error' ? (
              <span>{loadError || t('agent_settings.file_load_failed')}</span>
            ) : fileHandle ? (
              <>
                <span>{t('agent_settings.file_handle_saved')}</span>
                <span className={styles.fileStatusName}>{currentFileName}</span>
              </>
            ) : (
              <span>{t('agent_settings.file_not_loaded')}</span>
            )}
          </div>
        </div>
      </Card>

      {isDirty && (pageStatus === 'loaded' || pageStatus === 'error') && (
        <div className={styles.dirtyBar}>
          <span className={styles.dirtyBarText}>{t('agent_settings.unsaved_changes')}</span>
          <div className={styles.dirtyBarActions}>
            <Button size="sm" variant="ghost" onClick={handleReset} disabled={isSaving}>
              {t('agent_settings.reset')}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              loading={isSaving}
              disabled={!fileHandle || !fsSupported}
            >
              {t('agent_settings.save_changes')}
            </Button>
          </div>
        </div>
      )}

      {settings && (
        <div className={styles.slotsGrid}>
          {MODEL_SLOTS.map((slot) => {
            const slotDirty =
              dirtyEnv[slot.key] !== originalEnv[slot.key] ||
              thinkingBySlot[slot.key] !== originalThinkingBySlot[slot.key];
            const displayValue = slotDirty
              ? buildModelValueForSlot(slot.key, dirtyEnv[slot.key])
              : normalizeText(settings.env?.[slot.key]);

            return (
              <ModelSlotCard
                key={slot.key}
                slot={slot}
                currentValue={dirtyEnv[slot.key]}
                displayValue={displayValue}
                slotDirty={slotDirty}
                thinkingLevel={thinkingBySlot[slot.key]}
                selectedProviderId={selectedProviderBySlot[slot.key]}
                sections={sections}
                modelsByProvider={modelsByProvider}
                modelsLoading={modelsLoading}
                expanded={expandedSlot === slot.key}
                onToggle={() => handleSlotToggle(slot.key)}
                onProviderPick={(providerId) => handleProviderPick(slot.key, providerId)}
                onSelect={(model, providerId) => handleModelSelect(slot.key, model, providerId)}
                onClear={() => handleModelClear(slot.key)}
                onThinkingChange={(value) => handleThinkingChange(slot.key, value)}
                onTestConnectivity={(model, providerId) =>
                  testModelConnectivity(slot.key, model, providerId)
                }
              />
            );
          })}
        </div>
      )}

      {!settings && (
        <Card>
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>{fsSupported ? '📄' : '⚠️'}</span>
            <h3 className={styles.emptyTitle}>{t('agent_settings.empty_title')}</h3>
            <p className={styles.emptyDesc}>{t('agent_settings.empty_desc')}</p>
            {pageStatus === 'error' && loadError ? <p className={styles.emptyDesc}>{loadError}</p> : null}
            {fsSupported && (
              <Button
                size="sm"
                onClick={() => void handleOpenFile()}
                disabled={isLoading || isSaving}
              >
                {t('agent_settings.open_file')}
              </Button>
            )}
          </div>
        </Card>
      )}

      {settings && (
        <Card>
          <div className={styles.previewSection}>
            <div className={styles.previewHeader}>
              <h3 className={styles.previewTitle}>{t('agent_settings.json_preview')}</h3>
            </div>
            <pre className={styles.previewCode}>{previewJson}</pre>
          </div>
        </Card>
      )}
    </div>
  );
}
