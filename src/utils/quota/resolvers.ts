/**
 * Resolver functions for extracting data from auth files.
 */

import type { AuthFileItem } from '@/types';
import {
  normalizeStringValue,
  normalizePlanType,
  parseIdTokenPayload
} from './parsers';

export function extractCodexChatgptAccountId(value: unknown): string | null {
  const payload = parseIdTokenPayload(value);
  if (!payload) return null;
  return normalizeStringValue(payload.chatgpt_account_id ?? payload.chatgptAccountId);
}

export function resolveCodexChatgptAccountId(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;

  const candidates = [file.id_token, metadata?.id_token, attributes?.id_token];

  for (const candidate of candidates) {
    const id = extractCodexChatgptAccountId(candidate);
    if (id) return id;
  }

  return null;
}

export function resolveCodexPlanType(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;
  const idToken =
    file && typeof file.id_token === 'object' && file.id_token !== null
      ? (file.id_token as Record<string, unknown>)
      : null;
  const metadataIdToken =
    metadata && typeof metadata.id_token === 'object' && metadata.id_token !== null
      ? (metadata.id_token as Record<string, unknown>)
      : null;
  const candidates = [
    file.plan_type,
    file.planType,
    file['plan_type'],
    file['planType'],
    file.id_token,
    idToken?.plan_type,
    idToken?.planType,
    metadata?.plan_type,
    metadata?.planType,
    metadata?.id_token,
    metadataIdToken?.plan_type,
    metadataIdToken?.planType,
    attributes?.plan_type,
    attributes?.planType,
    attributes?.id_token
  ];

  for (const candidate of candidates) {
    const planType = normalizePlanType(candidate);
    if (planType) return planType;
  }

  return null;
}

const CODEX_PLAN_SORT_ORDER = new Map([
  ['pro', 0],
  ['prolite', 0],
  ['pro-lite', 0],
  ['pro_lite', 0],
  ['plus', 1],
  ['team', 2],
  ['free', 3],
]);

export function compareCodexAuthFilesByPlan(left: AuthFileItem, right: AuthFileItem): number {
  const leftPlan = normalizePlanType(resolveCodexPlanType(left)) ?? '';
  const rightPlan = normalizePlanType(resolveCodexPlanType(right)) ?? '';
  const leftOrder = CODEX_PLAN_SORT_ORDER.get(leftPlan) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = CODEX_PLAN_SORT_ORDER.get(rightPlan) ?? Number.MAX_SAFE_INTEGER;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return String(left.name ?? '').localeCompare(String(right.name ?? ''), undefined, {
    sensitivity: 'accent',
  });
}

export const sortCodexQuotaFiles = (files: AuthFileItem[]): AuthFileItem[] =>
  [...files].sort(compareCodexAuthFilesByPlan);

export function resolveCodexSubscriptionActiveUntil(file: AuthFileItem): string | null {
  return resolveCodexSubscriptionTimestamp(file, [
    'chatgpt_subscription_active_until',
    'chatgptSubscriptionActiveUntil',
    'subscription_active_until',
    'subscriptionActiveUntil',
  ]);
}

export function resolveCodexSubscriptionActiveStart(file: AuthFileItem): string | null {
  return resolveCodexSubscriptionTimestamp(file, [
    'chatgpt_subscription_active_start',
    'chatgptSubscriptionActiveStart',
    'subscription_active_start',
    'subscriptionActiveStart',
  ]);
}

function resolveCodexSubscriptionTimestamp(
  file: AuthFileItem,
  fieldNames: string[]
): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;
  const idToken =
    file && typeof file.id_token === 'object' && file.id_token !== null
      ? (file.id_token as Record<string, unknown>)
      : null;
  const metadataIdToken =
    metadata && typeof metadata.id_token === 'object' && metadata.id_token !== null
      ? (metadata.id_token as Record<string, unknown>)
      : null;

  const candidates = [
    ...fieldNames.map((fieldName) => file[fieldName]),
    file.id_token,
    ...fieldNames.map((fieldName) => idToken?.[fieldName]),
    ...fieldNames.map((fieldName) => metadata?.[fieldName]),
    metadata?.id_token,
    ...fieldNames.map((fieldName) => metadataIdToken?.[fieldName]),
    ...fieldNames.map((fieldName) => attributes?.[fieldName]),
    attributes?.id_token,
  ];

  for (const candidate of candidates) {
    const value = normalizeStringValue(candidate);
    if (value) return value;
  }

  return null;
}

export function extractGeminiCliProjectId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const matches = Array.from(value.matchAll(/\(([^()]+)\)/g));
  if (matches.length === 0) return null;
  const candidate = matches[matches.length - 1]?.[1]?.trim();
  return candidate ? candidate : null;
}

export function resolveGeminiCliProjectId(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;

  const candidates = [
    file.account,
    file['account'],
    metadata?.account,
    attributes?.account
  ];

  for (const candidate of candidates) {
    const projectId = extractGeminiCliProjectId(candidate);
    if (projectId) return projectId;
  }

  return null;
}
