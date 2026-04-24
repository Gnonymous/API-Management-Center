const CC_SWITCH_LAST_REFRESH = '2026-04-19T18:26:08.378424Z';

type CcSwitchTokenValue = string | null;

type CcSwitchImportJson = {
  auth_mode: 'chatgpt';
  OPENAI_API_KEY: null;
  tokens: {
    id_token: CcSwitchTokenValue;
    access_token: CcSwitchTokenValue;
    refresh_token: CcSwitchTokenValue;
    account_id: CcSwitchTokenValue;
  };
  last_refresh: string;
};

const readTokenField = (json: Record<string, unknown>, key: string): CcSwitchTokenValue => {
  const value = json[key];
  return typeof value === 'string' && value.trim() ? value : null;
};

export const buildCcSwitchImportJson = (json: Record<string, unknown>): CcSwitchImportJson => ({
  auth_mode: 'chatgpt',
  OPENAI_API_KEY: null,
  tokens: {
    id_token: readTokenField(json, 'id_token'),
    access_token: readTokenField(json, 'access_token'),
    refresh_token: readTokenField(json, 'refresh_token'),
    account_id: readTokenField(json, 'account_id'),
  },
  last_refresh: CC_SWITCH_LAST_REFRESH,
});

export const buildCcSwitchImportJsonText = (json: Record<string, unknown>): string =>
  JSON.stringify(buildCcSwitchImportJson(json), null, 2);
