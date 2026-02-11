/**
 * Server-Side GTM Transformations API tools
 * Transformations are only available in Server-Side containers
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';
import { validateTransformationConfig } from '../utils/container-validator.js';

export interface TransformationSummary {
  transformationId: string;
  name: string;
  type: string;
  path: string;
  folderId?: string;
}

export interface TransformationDetails extends TransformationSummary {
  parameter?: tagmanager_v2.Schema$Parameter[];
  fingerprint?: string;
  notes?: string;
}

/**
 * List all transformations in a workspace (Server-Side containers only)
 */
export async function listTransformations(workspacePath: string): Promise<TransformationSummary[]> {
  const tagmanager = getTagManagerClient();

  const transformations = await gtmApiCall(() =>
    tagmanager.accounts.containers.workspaces.transformations.list({
      parent: workspacePath,
    })
  );

  if (!transformations.transformation) {
    return [];
  }

  return transformations.transformation.map((t) => ({
    transformationId: t.transformationId || '',
    name: t.name || '',
    type: t.type || '',
    path: t.path || '',
    folderId: t.parentFolderId || undefined,
  }));
}

/**
 * Get a single transformation with full details
 */
export async function getTransformation(transformationPath: string): Promise<TransformationDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const transformation = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.transformations.get({
        path: transformationPath,
      })
    );

    return {
      transformationId: transformation.transformationId || '',
      name: transformation.name || '',
      type: transformation.type || '',
      path: transformation.path || '',
      folderId: transformation.parentFolderId || undefined,
      parameter: transformation.parameter || undefined,
      fingerprint: transformation.fingerprint || undefined,
      notes: transformation.notes || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new transformation
 */
export async function createTransformation(
  workspacePath: string,
  transformationConfig: {
    name: string;
    type: string;
    parameter?: tagmanager_v2.Schema$Parameter[];
    parentFolderId?: string;
    notes?: string;
  }
): Promise<TransformationDetails | ApiError> {
  const validationError = await validateTransformationConfig(transformationConfig, workspacePath);
  if (validationError) {
    return validationError;
  }

  const tagmanager = getTagManagerClient();

  try {
    const transformation = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.transformations.create({
        parent: workspacePath,
        requestBody: transformationConfig,
      })
    );

    return {
      transformationId: transformation.transformationId || '',
      name: transformation.name || '',
      type: transformation.type || '',
      path: transformation.path || '',
      folderId: transformation.parentFolderId || undefined,
      parameter: transformation.parameter || undefined,
      fingerprint: transformation.fingerprint || undefined,
      notes: transformation.notes || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'createTransformation', transformationConfig);
  }
}

/**
 * Update an existing transformation
 */
export async function updateTransformation(
  transformationPath: string,
  transformationConfig: Partial<{
    name: string;
    parameter: tagmanager_v2.Schema$Parameter[];
    parentFolderId: string;
    notes: string;
  }>,
  fingerprint: string
): Promise<TransformationDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const existing = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.transformations.get({
        path: transformationPath,
      })
    );

    const mergedConfig = {
      name: transformationConfig.name ?? existing.name,
      type: existing.type,
      parameter: transformationConfig.parameter ?? existing.parameter,
      parentFolderId: transformationConfig.parentFolderId ?? existing.parentFolderId,
      notes: transformationConfig.notes ?? existing.notes,
    };

    const transformation = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.transformations.update({
        path: transformationPath,
        fingerprint,
        requestBody: mergedConfig,
      })
    );

    return {
      transformationId: transformation.transformationId || '',
      name: transformation.name || '',
      type: transformation.type || '',
      path: transformation.path || '',
      folderId: transformation.parentFolderId || undefined,
      parameter: transformation.parameter || undefined,
      fingerprint: transformation.fingerprint || undefined,
      notes: transformation.notes || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'updateTransformation', { transformationPath, transformationConfig, fingerprint });
  }
}

/**
 * Delete a transformation (DESTRUCTIVE!)
 */
export async function deleteTransformation(transformationPath: string): Promise<{ deleted: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.transformations.delete({
        path: transformationPath,
      })
    );
    return { deleted: true };
  } catch (error) {
    return handleApiError(error, 'deleteTransformation', { transformationPath });
  }
}
