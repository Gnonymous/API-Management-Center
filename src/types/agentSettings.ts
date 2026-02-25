/**
 * Claude Code 本地 settings.json 类型定义
 */

export interface ClaudeSettingsEnv {
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_AUTH_TOKEN?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
  [key: string]: string | undefined;
}

export interface ClaudeSettings {
  env?: ClaudeSettingsEnv;
  model?: string;
  language?: string;
  [key: string]: unknown;
}

export type ModelSlotKey =
  | 'ANTHROPIC_MODEL'
  | 'ANTHROPIC_DEFAULT_OPUS_MODEL'
  | 'ANTHROPIC_DEFAULT_SONNET_MODEL'
  | 'ANTHROPIC_DEFAULT_HAIKU_MODEL';

export type ModelSlotIconKey = 'main' | 'opus' | 'sonnet' | 'haiku';

export interface ModelSlotConfig {
  key: ModelSlotKey;
  labelKey: string;
  descKey: string;
  icon: ModelSlotIconKey;
}

export const MODEL_SLOTS: ModelSlotConfig[] = [
  {
    key: 'ANTHROPIC_MODEL',
    labelKey: 'agent_settings.slot_main_model',
    descKey: 'agent_settings.slot_main_model_desc',
    icon: 'main',
  },
  {
    key: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
    labelKey: 'agent_settings.slot_opus_model',
    descKey: 'agent_settings.slot_opus_model_desc',
    icon: 'opus',
  },
  {
    key: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    labelKey: 'agent_settings.slot_sonnet_model',
    descKey: 'agent_settings.slot_sonnet_model_desc',
    icon: 'sonnet',
  },
  {
    key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    labelKey: 'agent_settings.slot_haiku_model',
    descKey: 'agent_settings.slot_haiku_model_desc',
    icon: 'haiku',
  },
];
