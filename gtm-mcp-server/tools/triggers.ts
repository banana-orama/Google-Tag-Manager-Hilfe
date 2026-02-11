/**
 * Trigger-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';
import { validateTriggerConfig, normalizeTriggerType } from '../utils/container-validator.js';

export interface TriggerSummary {
  triggerId: string;
  name: string;
  type: string;
  path: string;
  folderId?: string;
}

export interface TriggerDetails extends TriggerSummary {
  filter?: tagmanager_v2.Schema$Condition[];
  customEventFilter?: tagmanager_v2.Schema$Condition[];
  autoEventFilter?: tagmanager_v2.Schema$Condition[];
  fingerprint?: string;
  notes?: string;
}

function normalizeCondition(condition: any): tagmanager_v2.Schema$Condition {
  const out: any = { ...condition };
  if (!out.type) out.type = 'equals';

  if (Array.isArray(out.parameter)) {
    out.parameter = out.parameter.map((p: any) => ({
      ...p,
      type: p?.type || 'template',
    }));
    return out as tagmanager_v2.Schema$Condition;
  }

  const hasLegacyArgs = out.arg1 !== undefined || out.arg2 !== undefined || out.arg0 !== undefined;
  if (hasLegacyArgs) {
    const left = out.arg0 ?? out.arg1;
    const right = out.arg1 !== undefined && out.arg0 !== undefined ? out.arg1 : out.arg2;
    out.parameter = [];
    if (left !== undefined) out.parameter.push({ key: 'arg0', type: 'template', value: String(left) });
    if (right !== undefined) out.parameter.push({ key: 'arg1', type: 'template', value: String(right) });
    delete out.arg0;
    delete out.arg1;
    delete out.arg2;
  }

  return out as tagmanager_v2.Schema$Condition;
}

function normalizeConditions(conditions?: any[]): tagmanager_v2.Schema$Condition[] | undefined {
  if (!Array.isArray(conditions)) return undefined;
  return conditions.map(normalizeCondition);
}

/**
 * List all triggers in a workspace
 */
export async function listTriggers(workspacePath: string): Promise<TriggerSummary[]> {
  const tagmanager = getTagManagerClient();

  const triggers = await gtmApiCall(() =>
    tagmanager.accounts.containers.workspaces.triggers.list({
      parent: workspacePath,
    })
  );

  if (!triggers.trigger) {
    return [];
  }

  return triggers.trigger.map((trigger) => ({
    triggerId: trigger.triggerId || '',
    name: trigger.name || '',
    type: trigger.type || '',
    path: trigger.path || '',
    folderId: trigger.parentFolderId || undefined,
  }));
}

/**
 * Get a single trigger with full details
 */
export async function getTrigger(triggerPath: string): Promise<TriggerDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const trigger = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.triggers.get({
        path: triggerPath,
      })
    );

    return {
      triggerId: trigger.triggerId || '',
      name: trigger.name || '',
      type: trigger.type || '',
      path: trigger.path || '',
      folderId: trigger.parentFolderId || undefined,
      filter: trigger.filter || undefined,
      customEventFilter: trigger.customEventFilter || undefined,
      autoEventFilter: trigger.autoEventFilter || undefined,
      fingerprint: trigger.fingerprint || undefined,
      notes: trigger.notes || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new trigger
 */
export async function createTrigger(
  workspacePath: string,
  triggerConfig: {
    name: string;
    type: string;
    filter?: tagmanager_v2.Schema$Condition[];
    customEventFilter?: tagmanager_v2.Schema$Condition[];
    autoEventFilter?: tagmanager_v2.Schema$Condition[];
    parentFolderId?: string;
  }
): Promise<TriggerDetails | ApiError> {
  const validationError = await validateTriggerConfig(triggerConfig, workspacePath);
  if (validationError) {
    return validationError;
  }

  const tagmanager = getTagManagerClient();

  // Normalize trigger type to camelCase for GTM API v2
  const normalizedConfig = {
    ...triggerConfig,
    type: normalizeTriggerType(triggerConfig.type),
    filter: normalizeConditions(triggerConfig.filter),
    customEventFilter: normalizeConditions(triggerConfig.customEventFilter),
    autoEventFilter: normalizeConditions(triggerConfig.autoEventFilter),
  };

  try {
    const trigger = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.triggers.create({
        parent: workspacePath,
        requestBody: normalizedConfig,
      })
    );

    return {
      triggerId: trigger.triggerId || '',
      name: trigger.name || '',
      type: trigger.type || '',
      path: trigger.path || '',
      folderId: trigger.parentFolderId || undefined,
      filter: trigger.filter || undefined,
      customEventFilter: trigger.customEventFilter || undefined,
      autoEventFilter: trigger.autoEventFilter || undefined,
      fingerprint: trigger.fingerprint || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'createTrigger', triggerConfig);
  }
}

/**
 * Update an existing trigger
 */
export async function updateTrigger(
  triggerPath: string,
  triggerConfig: Partial<{
    name: string;
    type: string;
    filter: tagmanager_v2.Schema$Condition[];
    customEventFilter: tagmanager_v2.Schema$Condition[];
    autoEventFilter: tagmanager_v2.Schema$Condition[];
    parentFolderId: string;
    notes: string;
  }>,
  fingerprint: string
): Promise<TriggerDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    // GTM update is closer to a full replace for required fields.
    // Fetch current trigger and merge required fields so partial updates from MCP remain valid.
    const current = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.triggers.get({
        path: triggerPath,
      })
    );

    const normalizedType = normalizeTriggerType(triggerConfig.type || current.type || '');
    const requestBody: tagmanager_v2.Schema$Trigger = {
      name: triggerConfig.name ?? current.name ?? undefined,
      type: normalizedType || undefined,
      parentFolderId: triggerConfig.parentFolderId ?? current.parentFolderId ?? undefined,
      notes: triggerConfig.notes ?? current.notes ?? undefined,
      filter: normalizeConditions(triggerConfig.filter as any[]) ?? current.filter ?? undefined,
      customEventFilter: normalizeConditions(triggerConfig.customEventFilter as any[]) ?? current.customEventFilter ?? undefined,
      autoEventFilter: normalizeConditions(triggerConfig.autoEventFilter as any[]) ?? current.autoEventFilter ?? undefined,
    };

    // For customEvent triggers, keep customEventFilter and avoid sending unrelated auto-event filters.
    if (requestBody.type === 'customEvent') {
      if (!Array.isArray(requestBody.customEventFilter) || requestBody.customEventFilter.length === 0) {
        requestBody.customEventFilter = current.customEventFilter ?? requestBody.customEventFilter;
      }
      delete requestBody.autoEventFilter;
    }

    const trigger = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.triggers.update({
        path: triggerPath,
        fingerprint,
        requestBody,
      })
    );

    return {
      triggerId: trigger.triggerId || '',
      name: trigger.name || '',
      type: trigger.type || '',
      path: trigger.path || '',
      folderId: trigger.parentFolderId || undefined,
      filter: trigger.filter || undefined,
      customEventFilter: trigger.customEventFilter || undefined,
      autoEventFilter: trigger.autoEventFilter || undefined,
      fingerprint: trigger.fingerprint || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'updateTrigger', { triggerPath, triggerConfig, fingerprint });
  }
}

/**
 * Delete a trigger (DESTRUCTIVE!)
 */
export async function deleteTrigger(triggerPath: string): Promise<{ deleted: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.triggers.delete({
        path: triggerPath,
      })
    );
    return { deleted: true };
  } catch (error) {
    return handleApiError(error, 'deleteTrigger', { triggerPath });
  }
}

/**
 * Analyze triggers and return summary
 */
export function analyzeTriggerList(triggers: TriggerSummary[]): {
  total: number;
  byType: Record<string, number>;
} {
  const byType: Record<string, number> = {};

  for (const trigger of triggers) {
    byType[trigger.type] = (byType[trigger.type] || 0) + 1;
  }

  return {
    total: triggers.length,
    byType,
  };
}
