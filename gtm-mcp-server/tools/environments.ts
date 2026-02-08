/**
 * GTM Environments API tools
 * Environments allow testing versions before publishing to live
 */

import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';

export interface EnvironmentSummary {
  environmentId: string;
  name: string;
  type: string;
  path: string;
  url?: string;
  authorizationCode?: string;
}

export interface EnvironmentDetails extends EnvironmentSummary {
  description?: string;
  fingerprint?: string;
  authorizationTimestamp?: string;
  containerId?: string;
  containerVersionId?: string;
  enableDebug?: boolean;
}

/**
 * List all environments for a container
 */
export async function listEnvironments(containerPath: string): Promise<EnvironmentSummary[]> {
  const tagmanager = getTagManagerClient();

  const environments = await gtmApiCall(() =>
    tagmanager.accounts.containers.environments.list({
      parent: containerPath,
    })
  );

  if (!environments.environment) {
    return [];
  }

  return environments.environment.map((env) => ({
    environmentId: env.environmentId || '',
    name: env.name || '',
    type: env.type || '',
    path: env.path || '',
    url: env.url || undefined,
    authorizationCode: env.authorizationCode || undefined,
  }));
}

/**
 * Get a single environment with full details
 */
export async function getEnvironment(environmentPath: string): Promise<EnvironmentDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const env = await gtmApiCall(() =>
      tagmanager.accounts.containers.environments.get({
        path: environmentPath,
      })
    );

    return {
      environmentId: env.environmentId || '',
      name: env.name || '',
      type: env.type || '',
      path: env.path || '',
      url: env.url || undefined,
      authorizationCode: env.authorizationCode || undefined,
      description: env.description || undefined,
      fingerprint: env.fingerprint || undefined,
      authorizationTimestamp: env.authorizationTimestamp || undefined,
      containerId: env.containerId || undefined,
      containerVersionId: env.containerVersionId || undefined,
      enableDebug: env.enableDebug || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new environment
 */
export async function createEnvironment(
  containerPath: string,
  environmentConfig: {
    name: string;
    description?: string;
    enableDebug?: boolean;
  }
): Promise<EnvironmentDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const env = await gtmApiCall(() =>
      tagmanager.accounts.containers.environments.create({
        parent: containerPath,
        requestBody: environmentConfig,
      })
    );

    return {
      environmentId: env.environmentId || '',
      name: env.name || '',
      type: env.type || '',
      path: env.path || '',
      url: env.url || undefined,
      authorizationCode: env.authorizationCode || undefined,
      description: env.description || undefined,
      fingerprint: env.fingerprint || undefined,
      enableDebug: env.enableDebug || undefined,
    };
  } catch (error) {
    console.error('Error creating environment:', error);
    return null;
  }
}

/**
 * Update an existing environment
 */
export async function updateEnvironment(
  environmentPath: string,
  environmentConfig: Partial<{
    name: string;
    description: string;
    enableDebug: boolean;
    containerVersionId: string;
  }>,
  fingerprint: string
): Promise<EnvironmentDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const env = await gtmApiCall(() =>
      tagmanager.accounts.containers.environments.update({
        path: environmentPath,
        fingerprint,
        requestBody: environmentConfig,
      })
    );

    return {
      environmentId: env.environmentId || '',
      name: env.name || '',
      type: env.type || '',
      path: env.path || '',
      url: env.url || undefined,
      authorizationCode: env.authorizationCode || undefined,
      description: env.description || undefined,
      fingerprint: env.fingerprint || undefined,
      enableDebug: env.enableDebug || undefined,
      containerVersionId: env.containerVersionId || undefined,
    };
  } catch (error) {
    console.error('Error updating environment:', error);
    return null;
  }
}

/**
 * Delete an environment (DESTRUCTIVE!)
 */
export async function deleteEnvironment(environmentPath: string): Promise<boolean> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.environments.delete({
        path: environmentPath,
      })
    );
    return true;
  } catch (error) {
    console.error('Error deleting environment:', error);
    return false;
  }
}

/**
 * Regenerate authorization code for an environment
 */
export async function reauthorizeEnvironment(environmentPath: string): Promise<EnvironmentDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const env = await gtmApiCall(() =>
      tagmanager.accounts.containers.environments.reauthorize({
        path: environmentPath,
        requestBody: {},
      })
    );

    return {
      environmentId: env.environmentId || '',
      name: env.name || '',
      type: env.type || '',
      path: env.path || '',
      url: env.url || undefined,
      authorizationCode: env.authorizationCode || undefined,
      authorizationTimestamp: env.authorizationTimestamp || undefined,
    };
  } catch (error) {
    console.error('Error reauthorizing environment:', error);
    return null;
  }
}
