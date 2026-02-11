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
    // Normalize/clean parameters so GTM API errors are more predictable.
    const cleanedParams: tagmanager_v2.Schema$Parameter[] | undefined = (() => {
      const params = variableConfig.parameter;
      if (!params || params.length === 0) return undefined;

      const out: tagmanager_v2.Schema$Parameter[] = [];
      for (const p of params) {
        if (!p || typeof p !== 'object') continue;
        const key = (p as any).key;
        const type = (p as any).type;

        if (!key || typeof key !== 'string') continue;
        if (!type || typeof type !== 'string') continue;

        const entry: tagmanager_v2.Schema$Parameter = {
          key,
          type,
        };

        if ('value' in (p as any)) (entry as any).value = (p as any).value;
        if ('list' in (p as any)) (entry as any).list = (p as any).list;
        if ('map' in (p as any)) (entry as any).map = (p as any).map;

        out.push(entry);
      }
      return out.length > 0 ? out : undefined;
    })();

    const variable = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.variables.create({
        parent: workspacePath,
        requestBody: {
          ...variableConfig,
          parameter: cleanedParams,
        },
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

/**
 * Update an existing variable
 */
export async function updateVariable(
    variablePath: string,
    variableConfig: Partial<{
      name: string;
      type: string;
      parameter: tagmanager_v2.Schema$Parameter[];
      parentFolderId: string;
      notes: string;
    }>,
    fingerprint: string
  ): Promise<VariableDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const current = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.variables.get({
        path: variablePath,
      })
    );

    const requestBody: tagmanager_v2.Schema$Variable = {
      name: variableConfig.name ?? current.name ?? undefined,
      type: variableConfig.type ?? current.type ?? undefined,
      parameter: variableConfig.parameter ?? current.parameter ?? undefined,
      parentFolderId: variableConfig.parentFolderId ?? current.parentFolderId ?? undefined,
      notes: variableConfig.notes ?? current.notes ?? undefined,
    };

    const variable = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.variables.update({
        path: variablePath,
        fingerprint,
        requestBody,
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
