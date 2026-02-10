/**
 * Variable-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';
import { validateVariableConfig } from '../utils/container-validator.js';

export interface VariableSummary {
  variableId: string;
  name: string;
  type: string;
  path: string;
  folderId?: string;
}

export interface VariableDetails extends VariableSummary {
  parameter?: tagmanager_v2.Schema$Parameter[];
  fingerprint?: string;
  notes?: string;
}

/**
 * List all variables in a workspace
 */
export async function listVariables(workspacePath: string): Promise<VariableSummary[]> {
  const tagmanager = getTagManagerClient();

  const variables = await gtmApiCall(() =>
    tagmanager.accounts.containers.workspaces.variables.list({
      parent: workspacePath,
    })
  );

  if (!variables.variable) {
    return [];
  }

  return variables.variable.map((variable) => ({
    variableId: variable.variableId || '',
    name: variable.name || '',
    type: variable.type || '',
    path: variable.path || '',
    folderId: variable.parentFolderId || undefined,
  }));
}

/**
 * Get a single variable with full details
 */
export async function getVariable(variablePath: string): Promise<VariableDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const variable = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.variables.get({
        path: variablePath,
      })
    );

    return {
      variableId: variable.variableId || '',
      name: variable.name || '',
      type: variable.type || '',
      path: variable.path || '',
      folderId: variable.parentFolderId || undefined,
      parameter: variable.parameter || undefined,
      fingerprint: variable.fingerprint || undefined,
      notes: variable.notes || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new variable
 */
export async function createVariable(
  workspacePath: string,
  variableConfig: {
    name: string;
    type: string;
    parameter?: tagmanager_v2.Schema$Parameter[];
    parentFolderId?: string;
  }
): Promise<VariableDetails | ApiError> {
  const validationError = await validateVariableConfig(variableConfig, workspacePath);
  if (validationError) {
    return validationError;
  }

  const tagmanager = getTagManagerClient();

  try {
    const variable = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.variables.create({
        parent: workspacePath,
        requestBody: variableConfig,
      })
    );

    return {
      variableId: variable.variableId || '',
      name: variable.name || '',
      type: variable.type || '',
      path: variable.path || '',
      folderId: variable.parentFolderId || undefined,
      parameter: variable.parameter || undefined,
      fingerprint: variable.fingerprint || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'createVariable', variableConfig);
  }
}

/**
 * Update an existing variable
 */
export async function updateVariable(
  variablePath: string,
  variableConfig: Partial<{
    name: string;
    parameter: tagmanager_v2.Schema$Parameter[];
    parentFolderId: string;
  }>,
  fingerprint: string
): Promise<VariableDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const variable = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.variables.update({
        path: variablePath,
        fingerprint,
        requestBody: variableConfig,
      })
    );

    return {
      variableId: variable.variableId || '',
      name: variable.name || '',
      type: variable.type || '',
      path: variable.path || '',
      folderId: variable.parentFolderId || undefined,
      parameter: variable.parameter || undefined,
      fingerprint: variable.fingerprint || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'updateVariable', { variablePath, variableConfig, fingerprint });
  }
}

/**
 * Delete a variable (DESTRUCTIVE!)
 */
export async function deleteVariable(variablePath: string): Promise<{ deleted: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.variables.delete({
        path: variablePath,
      })
    );
    return { deleted: true };
  } catch (error) {
    return handleApiError(error, 'deleteVariable', { variablePath });
  }
}

/**
 * Analyze variables and return summary
 */
export function analyzeVariableList(variables: VariableSummary[]): {
  total: number;
  byType: Record<string, number>;
} {
  const byType: Record<string, number> = {};

  for (const variable of variables) {
    byType[variable.type] = (byType[variable.type] || 0) + 1;
  }

  return {
    total: variables.length,
    byType,
  };
}
