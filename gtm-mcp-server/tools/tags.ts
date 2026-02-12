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

function getParameterValue(params: tagmanager_v2.Schema$Parameter[] | undefined, key: string): string | undefined {
  const hit = (params || []).find((p) => p?.key === key);
  return hit?.value !== undefined ? String(hit.value) : undefined;
}

function hasParamKey(params: tagmanager_v2.Schema$Parameter[] | undefined, key: string): boolean {
  return (params || []).some((p) => p?.key === key);
}

function isServerUrlParamSupported(tagType: string | null | undefined): boolean {
  // GTM tag entity supports these server URL params reliably on googtag.
  return tagType === 'googtag';
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
    type: string;
    parameter: tagmanager_v2.Schema$Parameter[];
    firingTriggerId: string[];
    blockingTriggerId: string[];
    paused: boolean;
    parentFolderId: string;
    notes: string;
  }>,
  fingerprint: string
): Promise<TagDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    // GTM tag update requires preserving essential fields (type/parameter) for many tag types.
    const current = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.tags.get({
        path: tagPath,
      })
    );

    const requestBody: tagmanager_v2.Schema$Tag = {
      name: tagConfig.name ?? current.name ?? undefined,
      type: tagConfig.type ?? current.type ?? undefined,
      parameter: tagConfig.parameter ?? current.parameter ?? undefined,
      firingTriggerId: tagConfig.firingTriggerId ?? current.firingTriggerId ?? undefined,
      blockingTriggerId: tagConfig.blockingTriggerId ?? current.blockingTriggerId ?? undefined,
      paused: tagConfig.paused ?? current.paused ?? undefined,
      parentFolderId: tagConfig.parentFolderId ?? current.parentFolderId ?? undefined,
      notes: tagConfig.notes ?? current.notes ?? undefined,
    };

    const attemptsServerUrlUpdate =
      hasParamKey(requestBody.parameter, 'server_container_url') ||
      hasParamKey(requestBody.parameter, 'server_transport_url');
    if (attemptsServerUrlUpdate && !isServerUrlParamSupported(requestBody.type)) {
      return {
        code: 'UNSUPPORTED_PARAMETER_FOR_TYPE',
        errorType: 'UPDATE_NOT_APPLIED',
        message: `server_container_url/server_transport_url are not supported for tag type "${requestBody.type}"`,
        details: {
          tagType: requestBody.type,
          supportedTypes: ['googtag'],
        },
        suggestions: [
          'Use a googtag tag when setting server transport/container URL',
          'For server-side transport configuration, prefer gtm_create_gtag_config',
        ],
      };
    }

    // Custom HTML tags require a non-empty `html` parameter value.
    if (requestBody.type === 'html' && Array.isArray(current.parameter)) {
      const hasHtml = (requestBody.parameter || []).some(
        (p) => p?.key === 'html' && typeof p.value === 'string' && p.value.trim().length > 0
      );
      if (!hasHtml) {
        requestBody.parameter = current.parameter;
      }
    }

    const tag = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.tags.update({
        path: tagPath,
        fingerprint,
        requestBody,
      })
    );

    // Read-after-write verification for known problematic URL parameters.
    if (attemptsServerUrlUpdate && tag.path) {
      const reread = await gtmApiCall(() =>
        tagmanager.accounts.containers.workspaces.tags.get({
          path: tag.path!,
        })
      );
      const expectedServerContainerUrl = getParameterValue(requestBody.parameter, 'server_container_url');
      const expectedServerTransportUrl = getParameterValue(requestBody.parameter, 'server_transport_url');
      const actualServerContainerUrl = getParameterValue(reread.parameter || undefined, 'server_container_url');
      const actualServerTransportUrl = getParameterValue(reread.parameter || undefined, 'server_transport_url');

      if (
        (expectedServerContainerUrl !== undefined && expectedServerContainerUrl !== actualServerContainerUrl) ||
        (expectedServerTransportUrl !== undefined && expectedServerTransportUrl !== actualServerTransportUrl)
      ) {
        return {
          code: 'UPDATE_NOT_APPLIED',
          errorType: 'UPDATE_NOT_APPLIED',
          message: 'Tag update accepted, but server URL parameter was not persisted by GTM API.',
          details: {
            expected: {
              server_container_url: expectedServerContainerUrl,
              server_transport_url: expectedServerTransportUrl,
            },
            actual: {
              server_container_url: actualServerContainerUrl,
              server_transport_url: actualServerTransportUrl,
            },
          },
          suggestions: [
            'Use gtm_create_gtag_config for server URL transport setup',
            'Validate the target tag type supports these parameters',
          ],
        };
      }
    }

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
    return handleApiError(error, 'updateTag', { tagPath, tagConfig, fingerprint });
  }
}

/**
 * Delete a tag (DESTRUCTIVE!)
 */
export async function deleteTag(tagPath: string): Promise<{ deleted: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.tags.delete({
        path: tagPath,
      })
    );
    return { deleted: true };
  } catch (error) {
    return handleApiError(error, 'deleteTag', { tagPath });
  }
}

/**
 * Revert tag changes in workspace
 */
export async function revertTag(tagPath: string): Promise<TagDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const result = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.tags.revert({
        path: tagPath,
      })
    );

    const tag = result.tag;
    if (!tag) {
      // The API may return an empty body if there were no pending changes for this tag.
      // Treat this as a successful no-op revert.
      return { reverted: true, path: tagPath } as any;
    }

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
    return handleApiError(error, 'revertTag', { tagPath });
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
