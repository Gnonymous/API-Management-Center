/**
 * Agent Settings API
 * 通过后端代理读写 ~/.claude/settings.json
 */

import { apiClient } from './client';
import type { ClaudeSettings } from '@/types/agentSettings';

const SETTINGS_PATH = '~/.claude/settings.json';

export const agentSettingsApi = {
  /**
   * 读取 ~/.claude/settings.json
   * 尝试后端 /manage/agent/claude-settings 端点
   * 如果不存在，回退到 /manage/local-file 通用端点
   */
  async read(): Promise<ClaudeSettings> {
    try {
      return await apiClient.get<ClaudeSettings>('/manage/agent/claude-settings');
    } catch (primaryError: unknown) {
      // 如果主端点 404，尝试通用文件端点
      const status = (primaryError as { status?: number })?.status;
      if (status === 404) {
        try {
          return await apiClient.get<ClaudeSettings>('/manage/local-file', {
            params: { path: SETTINGS_PATH },
          });
        } catch {
          // 通用端点也不可用，抛出原始错误
          throw primaryError;
        }
      }
      throw primaryError;
    }
  },

  /**
   * 写入 ~/.claude/settings.json
   */
  async write(settings: ClaudeSettings): Promise<void> {
    try {
      await apiClient.put('/manage/agent/claude-settings', settings);
    } catch (primaryError: unknown) {
      const status = (primaryError as { status?: number })?.status;
      if (status === 404) {
        try {
          await apiClient.put('/manage/local-file', {
            path: SETTINGS_PATH,
            content: settings,
          });
          return;
        } catch {
          throw primaryError;
        }
      }
      throw primaryError;
    }
  },
};
