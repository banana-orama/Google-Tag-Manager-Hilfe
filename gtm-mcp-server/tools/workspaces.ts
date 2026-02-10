/**
 * Workspace-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';

export interface WorkspaceSummary {
  workspaceId: string;
  name: string;
  path: string;
  description?: string;
}

export interface WorkspaceStatus {
  workspaceId: string;
  name: string;
  hasChanges: boolean;
  mergeConflicts: boolean;
  changeCount: {
    tags: number;
    triggers: number;
    variables: number;
    folders: number;
  };
}

/**
 * List all workspaces in a container
 */
export async function listWorkspaces(containerPath: string): Promise<WorkspaceSummary[]> {
  const tagmanager = getTagManagerClient();

  const workspaces = await gtmApiCall(() =>
    tagmanager.accounts.containers.workspaces.list({
      parent: containerPath,
    })
  );

  if (!workspaces.workspace) {
    return [];
  }

  return workspaces.workspace.map((ws) => ({
    workspaceId: ws.workspaceId || '',
    name: ws.name || '',
    path: ws.path || '',
    description: ws.description || undefined,
  }));
}

/**
 * Get a single workspace
 */
export async function getWorkspace(workspacePath: string): Promise<WorkspaceSummary | null> {
  const tagmanager = getTagManagerClient();

  try {
    const workspace = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.get({
        path: workspacePath,
      })
    );

    return {
      workspaceId: workspace.workspaceId || '',
      name: workspace.name || '',
      path: workspace.path || '',
      description: workspace.description || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new workspace
 */
export async function createWorkspace(
  containerPath: string,
  name: string,
  description?: string
): Promise<WorkspaceSummary | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const workspace = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.create({
        parent: containerPath,
        requestBody: {
          name,
          description,
        },
      })
    );

    return {
      workspaceId: workspace.workspaceId || '',
      name: workspace.name || '',
      path: workspace.path || '',
      description: workspace.description || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'createWorkspace', { containerPath, name, description });
  }
}

/**
 * Delete a workspace (DESTRUCTIVE!)
 */
export async function deleteWorkspace(workspacePath: string): Promise<{ deleted: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.delete({
        path: workspacePath,
      })
    );
    return { deleted: true };
  } catch (error) {
    return handleApiError(error, 'deleteWorkspace', { workspacePath });
  }
}

/**
 * Get workspace status (changes, conflicts)
 */
export async function getWorkspaceStatus(workspacePath: string): Promise<WorkspaceStatus | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const status = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.getStatus({
        path: workspacePath,
      })
    );

    // Count changes by type
    const changeCount = {
      tags: 0,
      triggers: 0,
      variables: 0,
      folders: 0,
    };

    if (status.workspaceChange) {
      for (const change of status.workspaceChange) {
        if (change.tag) changeCount.tags++;
        if (change.trigger) changeCount.triggers++;
        if (change.variable) changeCount.variables++;
        if (change.folder) changeCount.folders++;
      }
    }

    return {
      workspaceId: workspacePath.split('/').pop() || '',
      name: '', // Status doesn't include name
      hasChanges: (status.workspaceChange?.length || 0) > 0,
      mergeConflicts: (status.mergeConflict?.length || 0) > 0,
      changeCount,
    };
  } catch (error) {
    return handleApiError(error, 'getWorkspaceStatus', { workspacePath });
  }
}

/**
 * Sync workspace with latest container version
 */
export async function syncWorkspace(workspacePath: string): Promise<{ synced: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.sync({
        path: workspacePath,
      })
    );
    return { synced: true };
  } catch (error) {
    return handleApiError(error, 'syncWorkspace', { workspacePath });
  }
}
