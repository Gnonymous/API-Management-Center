import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  IconSearch,
  IconCheck,
  IconCode,
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
} from '@/components/ui/icons';
import { useNotificationStore, useThemeStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import { normalizeApiBase } from '@/utils/connection';
import {
  useEndpointProviders,
  normalizeText,
  DEFAULT_MODELS_STATE,
  type EndpointProviderEntry,
  type ProviderModelsState,
  type SourceSection,
} from '@/hooks/useEndpointProviders';
import iconGemini from '@/assets/icons/gemini.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconAntigravity from '@/assets/icons/antigravity.svg';
import styles from './ApiEndpointsPage.module.scss';

const CODE_LANGUAGES = ['curl', 'python', 'node'] as const;
type CodeLang = (typeof CODE_LANGUAGES)[number];
const FIXED_API_BASE_URL = 'http://127.0.0.1:8317/v1';

type ProviderIconKind = 'openai' | 'claude' | 'gemini' | 'antigravity';

interface ProviderCardProps {
  provider: EndpointProviderEntry;
  modelsState: ProviderModelsState;
  resolvedTheme: string;
  selectedKeyIdx: number;
  onSelectKey: (providerId: string, keyIndex: number) => void;
  onReloadModels: (providerId: string) => void;
}

type ThemeIcon = string | { light: string; dark: string };

const ICONS_BY_KIND: Record<ProviderIconKind, ThemeIcon> = {
  openai: { light: iconOpenaiLight, dark: iconOpenaiDark },
  claude: iconClaude,
  gemini: iconGemini,
  antigravity: iconAntigravity,
};

const maskKey = (key: string): string => {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 5)}${'•'.repeat(Math.min(key.length - 8, 16))}${key.slice(-4)}`;
};

const buildClientBaseUrl = (): string => {
  const normalized = normalizeApiBase(FIXED_API_BASE_URL);
  if (!normalized) return '';

  const trimmed = normalized.replace(/\/+$/g, '');
  if (/\/v1\/chat\/completions$/i.test(trimmed)) {
    return trimmed.replace(/\/chat\/completions$/i, '');
  }
  if (/\/v1$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
};

const buildChatCompletionsUrl = (): string => {
  const clientBaseUrl = buildClientBaseUrl();
  if (!clientBaseUrl) return '';
  return `${clientBaseUrl}/chat/completions`;
};

const generateCurl = (chatUrl: string, apiKey: string, model: string): string =>
  `curl ${chatUrl} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "${model}",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`;

const generatePython = (clientBaseUrl: string, apiKey: string, model: string): string =>
  `from openai import OpenAI

client = OpenAI(
    api_key="${apiKey}",
    base_url="${clientBaseUrl}"
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`;

const generateNode = (clientBaseUrl: string, apiKey: string, model: string): string =>
  `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: '${apiKey}',
  baseURL: '${clientBaseUrl}',
});

const response = await client.chat.completions.create({
  model: '${model}',
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(response.choices[0].message.content);`;

const clampKeyIndex = (index: number, keyCount: number): number => {
  if (keyCount <= 0) return 0;
  return Math.min(Math.max(index, 0), keyCount - 1);
};

const buildSelectionMap = (
  entries: EndpointProviderEntry[],
  previous: Record<string, number>
): Record<string, number> => {
  const next: Record<string, number> = {};

  entries.forEach((entry) => {
    const prevIndex = previous[entry.id] ?? 0;
    next[entry.id] = clampKeyIndex(prevIndex, entry.keyOptions.length);
  });

  return next;
};

const resolveProviderIconKind = (provider: EndpointProviderEntry): ProviderIconKind | null => {
  const key = provider.providerKey.toLowerCase();
  const name = provider.name.toLowerCase();
  const haystack = `${key} ${name}`;

  if (haystack.includes('antigravity')) return 'antigravity';
  if (haystack.includes('claude') || haystack.includes('anthropic')) return 'claude';
  if (haystack.includes('gemini')) return 'gemini';
  if (
    haystack.includes('openai') ||
    haystack.includes('codex') ||
    haystack.includes('gpt')
  ) {
    return 'openai';
  }

  return null;
};

function ProviderCard({
  provider,
  modelsState,
  resolvedTheme,
  selectedKeyIdx,
  onSelectKey,
  onReloadModels,
}: ProviderCardProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [keyVisible, setKeyVisible] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeLang, setCodeLang] = useState<CodeLang>('curl');
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const [testModel, setTestModel] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [realKeyVisible, setRealKeyVisible] = useState(false);
  const [realKeyIdx, setRealKeyIdx] = useState(0);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeSelectedKeyIdx = clampKeyIndex(selectedKeyIdx, provider.keyOptions.length);
  const selectedKey = provider.keyOptions[safeSelectedKeyIdx];
  const currentKey = selectedKey?.apiKey ?? '';
  const displayBaseUrl = FIXED_API_BASE_URL;
  const chatCompletionsUrl = buildChatCompletionsUrl();
  const clientBaseUrl = buildClientBaseUrl();
  const realKeyOptions = provider.realKeyOptions ?? [];
  const safeRealKeyIdx = clampKeyIndex(realKeyIdx, realKeyOptions.length);
  const currentRealKey = realKeyOptions[safeRealKeyIdx]?.apiKey ?? '';
  const realBaseUrl = normalizeApiBase(provider.realBaseUrl ?? '');

  const iconKind = resolveProviderIconKind(provider);
  const iconEntry = iconKind ? ICONS_BY_KIND[iconKind] : null;
  const iconSrc = iconEntry
    ? typeof iconEntry === 'string'
      ? iconEntry
      : resolvedTheme === 'dark'
        ? iconEntry.dark
        : iconEntry.light
    : null;

  const modelItems = modelsState.models;
  const sampleModel = modelItems[0]?.name ?? 'model-name';
  const displayModels = modelsExpanded ? modelItems : modelItems.slice(0, 12);
  const hasMoreModels = modelItems.length > 12;

  useEffect(() => {
    return () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!testModel) return;
    if (modelItems.some((item) => item.name === testModel)) return;
    setTestModel('');
  }, [modelItems, testModel]);

  useEffect(() => {
    setRealKeyIdx((prev) => clampKeyIndex(prev, realKeyOptions.length));
  }, [realKeyOptions.length]);

  const handleCopy = async (text: string, field: string, successMessage?: string) => {
    const ok = await copyToClipboard(text);
    if (!ok) return;

    setCopiedField(field);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedField(null), 1500);
    showNotification(successMessage ?? `${t('common.copy')} ✓`, 'success');
  };

  const handleTest = async () => {
    if (!chatCompletionsUrl) {
      setTestResult({ ok: false, msg: t('api_endpoints.invalid_provider_base_url') });
      return;
    }
    if (!testModel) {
      setTestResult({ ok: false, msg: t('api_endpoints.test_select_model') });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (currentKey) {
        requestHeaders.Authorization = `Bearer ${currentKey}`;
      }

      const response = await fetch(chatCompletionsUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
      });

      if (response.ok) {
        setTestResult({ ok: true, msg: t('api_endpoints.test_success') });
      } else {
        const body = await response.text().catch(() => '');
        setTestResult({ ok: false, msg: `${response.status} ${body.slice(0, 120)}` });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setTestResult({ ok: false, msg: message });
    } finally {
      setTesting(false);
    }
  };

  const codeSnippet = useMemo(() => {
    const key = currentKey || 'YOUR_API_KEY';
    const model = testModel || sampleModel;

    if (codeLang === 'curl') {
      return generateCurl(chatCompletionsUrl || `${FIXED_API_BASE_URL}/chat/completions`, key, model);
    }
    if (codeLang === 'python') {
      return generatePython(clientBaseUrl || FIXED_API_BASE_URL, key, model);
    }
    return generateNode(clientBaseUrl || FIXED_API_BASE_URL, key, model);
  }, [chatCompletionsUrl, clientBaseUrl, codeLang, currentKey, sampleModel, testModel]);

  return (
    <div className={styles.providerCard}>
      <div className={styles.cardHeader}>
        {iconSrc ? (
          <img src={iconSrc} alt="" className={styles.providerIcon} />
        ) : (
          <div className={styles.providerIconFallback}>{provider.name.charAt(0).toUpperCase()}</div>
        )}
        <span className={styles.providerName}>{provider.name}</span>
        <span
          className={`${styles.statusDot} ${
            modelsState.status === 'success' && modelItems.length > 0 ? styles.active : styles.inactive
          }`}
          title={
            modelsState.status === 'success' && modelItems.length > 0
              ? t('api_endpoints.active')
              : t('api_endpoints.inactive')
          }
        />
      </div>

      <div className={styles.cardBody}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>{t('api_endpoints.base_url')}</span>
          <div className={styles.infoValue}>
            <span className={styles.monoValue} title={displayBaseUrl || '-'}>
              {displayBaseUrl || '-'}
            </span>
            {displayBaseUrl && (
              <button
                className={`${styles.copyBtn} ${copiedField === 'url' ? styles.copied : ''}`}
                onClick={() => handleCopy(displayBaseUrl, 'url')}
                title={t('common.copy')}
              >
                {copiedField === 'url' ? <IconCheck size={14} /> : <IconCode size={14} />}
              </button>
            )}
          </div>
        </div>

        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>{t('api_endpoints.api_key')}</span>
          <div className={styles.infoValue}>
            {provider.keyOptions.length > 1 ? (
              <select
                className={styles.keySelect}
                value={safeSelectedKeyIdx}
                onChange={(event) => {
                  onSelectKey(provider.id, Number(event.target.value));
                  setKeyVisible(false);
                }}
              >
                {provider.keyOptions.map((keyOption, index) => (
                  <option key={`${provider.id}:key:${index}`} value={index}>
                    {keyVisible ? keyOption.apiKey : maskKey(keyOption.apiKey)}
                  </option>
                ))}
              </select>
            ) : (
              <span className={styles.monoValue}>
                {currentKey
                  ? keyVisible
                    ? currentKey
                    : maskKey(currentKey)
                  : t('api_endpoints.no_api_key')}
              </span>
            )}

            {currentKey && (
              <>
                <button
                  className={styles.eyeBtn}
                  onClick={() => setKeyVisible((visible) => !visible)}
                  title={keyVisible ? t('api_endpoints.hide_key') : t('api_endpoints.show_key')}
                >
                  {keyVisible ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                </button>
                <button
                  className={`${styles.copyBtn} ${copiedField === 'key' ? styles.copied : ''}`}
                  onClick={() => handleCopy(currentKey, 'key')}
                  title={t('common.copy')}
                >
                  {copiedField === 'key' ? <IconCheck size={14} /> : <IconCode size={14} />}
                </button>
              </>
            )}
          </div>
        </div>

        {provider.sourceKind === 'configured-api' && (
          <>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('api_endpoints.real_base_url')}</span>
              <div className={styles.infoValue}>
                <span className={styles.monoValue} title={realBaseUrl || '-'}>
                  {realBaseUrl || '-'}
                </span>
                {realBaseUrl && (
                  <button
                    className={`${styles.copyBtn} ${copiedField === 'real-url' ? styles.copied : ''}`}
                    onClick={() => handleCopy(realBaseUrl, 'real-url')}
                    title={t('common.copy')}
                  >
                    {copiedField === 'real-url' ? <IconCheck size={14} /> : <IconCode size={14} />}
                  </button>
                )}
              </div>
            </div>

            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>{t('api_endpoints.real_api_key')}</span>
              <div className={styles.infoValue}>
                {realKeyOptions.length > 1 ? (
                  <select
                    className={styles.keySelect}
                    value={safeRealKeyIdx}
                    onChange={(event) => {
                      setRealKeyIdx(Number(event.target.value));
                      setRealKeyVisible(false);
                    }}
                  >
                    {realKeyOptions.map((keyOption, index) => (
                      <option key={`${provider.id}:real-key:${index}`} value={index}>
                        {realKeyVisible ? keyOption.apiKey : maskKey(keyOption.apiKey)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={styles.monoValue}>
                    {currentRealKey
                      ? realKeyVisible
                        ? currentRealKey
                        : maskKey(currentRealKey)
                      : t('api_endpoints.no_real_api_key')}
                  </span>
                )}

                {currentRealKey && (
                  <>
                    <button
                      className={styles.eyeBtn}
                      onClick={() => setRealKeyVisible((visible) => !visible)}
                      title={
                        realKeyVisible
                          ? t('api_endpoints.hide_real_api_key')
                          : t('api_endpoints.show_real_api_key')
                      }
                    >
                      {realKeyVisible ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                    </button>
                    <button
                      className={`${styles.copyBtn} ${copiedField === 'real-key' ? styles.copied : ''}`}
                      onClick={() => handleCopy(currentRealKey, 'real-key')}
                      title={t('common.copy')}
                    >
                      {copiedField === 'real-key' ? <IconCheck size={14} /> : <IconCode size={14} />}
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        <div className={styles.modelSection}>
          <div className={styles.modelHeader}>
            <span className={styles.infoLabel}>{t('api_endpoints.models')}</span>
            <span className={styles.modelCount}>
              {modelsState.status === 'loading'
                ? t('api_endpoints.models_loading_provider')
                : t('api_endpoints.models_count', { count: modelItems.length })}
            </span>
          </div>

          {modelsState.status === 'error' ? (
            <div className={styles.modelErrorRow}>
              <span className={styles.modelErrorText}>
                {modelsState.error || t('api_endpoints.models_load_failed')}
              </span>
              <button className={styles.modelRetryBtn} onClick={() => onReloadModels(provider.id)}>
                {t('api_endpoints.retry_load_models')}
              </button>
            </div>
          ) : modelItems.length > 0 ? (
            <>
              <div className={styles.modelTags}>
                {displayModels.map((model) => {
                  const modelField = `model:${provider.id}:${model.name}`;
                  return (
                    <button
                      key={`${provider.id}:${model.name}`}
                      type="button"
                      className={`${styles.modelTag} ${
                        copiedField === modelField ? styles.modelTagCopied : ''
                      }`}
                      title={t('api_endpoints.copy_model')}
                      onClick={() =>
                        handleCopy(
                          model.name,
                          modelField,
                          t('api_endpoints.model_copied', { model: model.name })
                        )
                      }
                    >
                      <span className={styles.modelName}>{model.name}</span>
                      {model.alias && model.alias !== model.name && (
                        <span className={styles.modelAlias}>{model.alias}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {hasMoreModels && (
                <button className={styles.showMore} onClick={() => setModelsExpanded((expanded) => !expanded)}>
                  {modelsExpanded
                    ? t('api_endpoints.collapse_models')
                    : t('api_endpoints.show_all_models', { count: modelItems.length })}
                </button>
              )}
            </>
          ) : (
            <span className={styles.modelCount}>
              {modelsState.status === 'loading'
                ? t('api_endpoints.models_loading_provider')
                : t('api_endpoints.no_models')}
            </span>
          )}
        </div>

        <div className={styles.testSection}>
          <select
            className={styles.testSelect}
            value={testModel}
            onChange={(event) => setTestModel(event.target.value)}
          >
            <option value="">
              {modelsState.status === 'loading'
                ? t('api_endpoints.models_loading_provider')
                : t('api_endpoints.test_select_model')}
            </option>
            {modelItems.map((model) => (
              <option key={`${provider.id}:test:${model.name}`} value={model.name}>
                {model.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleTest}
            loading={testing}
            disabled={!testModel || testing || !chatCompletionsUrl}
          >
            {t('api_endpoints.quick_test')}
          </Button>
        </div>

        {testResult && (
          <div className={`${styles.testResult} ${testResult.ok ? styles.success : styles.error}`}>
            {testResult.msg}
          </div>
        )}

        <div className={styles.codeSection}>
          <button className={styles.codeToggle} onClick={() => setCodeOpen((open) => !open)}>
            <IconCode size={14} />
            {t('api_endpoints.code_snippets')}
            {codeOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </button>

          {codeOpen && (
            <>
              <div className={styles.codeTabs}>
                {CODE_LANGUAGES.map((lang) => (
                  <button
                    key={`${provider.id}:lang:${lang}`}
                    className={`${styles.codeTab} ${codeLang === lang ? styles.active : ''}`}
                    onClick={() => setCodeLang(lang)}
                  >
                    {lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : 'Node.js'}
                  </button>
                ))}
              </div>

              <div className={styles.codeBlock}>
                <pre>{codeSnippet}</pre>
                <button
                  className={`${styles.copyBtn} ${styles.codeCopyBtn} ${
                    copiedField === 'code' ? styles.copied : ''
                  }`}
                  onClick={() => handleCopy(codeSnippet, 'code')}
                  title={t('common.copy')}
                >
                  {copiedField === 'code' ? <IconCheck size={14} /> : <IconCode size={14} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ApiEndpointsPage() {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);

  const {
    providerEntries,
    modelsByProvider,
    pageLoading,
    reload,
    reloadProviderModels,
  } = useEndpointProviders();

  const [selectedKeyIndexByProvider, setSelectedKeyIndexByProvider] = useState<Record<string, number>>(
    {}
  );
  const [search, setSearch] = useState('');

  const selectedKeyIndexRef = useRef<Record<string, number>>({});

  useEffect(() => {
    selectedKeyIndexRef.current = selectedKeyIndexByProvider;
  }, [selectedKeyIndexByProvider]);

  useEffect(() => {
    const selectionMap = buildSelectionMap(providerEntries, selectedKeyIndexRef.current);
    selectedKeyIndexRef.current = selectionMap;
    setSelectedKeyIndexByProvider(selectionMap);
  }, [providerEntries]);

  const handleSelectKey = useCallback((providerId: string, keyIndex: number) => {
    setSelectedKeyIndexByProvider((prev) => {
      const entry = providerEntries.find((item) => item.id === providerId);
      if (!entry) return prev;

      const nextIndex = clampKeyIndex(keyIndex, entry.keyOptions.length);
      const next = { ...prev, [providerId]: nextIndex };
      selectedKeyIndexRef.current = next;
      return next;
    });
  }, [providerEntries]);

  const handleReloadProviderModels = useCallback(
    (providerId: string) => {
      reloadProviderModels(providerId);
    },
    [reloadProviderModels]
  );

  const filteredProviders = useMemo(() => {
    if (!search.trim()) return providerEntries;

    const keyword = search.trim().toLowerCase();
    return providerEntries.filter((entry) => {
      const byName = entry.name.toLowerCase().includes(keyword);
      const byProviderKey = entry.providerKey.toLowerCase().includes(keyword);
      const state = modelsByProvider[entry.id];
      const byModels = (state?.models ?? []).some(
        (model) =>
          model.name.toLowerCase().includes(keyword) ||
          normalizeText(model.alias).toLowerCase().includes(keyword)
      );
      return byName || byProviderKey || byModels;
    });
  }, [modelsByProvider, providerEntries, search]);

  const sections = useMemo<SourceSection[]>(() => {
    const authItems = filteredProviders.filter((item) => item.sourceKind === 'auth-proxy');
    const configuredItems = filteredProviders.filter((item) => item.sourceKind === 'configured-api');

    return [
      {
        id: 'auth-proxy',
        title: t('api_endpoints.source_auth_proxy'),
        items: authItems,
      },
      {
        id: 'configured-api',
        title: t('api_endpoints.source_configured_api'),
        items: configuredItems,
      },
    ];
  }, [filteredProviders, t]);

  const modelsLoading =
    pageLoading ||
    providerEntries.some((entry) => {
      const state = modelsByProvider[entry.id];
      return state?.status === 'loading';
    });

  const hasAnyProviders = sections.some((section) => section.items.length > 0);

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('api_endpoints.title')}</h1>
      <p className={styles.pageSubtitle}>{t('api_endpoints.description')}</p>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <IconSearch size={15} className={styles.searchIcon} />
          <input
            type="text"
            placeholder={t('api_endpoints.search_placeholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => void reload(true)} loading={modelsLoading}>
          {t('common.refresh')}
        </Button>
      </div>

      {pageLoading && providerEntries.length === 0 ? (
        <Card>
          <div className="hint">{t('common.loading')}</div>
        </Card>
      ) : !hasAnyProviders ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('api_endpoints.no_providers')}</div>
          <div className={styles.emptyDesc}>{t('api_endpoints.no_providers_desc')}</div>
        </div>
      ) : (
        <div className={styles.sectionList}>
          {sections.map((section) => (
            <section key={section.id} className={styles.sourceSection}>
              <div className={styles.sourceHeader}>
                <h2 className={styles.sourceTitle}>{section.title}</h2>
                <span className={styles.sourceCount}>{section.items.length}</span>
              </div>
              {section.items.length > 0 ? (
                <div className={styles.grid}>
                  {section.items.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      modelsState={modelsByProvider[provider.id] ?? DEFAULT_MODELS_STATE}
                      resolvedTheme={resolvedTheme}
                      selectedKeyIdx={selectedKeyIndexByProvider[provider.id] ?? 0}
                      onSelectKey={handleSelectKey}
                      onReloadModels={handleReloadProviderModels}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.sectionEmpty}>{t('api_endpoints.auth_provider_empty')}</div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
