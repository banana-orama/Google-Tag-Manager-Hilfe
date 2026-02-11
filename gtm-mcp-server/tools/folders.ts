/**
 * Folder-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';

export interface FolderSummary {
  folderId: string;
  name: string;
  path: string;
  fingerprint?: string;
}

export interface FolderEntities {
  folderId: string;
  tags: string[];
  triggers: string[];
  variables: string[];
}

/**
 * List all folders in a workspace
 */
export async function listFolders(workspacePath: string): Promise<FolderSummary[]> {
  const tagmanager = getTagManagerClient();

  const folders = await gtmApiCall(() =>
    tagmanager.accounts.containers.workspaces.folders.list({
      parent: workspacePath,
    })
  );

  if (!folders.folder) {
    return [];
  }

  return folders.folder.map((folder) => ({
    folderId: folder.folderId || '',
    name: folder.name || '',
    path: folder.path || '',
    fingerprint: folder.fingerprint || undefined,
  }));
}

/**
 * Get a single folder
 */
export async function getFolder(folderPath: string): Promise<FolderSummary | null> {
  const tagmanager = getTagManagerClient();

  try {
    const folder = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.folders.get({
        path: folderPath,
      })
    );

    return {
      folderId: folder.folderId || '',
      name: folder.name || '',
      path: folder.path || '',
      fingerprint: folder.fingerprint || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new folder
 */
export async function createFolder(
  workspacePath: string,
  name: string,
  notes?: string
): Promise<FolderSummary | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const folder = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.folders.create({
        parent: workspacePath,
        requestBody: {
          name,
          notes,
        },
      })
    );

    return {
      folderId: folder.folderId || '',
      name: folder.name || '',
      path: folder.path || '',
      fingerprint: folder.fingerprint || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'createFolder', { workspacePath, name, notes });
  }
}

/**
 * Update a folder
 */
export async function updateFolder(
  folderPath: string,
  name: string,
  fingerprint: string
): Promise<FolderSummary | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const folder = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.folders.update({
        path: folderPath,
        fingerprint,
        requestBody: {
          name,
        },
      })
    );

    return {
      folderId: folder.folderId || '',
      name: folder.name || '',
      path: folder.path || '',
      fingerprint: folder.fingerprint || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'updateFolder', { folderPath, name, fingerprint });
  }
}

/**
 * Delete a folder (DESTRUCTIVE!)
 */
export async function deleteFolder(folderPath: string): Promise<{ deleted: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.folders.delete({
        path: folderPath,
      })
    );
    return { deleted: true };
  } catch (error) {
    return handleApiError(error, 'deleteFolder', { folderPath });
  }
}

/**
 * Get all entities in a folder
 */
export async function getFolderEntities(folderPath: string): Promise<FolderEntities | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const result = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.folders.entities({
        path: folderPath,
      })
    );

    return {
      folderId: folderPath.split('/').pop() || '',
      tags: result.tag?.map((t) => t.name || '') || [],
      triggers: result.trigger?.map((t) => t.name || '') || [],
      variables: result.variable?.map((v) => v.name || '') || [],
    };
  } catch (error) {
    return handleApiError(error, 'getFolderEntities', { folderPath });
  }
}

/**
 * Move entities to a folder
 * Note: Uses query parameters instead of request body
 */
export async function moveEntitiesToFolder(
  folderPath: string,
  entityIds: {
    tagId?: string[];
    triggerId?: string[];
    variableId?: string[];
  }
): Promise<{ moved: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.folders.move_entities_to_folder({
        path: folderPath,
        tagId: entityIds.tagId,
        triggerId: entityIds.triggerId,
        variableId: entityIds.variableId,
      })
    );
    return { moved: true };
  } catch (error) {
    return handleApiError(error, 'moveEntitiesToFolder', { folderPath, entityIds });
  }
}
