/**
 * Tag-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';

export interface TagSummary {
  tagId: string;
  name: string;
  type: string;
  path: string;
  firingTriggerId?: string[];
  blockingTriggerId?: string[];
  paused?: boolean;
  folderId?: string;
}

export interface TagDetails extends TagSummary {
  parameter?: tagmanager_v2.Schema$Parameter[];
  fingerprint?: string;
  notes?: string;
}

/**
 * List all tags in a workspace
 * Returns compressed summary to save tokens
 */
export async function listTags(workspacePath: string): Promise<TagSummary[]> {
  const tagmanager = getTagManagerClient();

  const tags = await gtmApiCall(() =>
    tagmanager.accounts.containers.workspaces.tags.list({
      parent: workspacePath,
    })
  );

  if (!tags.tag) {
    return [];
  }

  return tags.tag.map((tag) => ({
    tagId: tag.tagId || '',
    name: tag.name || '',
    type: tag.type || '',
    path: tag.path || '',
    firingTriggerId: tag.firingTriggerId || undefined,
    blockingTriggerId: tag.blockingTriggerId || undefined,
    paused: tag.paused || undefined,
    folderId: tag.parentFolderId || undefined,
  }));
}

/**
 * Get a single tag with full details
 */
export async function getTag(tagPath: string): Promise<TagDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const tag = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.tags.get({
        path: tagPath,
      })
    );

    return {
      tagId: tag.tagId || '',
      name: tag.name || '',
      type: tag.type || '',
      path: tag.path || '',
      firingTriggerId: tag.firingTriggerId || undefined,
      blockingTriggerId: tag.blockingTriggerId || undefined,
      paused: tag.paused || undefined,
      folderId: tag.parentFolderId || undefined,
      parameter: tag.parameter || undefined,
      fingerprint: tag.fingerprint || undefined,
      notes: tag.notes || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new tag
 */
export async function createTag(
  workspacePath: string,
  tagConfig: {
    name: string;
    type: string;
    parameter?: tagmanager_v2.Schema$Parameter[];
    firingTriggerId?: string[];
    blockingTriggerId?: string[];
    paused?: boolean;
    parentFolderId?: string;
  }
): Promise<TagDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const tag = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.tags.create({
        parent: workspacePath,
        requestBody: tagConfig,
      })
    );

    return {
      tagId: tag.tagId || '',
      name: tag.name || '',
      type: tag.type || '',
      path: tag.path || '',
      firingTriggerId: tag.firingTriggerId || undefined,
      blockingTriggerId: tag.blockingTriggerId || undefined,
      paused: tag.paused || undefined,
      folderId: tag.parentFolderId || undefined,
      parameter: tag.parameter || undefined,
      fingerprint: tag.fingerprint || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'createTag', tagConfig);
  }
}

/**
 * Update an existing tag
 */
export async function updateTag(
  tagPath: string,
  tagConfig: Partial<{
    name: string;
    parameter: tagmanager_v2.Schema$Parameter[];
    firingTriggerId: string[];
    blockingTriggerId: string[];
    paused: boolean;
    parentFolderId: string;
  }>,
  fingerprint: string
): Promise<TagDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const tag = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.tags.update({
        path: tagPath,
        fingerprint,
        requestBody: tagConfig,
      })
    );

    return {
      tagId: tag.tagId || '',
      name: tag.name || '',
      type: tag.type || '',
      path: tag.path || '',
      firingTriggerId: tag.firingTriggerId || undefined,
      blockingTriggerId: tag.blockingTriggerId || undefined,
      paused: tag.paused || undefined,
      folderId: tag.parentFolderId || undefined,
      parameter: tag.parameter || undefined,
      fingerprint: tag.fingerprint || undefined,
    };
  } catch (error) {
    console.error('Error updating tag:', error);
    return null;
  }
}

/**
 * Delete a tag (DESTRUCTIVE!)
 */
export async function deleteTag(tagPath: string): Promise<boolean> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.tags.delete({
        path: tagPath,
      })
    );
    return true;
  } catch (error) {
    console.error('Error deleting tag:', error);
    return false;
  }
}

/**
 * Revert tag changes in workspace
 */
export async function revertTag(tagPath: string): Promise<TagDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const result = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.tags.revert({
        path: tagPath,
      })
    );

    const tag = result.tag;
    if (!tag) return null;

    return {
      tagId: tag.tagId || '',
      name: tag.name || '',
      type: tag.type || '',
      path: tag.path || '',
      firingTriggerId: tag.firingTriggerId || undefined,
      blockingTriggerId: tag.blockingTriggerId || undefined,
      paused: tag.paused || undefined,
      folderId: tag.parentFolderId || undefined,
      parameter: tag.parameter || undefined,
      fingerprint: tag.fingerprint || undefined,
    };
  } catch (error) {
    console.error('Error reverting tag:', error);
    return null;
  }
}

/**
 * Analyze tags and return summary with types and counts
 */
export function analyzeTagList(tags: TagSummary[]): {
  total: number;
  byType: Record<string, number>;
  paused: number;
  withoutTriggers: string[];
} {
  const byType: Record<string, number> = {};
  let paused = 0;
  const withoutTriggers: string[] = [];

  for (const tag of tags) {
    // Count by type
    byType[tag.type] = (byType[tag.type] || 0) + 1;

    // Count paused
    if (tag.paused) paused++;

    // Find tags without triggers
    if (!tag.firingTriggerId || tag.firingTriggerId.length === 0) {
      withoutTriggers.push(tag.name);
    }
  }

  return {
    total: tags.length,
    byType,
    paused,
    withoutTriggers,
  };
}
