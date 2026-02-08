/**
 * Container-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';

export interface ContainerSummary {
  containerId: string;
  name: string;
  publicId: string;
  path: string;
  usageContext: string[];
  accountId: string;
}

export interface ContainerDetails extends ContainerSummary {
  notes?: string;
  tagManagerUrl?: string;
  features?: Record<string, boolean>;
}

/**
 * List all containers in an account
 */
export async function listContainers(accountId: string): Promise<ContainerSummary[]> {
  const tagmanager = getTagManagerClient();

  const containers = await gtmApiCall(() =>
    tagmanager.accounts.containers.list({
      parent: `accounts/${accountId}`,
    })
  );

  if (!containers.container) {
    return [];
  }

  return containers.container.map((container) => ({
    containerId: container.containerId || '',
    name: container.name || '',
    publicId: container.publicId || '',
    path: container.path || '',
    usageContext: container.usageContext || [],
    accountId: accountId,
  }));
}

/**
 * Get a single container by path
 */
export async function getContainer(containerPath: string): Promise<ContainerDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const container = await gtmApiCall(() =>
      tagmanager.accounts.containers.get({
        path: containerPath,
      })
    );

    return {
      containerId: container.containerId || '',
      name: container.name || '',
      publicId: container.publicId || '',
      path: container.path || '',
      usageContext: container.usageContext || [],
      accountId: container.accountId || '',
      notes: container.notes || undefined,
      tagManagerUrl: container.tagManagerUrl || undefined,
      features: container.features as Record<string, boolean> | undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Lookup a container by public ID (e.g., GTM-XXXXX)
 */
export async function lookupContainer(publicId: string): Promise<ContainerSummary | null> {
  const tagmanager = getTagManagerClient();

  try {
    const result = await gtmApiCall(() =>
      tagmanager.accounts.containers.lookup({
        tagId: publicId,
      })
    );

    if (!result) return null;

    return {
      containerId: result.containerId || '',
      name: result.name || '',
      publicId: result.publicId || '',
      path: result.path || '',
      usageContext: result.usageContext || [],
      accountId: result.accountId || '',
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new container
 */
export async function createContainer(
  accountId: string,
  name: string,
  usageContext: 'web' | 'server' | 'amp' | 'ios' | 'android'
): Promise<ContainerDetails | null> {
  const tagmanager = getTagManagerClient();

  const usageContextMap: Record<string, string[]> = {
    web: ['WEB'],
    server: ['SERVER'],
    amp: ['AMP'],
    ios: ['IOS'],
    android: ['ANDROID'],
  };

  try {
    const container = await gtmApiCall(() =>
      tagmanager.accounts.containers.create({
        parent: `accounts/${accountId}`,
        requestBody: {
          name,
          usageContext: usageContextMap[usageContext],
        },
      })
    );

    return {
      containerId: container.containerId || '',
      name: container.name || '',
      publicId: container.publicId || '',
      path: container.path || '',
      usageContext: container.usageContext || [],
      accountId: accountId,
      tagManagerUrl: container.tagManagerUrl || undefined,
    };
  } catch (error) {
    console.error('Error creating container:', error);
    return null;
  }
}

/**
 * Delete a container (DESTRUCTIVE!)
 */
export async function deleteContainer(containerPath: string): Promise<boolean> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.delete({
        path: containerPath,
      })
    );
    return true;
  } catch (error) {
    console.error('Error deleting container:', error);
    return false;
  }
}
