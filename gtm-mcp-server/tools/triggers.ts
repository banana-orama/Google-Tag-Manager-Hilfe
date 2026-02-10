/**
 * Trigger-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';
import { validateTriggerConfig } from '../utils/container-validator.js';

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

  try {
    const trigger = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.triggers.create({
        parent: workspacePath,
        requestBody: triggerConfig,
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
    filter: tagmanager_v2.Schema$Condition[];
    customEventFilter: tagmanager_v2.Schema$Condition[];
    autoEventFilter: tagmanager_v2.Schema$Condition[];
    parentFolderId: string;
  }>,
  fingerprint: string
): Promise<TriggerDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const trigger = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.triggers.update({
        path: triggerPath,
        fingerprint,
        requestBody: triggerConfig,
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
