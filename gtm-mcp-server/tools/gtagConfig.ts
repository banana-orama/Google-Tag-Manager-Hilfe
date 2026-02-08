/**
 * GTM Gtag Config API tools
 * Gtag Config represents Google tag configuration in a workspace
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';

export interface GtagConfigSummary {
  gtagConfigId: string;
  type: string;
  path: string;
}

export interface GtagConfigDetails extends GtagConfigSummary {
  parameter?: tagmanager_v2.Schema$Parameter[];
  fingerprint?: string;
}

/**
 * List all gtag configs in a workspace
 */
export async function listGtagConfigs(workspacePath: string): Promise<GtagConfigSummary[]> {
  const tagmanager = getTagManagerClient();

  const configs = await gtmApiCall(() =>
    tagmanager.accounts.containers.workspaces.gtag_config.list({
      parent: workspacePath,
    })
  );

  if (!configs.gtagConfig) {
    return [];
  }

  return configs.gtagConfig.map((config) => ({
    gtagConfigId: config.gtagConfigId || '',
    type: config.type || '',
    path: config.path || '',
  }));
}

/**
 * Get a single gtag config with full details
 */
export async function getGtagConfig(gtagConfigPath: string): Promise<GtagConfigDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const config = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.gtag_config.get({
        path: gtagConfigPath,
      })
    );

    return {
      gtagConfigId: config.gtagConfigId || '',
      type: config.type || '',
      path: config.path || '',
      parameter: config.parameter || undefined,
      fingerprint: config.fingerprint || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new gtag config
 */
export async function createGtagConfig(
  workspacePath: string,
  gtagConfigData: {
    type: string;
    parameter?: tagmanager_v2.Schema$Parameter[];
  }
): Promise<GtagConfigDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const config = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.gtag_config.create({
        parent: workspacePath,
        requestBody: gtagConfigData,
      })
    );

    return {
      gtagConfigId: config.gtagConfigId || '',
      type: config.type || '',
      path: config.path || '',
      parameter: config.parameter || undefined,
      fingerprint: config.fingerprint || undefined,
    };
  } catch (error) {
    console.error('Error creating gtag config:', error);
    return null;
  }
}

/**
 * Update an existing gtag config
 */
export async function updateGtagConfig(
  gtagConfigPath: string,
  gtagConfigData: Partial<{
    parameter: tagmanager_v2.Schema$Parameter[];
  }>,
  fingerprint: string
): Promise<GtagConfigDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const config = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.gtag_config.update({
        path: gtagConfigPath,
        fingerprint,
        requestBody: gtagConfigData,
      })
    );

    return {
      gtagConfigId: config.gtagConfigId || '',
      type: config.type || '',
      path: config.path || '',
      parameter: config.parameter || undefined,
      fingerprint: config.fingerprint || undefined,
    };
  } catch (error) {
    console.error('Error updating gtag config:', error);
    return null;
  }
}

/**
 * Delete a gtag config (DESTRUCTIVE!)
 */
export async function deleteGtagConfig(gtagConfigPath: string): Promise<boolean> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.gtag_config.delete({
        path: gtagConfigPath,
      })
    );
    return true;
  } catch (error) {
    console.error('Error deleting gtag config:', error);
    return false;
  }
}
