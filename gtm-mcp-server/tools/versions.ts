/**
 * Version-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';

export interface VersionSummary {
  versionId: string;
  name?: string;
  path: string;
  description?: string;
  deleted?: boolean;
}

export interface VersionDetails extends VersionSummary {
  container?: tagmanager_v2.Schema$Container;
  tag?: tagmanager_v2.Schema$Tag[];
  trigger?: tagmanager_v2.Schema$Trigger[];
  variable?: tagmanager_v2.Schema$Variable[];
  folder?: tagmanager_v2.Schema$Folder[];
  client?: tagmanager_v2.Schema$Client[];
  builtInVariable?: tagmanager_v2.Schema$BuiltInVariable[];
}

export interface VersionContentSummary {
  versionId: string;
  name?: string;
  counts: {
    tags: number;
    triggers: number;
    variables: number;
    folders: number;
    clients: number;
  };
  tagTypes: Record<string, number>;
  triggerTypes: Record<string, number>;
  variableTypes: Record<string, number>;
}

/**
 * List all version headers (metadata only, not full content)
 */
export async function listVersionHeaders(containerPath: string): Promise<VersionSummary[]> {
  const tagmanager = getTagManagerClient();

  const versions = await gtmApiCall(() =>
    tagmanager.accounts.containers.version_headers.list({
      parent: containerPath,
    })
  );

  if (!versions.containerVersionHeader) {
    return [];
  }

  return versions.containerVersionHeader.map((v) => ({
    versionId: v.containerVersionId || '',
    name: v.name || undefined,
    path: v.path || '',
    deleted: v.deleted || undefined,
  }));
}

/**
 * Get the latest version header
 */
export async function getLatestVersionHeader(containerPath: string): Promise<VersionSummary | null> {
  const tagmanager = getTagManagerClient();

  try {
    const version = await gtmApiCall(() =>
      tagmanager.accounts.containers.version_headers.latest({
        parent: containerPath,
      })
    );

    return {
      versionId: version.containerVersionId || '',
      name: version.name || undefined,
      path: version.path || '',
      deleted: version.deleted || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get the live (published) version
 */
export async function getLiveVersion(containerPath: string): Promise<VersionDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const version = await gtmApiCall(() =>
      tagmanager.accounts.containers.versions.live({
        parent: containerPath,
      })
    );

    return {
      versionId: version.containerVersionId || '',
      name: version.name || undefined,
      path: version.path || '',
      description: version.description || undefined,
      container: version.container || undefined,
      tag: version.tag || undefined,
      trigger: version.trigger || undefined,
      variable: version.variable || undefined,
      folder: version.folder || undefined,
      client: version.client || undefined,
      builtInVariable: version.builtInVariable || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get a specific version with full content
 */
export async function getVersion(versionPath: string): Promise<VersionDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const version = await gtmApiCall(() =>
      tagmanager.accounts.containers.versions.get({
        path: versionPath,
      })
    );

    return {
      versionId: version.containerVersionId || '',
      name: version.name || undefined,
      path: version.path || '',
      description: version.description || undefined,
      container: version.container || undefined,
      tag: version.tag || undefined,
      trigger: version.trigger || undefined,
      variable: version.variable || undefined,
      folder: version.folder || undefined,
      client: version.client || undefined,
      builtInVariable: version.builtInVariable || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new version from workspace
 */
export async function createVersion(
  workspacePath: string,
  name: string,
  notes?: string
): Promise<VersionSummary | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const result = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.create_version({
        path: workspacePath,
        requestBody: {
          name,
          notes,
        },
      })
    );

    const version = result.containerVersion;
    if (!version) {
      return {
        code: 'NO_VERSION',
        message: 'Version creation succeeded but no version data returned',
        suggestions: ['Try creating the version again', 'Check workspace status for pending changes'],
      };
    }

    return {
      versionId: version.containerVersionId || '',
      name: version.name || undefined,
      path: version.path || '',
      description: version.description || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'createVersion', { workspacePath, name, notes });
  }
}

/**
 * Publish a version
 */
export async function publishVersion(versionPath: string): Promise<{ published: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.versions.publish({
        path: versionPath,
      })
    );
    return { published: true };
  } catch (error) {
    return handleApiError(error, 'publishVersion', { versionPath });
  }
}

/**
 * Delete a version (DESTRUCTIVE!)
 */
export async function deleteVersion(versionPath: string): Promise<{ deleted: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.versions.delete({
        path: versionPath,
      })
    );
    return { deleted: true };
  } catch (error) {
    return handleApiError(error, 'deleteVersion', { versionPath });
  }
}

/**
 * Undelete a version
 */
export async function undeleteVersion(versionPath: string): Promise<VersionSummary | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const version = await gtmApiCall(() =>
      tagmanager.accounts.containers.versions.undelete({
        path: versionPath,
      })
    );

    return {
      versionId: version.containerVersionId || '',
      name: version.name || undefined,
      path: version.path || '',
      description: version.description || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'undeleteVersion', { versionPath });
  }
}

/**
 * Get a compressed summary of version content
 */
export function getVersionContentSummary(version: VersionDetails): VersionContentSummary {
  const tagTypes: Record<string, number> = {};
  const triggerTypes: Record<string, number> = {};
  const variableTypes: Record<string, number> = {};

  // Count tag types
  if (version.tag) {
    for (const tag of version.tag) {
      const type = tag.type || 'unknown';
      tagTypes[type] = (tagTypes[type] || 0) + 1;
    }
  }

  // Count trigger types
  if (version.trigger) {
    for (const trigger of version.trigger) {
      const type = trigger.type || 'unknown';
      triggerTypes[type] = (triggerTypes[type] || 0) + 1;
    }
  }

  // Count variable types
  if (version.variable) {
    for (const variable of version.variable) {
      const type = variable.type || 'unknown';
      variableTypes[type] = (variableTypes[type] || 0) + 1;
    }
  }

  return {
    versionId: version.versionId,
    name: version.name,
    counts: {
      tags: version.tag?.length || 0,
      triggers: version.trigger?.length || 0,
      variables: version.variable?.length || 0,
      folders: version.folder?.length || 0,
      clients: version.client?.length || 0,
    },
    tagTypes,
    triggerTypes,
    variableTypes,
  };
}

/**
 * Export version as GTM container JSON format
 */
export function exportVersionAsJson(version: VersionDetails): object {
  return {
    exportFormatVersion: 2,
    exportTime: new Date().toISOString(),
    containerVersion: {
      path: version.path,
      accountId: version.container?.accountId || '0',
      containerId: version.container?.containerId || '0',
      containerVersionId: version.versionId,
      name: version.name,
      container: version.container,
      tag: version.tag || [],
      trigger: version.trigger || [],
      variable: version.variable || [],
      folder: version.folder || [],
      client: version.client || [],
      builtInVariable: version.builtInVariable || [],
    },
  };
}
