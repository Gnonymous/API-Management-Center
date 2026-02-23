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
import { useAuthStore, useConfigStore, useNotificationStore, useModelsStore, useThemeStore } from '@/stores';
import { apiKeysApi } from '@/services/api/apiKeys';
import { classifyModels, type ModelGroup } from '@/utils/models';
import { copyToClipboard } from '@/utils/clipboard';
import { normalizeApiBase } from '@/utils/connection';
import iconGemini from '@/assets/icons/gemini.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconDeepseek from '@/assets/icons/deepseek.svg';
import iconMinimax from '@/assets/icons/minimax.svg';
import styles from './ApiEndpointsPage.module.scss';

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const CODE_LANGUAGES = ['curl', 'python', 'node'] as const;
type CodeLang = (typeof CODE_LANGUAGES)[number];

const MODEL_GROUP_ICONS: Record<string, string | { light: string; dark: string }> = {
  gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
  claude: iconClaude,
  gemini: iconGemini,
  qwen: iconQwen,
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  glm: iconGlm,
  grok: iconGrok,
  deepseek: iconDeepseek,
  minimax: iconMinimax,
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const maskKey = (key: string): string => {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 5)}${'•'.repeat(Math.min(key.length - 8, 16))}${key.slice(-4)}`;
};

const buildBaseUrl = (managementBase: string): string => normalizeApiBase(managementBase);

const generateCurl = (baseUrl: string, apiKey: string, model: string): string =>
  `curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "${model}",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'`;

const generatePython = (baseUrl: string, apiKey: string, model: string): string =>
  `from openai import OpenAI

client = OpenAI(
    api_key="${apiKey}",
    base_url="${baseUrl}/v1"
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`;

const generateNode = (baseUrl: string, apiKey: string, model: string): string =>
  `import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: '${apiKey}',
  baseURL: '${baseUrl}/v1',
});

const response = await client.chat.completions.create({
  model: '${model}',
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(response.choices[0].message.content);`;

const normalizeApiKeyList = (input: unknown): string[] => {
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
          ? (record['api-key'] ?? record['apiKey'] ?? record.key ?? record.Key)
          : '';
    const trimmed = String(value ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    keys.push(trimmed);
  });
  return keys;
};

// ────────────────────────────────────────────────────────────────────────────
// ProviderCard sub-component
// ────────────────────────────────────────────────────────────────────────────

interface ProviderCardProps {
  group: ModelGroup;
  baseUrl: string;
  apiKeys: string[];
  resolvedTheme: string;
}

function ProviderCard({ group, baseUrl, apiKeys, resolvedTheme }: ProviderCardProps) {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [selectedKeyIdx, setSelectedKeyIdx] = useState(0);
  const [keyVisible, setKeyVisible] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeLang, setCodeLang] = useState<CodeLang>('curl');
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const [testModel, setTestModel] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  const currentKey = apiKeys[selectedKeyIdx] ?? '';
  const v1Url = `${baseUrl}/v1/chat/completions`;
  const sampleModel = group.items[0]?.name ?? 'model-name';

  const iconEntry = MODEL_GROUP_ICONS[group.id];
  const iconSrc = iconEntry
    ? typeof iconEntry === 'string'
      ? iconEntry
      : resolvedTheme === 'dark'
        ? iconEntry.dark
        : iconEntry.light
    : null;

  const handleCopy = async (text: string, field: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedField(field);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedField(null), 1500);
      showNotification(t('common.copy') + ' ✓', 'success');
    }
  };

  const handleTest = async () => {
    if (!currentKey || !testModel) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentKey}`,
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
      });
      if (res.ok) {
        setTestResult({ ok: true, msg: t('api_endpoints.test_success') });
      } else {
        const body = await res.text().catch(() => '');
        setTestResult({ ok: false, msg: `${res.status} ${body.slice(0, 120)}` });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, msg });
    } finally {
      setTesting(false);
    }
  };

  const codeSnippet = useMemo(() => {
    const key = currentKey || 'YOUR_API_KEY';
    const model = testModel || sampleModel;
    if (codeLang === 'curl') return generateCurl(baseUrl, key, model);
    if (codeLang === 'python') return generatePython(baseUrl, key, model);
    return generateNode(baseUrl, key, model);
  }, [codeLang, baseUrl, currentKey, testModel, sampleModel]);

  const displayModels = modelsExpanded ? group.items : group.items.slice(0, 12);
  const hasMoreModels = group.items.length > 12;

  return (
    <div className={styles.providerCard}>
      {/* Header */}
      <div className={styles.cardHeader}>
        {iconSrc ? (
          <img src={iconSrc} alt="" className={styles.providerIcon} />
        ) : (
          <div className={styles.providerIconFallback}>
            {group.label.charAt(0).toUpperCase()}
          </div>
        )}
        <span className={styles.providerName}>{group.label}</span>
        <span
          className={`${styles.statusDot} ${group.items.length > 0 ? styles.active : styles.inactive}`}
          title={group.items.length > 0 ? t('api_endpoints.active') : t('api_endpoints.inactive')}
        />
      </div>

      {/* Body */}
      <div className={styles.cardBody}>
        {/* Base URL */}
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>{t('api_endpoints.base_url')}</span>
          <div className={styles.infoValue}>
            <span className={styles.monoValue} title={v1Url}>{v1Url}</span>
            <button
              className={`${styles.copyBtn} ${copiedField === 'url' ? styles.copied : ''}`}
              onClick={() => handleCopy(v1Url, 'url')}
              title={t('common.copy')}
            >
              {copiedField === 'url' ? <IconCheck size={14} /> : <IconCode size={14} />}
            </button>
          </div>
        </div>

        {/* API Key */}
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>{t('api_endpoints.api_key')}</span>
          <div className={styles.infoValue}>
            {apiKeys.length > 1 ? (
              <select
                className={styles.keySelect}
                value={selectedKeyIdx}
                onChange={(e) => {
                  setSelectedKeyIdx(Number(e.target.value));
                  setKeyVisible(false);
                }}
              >
                {apiKeys.map((k, i) => (
                  <option key={i} value={i}>
                    {keyVisible ? k : maskKey(k)}
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
                  onClick={() => setKeyVisible((v) => !v)}
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

        {/* Models */}
        <div className={styles.modelSection}>
          <div className={styles.modelHeader}>
            <span className={styles.infoLabel}>{t('api_endpoints.models')}</span>
            <span className={styles.modelCount}>
              {t('api_endpoints.models_count', { count: group.items.length })}
            </span>
          </div>
          {group.items.length > 0 ? (
            <>
              <div className={styles.modelTags}>
                {displayModels.map((m) => (
                  <span key={m.name} className={styles.modelTag} title={m.description || m.name}>
                    <span className={styles.modelName}>{m.name}</span>
                  </span>
                ))}
              </div>
              {hasMoreModels && (
                <button className={styles.showMore} onClick={() => setModelsExpanded((v) => !v)}>
                  {modelsExpanded
                    ? t('api_endpoints.collapse_models')
                    : t('api_endpoints.show_all_models', { count: group.items.length })}
                </button>
              )}
            </>
          ) : (
            <span className={styles.modelCount}>{t('api_endpoints.no_models')}</span>
          )}
        </div>

        {/* Quick test */}
        {currentKey && group.items.length > 0 && (
          <div className={styles.testSection}>
            <select
              className={styles.testSelect}
              value={testModel}
              onChange={(e) => setTestModel(e.target.value)}
            >
              <option value="">{t('api_endpoints.test_select_model')}</option>
              {group.items.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleTest}
              loading={testing}
              disabled={!testModel || testing}
            >
              {'连接测试'}
            </Button>
          </div>
        )}
        {testResult && (
          <div className={`${styles.testResult} ${testResult.ok ? styles.success : styles.error}`}>
            {testResult.msg}
          </div>
        )}

        {/* Code snippets */}
        <div className={styles.codeSection}>
          <button className={styles.codeToggle} onClick={() => setCodeOpen((v) => !v)}>
            <IconCode size={14} />
            {t('api_endpoints.code_snippets')}
            {codeOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </button>
          {codeOpen && (
            <>
              <div className={styles.codeTabs}>
                {CODE_LANGUAGES.map((lang) => (
                  <button
                    key={lang}
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
                  className={`${styles.copyBtn} ${styles.codeCopyBtn} ${copiedField === 'code' ? styles.copied : ''}`}
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

// ────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────

export function ApiEndpointsPage() {
  const { t, i18n } = useTranslation();
  const { showNotification } = useNotificationStore();
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  const auth = useAuthStore();
  const config = useConfigStore((s) => s.config);

  const models = useModelsStore((s) => s.models);
  const modelsLoading = useModelsStore((s) => s.loading);
  const fetchModelsFromStore = useModelsStore((s) => s.fetchModels);

  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const apiKeysCache = useRef<string[]>([]);

  const baseUrl = useMemo(() => buildBaseUrl(auth.apiBase), [auth.apiBase]);

  const otherLabel = useMemo(
    () => (i18n.language?.toLowerCase().startsWith('zh') ? '其他' : 'Other'),
    [i18n.language]
  );
  const groupedModels = useMemo(() => classifyModels(models, { otherLabel }), [models, otherLabel]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groupedModels;
    const q = search.trim().toLowerCase();
    return groupedModels
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q) ||
            (m.alias && m.alias.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.items.length > 0 || g.label.toLowerCase().includes(q));
  }, [groupedModels, search]);

  const resolveApiKeys = useCallback(async () => {
    if (apiKeysCache.current.length) {
      setApiKeys(apiKeysCache.current);
      return;
    }
    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      setApiKeys(configKeys);
      return;
    }
    try {
      const list = await apiKeysApi.list();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      setApiKeys(normalized);
    } catch (err) {
      console.warn('Failed to load API keys:', err);
    }
  }, [config?.apiKeys]);

  const fetchModels = useCallback(
    async (forceRefresh = false) => {
      if (auth.connectionStatus !== 'connected' || !auth.apiBase) return;
      if (forceRefresh) apiKeysCache.current = [];
      try {
        await resolveApiKeys();
        const keys = apiKeysCache.current;
        await fetchModelsFromStore(auth.apiBase, keys[0], forceRefresh);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        showNotification(msg, 'error');
      }
    },
    [auth.connectionStatus, auth.apiBase, resolveApiKeys, fetchModelsFromStore, showNotification]
  );

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.connectionStatus, auth.apiBase]);

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('api_endpoints.title')}</h1>
      <p className={styles.pageSubtitle}>{t('api_endpoints.description')}</p>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <IconSearch size={15} className={styles.searchIcon} />
          <input
            type="text"
            placeholder={t('api_endpoints.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => fetchModels(true)}
          loading={modelsLoading}
        >
          {t('common.refresh')}
        </Button>
      </div>

      {/* Provider cards */}
      {modelsLoading && models.length === 0 ? (
        <Card>
          <div className="hint">{t('common.loading')}</div>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>{t('api_endpoints.no_providers')}</div>
          <div className={styles.emptyDesc}>{t('api_endpoints.no_providers_desc')}</div>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredGroups.map((group) => (
            <ProviderCard
              key={group.id}
              group={group}
              baseUrl={baseUrl}
              apiKeys={apiKeys}
              resolvedTheme={resolvedTheme}
            />
          ))}
        </div>
      )}
    </div>
  );
}
