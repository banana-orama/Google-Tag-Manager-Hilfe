/**
 * Server-Side GTM Clients API tools
 * Clients are only available in Server-Side containers
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';
import { validateClientConfig } from '../utils/container-validator.js';

export interface ClientSummary {
  clientId: string;
  name: string;
  type: string;
  path: string;
  folderId?: string;
}

export interface ClientDetails extends ClientSummary {
  parameter?: tagmanager_v2.Schema$Parameter[];
  fingerprint?: string;
  notes?: string;
  priority?: number;
}

/**
 * List all clients in a workspace (Server-Side containers only)
 */
export async function listClients(workspacePath: string): Promise<ClientSummary[]> {
  const tagmanager = getTagManagerClient();

  const clients = await gtmApiCall(() =>
    tagmanager.accounts.containers.workspaces.clients.list({
      parent: workspacePath,
    })
  );

  if (!clients.client) {
    return [];
  }

  return clients.client.map((client) => ({
    clientId: client.clientId || '',
    name: client.name || '',
    type: client.type || '',
    path: client.path || '',
    folderId: client.parentFolderId || undefined,
  }));
}

/**
 * Get a single client with full details
 */
export async function getClient(clientPath: string): Promise<ClientDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const client = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.clients.get({
        path: clientPath,
      })
    );

    return {
      clientId: client.clientId || '',
      name: client.name || '',
      type: client.type || '',
      path: client.path || '',
      folderId: client.parentFolderId || undefined,
      parameter: client.parameter || undefined,
      fingerprint: client.fingerprint || undefined,
      notes: client.notes || undefined,
      priority: client.priority || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new client
 */
export async function createClient(
  workspacePath: string,
  clientConfig: {
    name: string;
    type: string;
    parameter?: tagmanager_v2.Schema$Parameter[];
    parentFolderId?: string;
    priority?: number;
    notes?: string;
  }
): Promise<ClientDetails | ApiError> {
  const validationError = await validateClientConfig(clientConfig, workspacePath);
  if (validationError) {
    return validationError;
  }

  const tagmanager = getTagManagerClient();

  try {
    const client = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.clients.create({
        parent: workspacePath,
        requestBody: clientConfig,
      })
    );

    return {
      clientId: client.clientId || '',
      name: client.name || '',
      type: client.type || '',
      path: client.path || '',
      folderId: client.parentFolderId || undefined,
      parameter: client.parameter || undefined,
      fingerprint: client.fingerprint || undefined,
      notes: client.notes || undefined,
      priority: client.priority || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'createClient', clientConfig);
  }
}

/**
 * Update an existing client
 */
export async function updateClient(
  clientPath: string,
  clientConfig: Partial<{
    name: string;
    parameter: tagmanager_v2.Schema$Parameter[];
    parentFolderId: string;
    priority: number;
    notes: string;
  }>,
  fingerprint: string
): Promise<ClientDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const existing = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.clients.get({
        path: clientPath,
      })
    );

    const mergedConfig = {
      name: clientConfig.name ?? existing.name,
      type: existing.type,
      parameter: clientConfig.parameter ?? existing.parameter,
      parentFolderId: clientConfig.parentFolderId ?? existing.parentFolderId,
      priority: clientConfig.priority ?? existing.priority,
      notes: clientConfig.notes ?? existing.notes,
    };

    const client = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.clients.update({
        path: clientPath,
        fingerprint,
        requestBody: mergedConfig,
      })
    );

    return {
      clientId: client.clientId || '',
      name: client.name || '',
      type: client.type || '',
      path: client.path || '',
      folderId: client.parentFolderId || undefined,
      parameter: client.parameter || undefined,
      fingerprint: client.fingerprint || undefined,
      notes: client.notes || undefined,
      priority: client.priority || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'updateClient', { clientPath, clientConfig, fingerprint });
  }
}

/**
 * Delete a client (DESTRUCTIVE!)
 */
export async function deleteClient(clientPath: string): Promise<{ deleted: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.clients.delete({
        path: clientPath,
      })
    );
    return { deleted: true };
  } catch (error) {
    return handleApiError(error, 'deleteClient', { clientPath });
  }
}

/**
 * Analyze clients and return summary
 */
export function analyzeClientList(clients: ClientSummary[]): {
  total: number;
  byType: Record<string, number>;
} {
  const byType: Record<string, number> = {};

  for (const client of clients) {
    byType[client.type] = (byType[client.type] || 0) + 1;
  }

  return {
    total: clients.length,
    byType,
  };
}
