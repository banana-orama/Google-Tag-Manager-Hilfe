/**
 * Workspace-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';

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
): Promise<WorkspaceSummary | null> {
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
    console.error('Error creating workspace:', error);
    return null;
  }
}

/**
 * Delete a workspace (DESTRUCTIVE!)
 */
export async function deleteWorkspace(workspacePath: string): Promise<boolean> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.delete({
        path: workspacePath,
      })
    );
    return true;
  } catch (error) {
    console.error('Error deleting workspace:', error);
    return false;
  }
}

/**
 * Get workspace status (changes, conflicts)
 */
export async function getWorkspaceStatus(workspacePath: string): Promise<WorkspaceStatus | null> {
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
    console.error('Error getting workspace status:', error);
    return null;
  }
}

/**
 * Sync workspace with latest container version
 */
export async function syncWorkspace(workspacePath: string): Promise<boolean> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.sync({
        path: workspacePath,
      })
    );
    return true;
  } catch (error) {
    console.error('Error syncing workspace:', error);
    return false;
  }
}
