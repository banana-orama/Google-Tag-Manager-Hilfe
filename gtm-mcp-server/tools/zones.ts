/**
 * GTM Zones API tools
 * Zones are used for consent management (e.g., Google Consent Mode)
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';

export interface ZoneSummary {
  zoneId: string;
  name: string;
  path: string;
}

export interface ZoneDetails extends ZoneSummary {
  fingerprint?: string;
  notes?: string;
  boundary?: tagmanager_v2.Schema$ZoneBoundary;
  childContainer?: tagmanager_v2.Schema$ZoneChildContainer[];
  typeRestriction?: tagmanager_v2.Schema$ZoneTypeRestriction;
}

/**
 * List all zones in a workspace
 */
export async function listZones(workspacePath: string): Promise<ZoneSummary[]> {
  const tagmanager = getTagManagerClient();

  const zones = await gtmApiCall(() =>
    tagmanager.accounts.containers.workspaces.zones.list({
      parent: workspacePath,
    })
  );

  if (!zones.zone) {
    return [];
  }

  return zones.zone.map((zone) => ({
    zoneId: zone.zoneId || '',
    name: zone.name || '',
    path: zone.path || '',
  }));
}

/**
 * Get a single zone with full details
 */
export async function getZone(zonePath: string): Promise<ZoneDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const zone = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.zones.get({
        path: zonePath,
      })
    );

    return {
      zoneId: zone.zoneId || '',
      name: zone.name || '',
      path: zone.path || '',
      fingerprint: zone.fingerprint || undefined,
      notes: zone.notes || undefined,
      boundary: zone.boundary || undefined,
      childContainer: zone.childContainer || undefined,
      typeRestriction: zone.typeRestriction || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new zone
 */
export async function createZone(
  workspacePath: string,
  zoneConfig: {
    name: string;
    notes?: string;
    boundary?: tagmanager_v2.Schema$ZoneBoundary;
    childContainer?: tagmanager_v2.Schema$ZoneChildContainer[];
    typeRestriction?: tagmanager_v2.Schema$ZoneTypeRestriction;
  }
): Promise<ZoneDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const zone = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.zones.create({
        parent: workspacePath,
        requestBody: zoneConfig,
      })
    );

    return {
      zoneId: zone.zoneId || '',
      name: zone.name || '',
      path: zone.path || '',
      fingerprint: zone.fingerprint || undefined,
      notes: zone.notes || undefined,
      boundary: zone.boundary || undefined,
      childContainer: zone.childContainer || undefined,
      typeRestriction: zone.typeRestriction || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'createZone', zoneConfig);
  }
}

/**
 * Update an existing zone
 */
export async function updateZone(
  zonePath: string,
  zoneConfig: Partial<{
    name: string;
    boundary: tagmanager_v2.Schema$ZoneBoundary;
    childContainer: tagmanager_v2.Schema$ZoneChildContainer[];
    typeRestriction: tagmanager_v2.Schema$ZoneTypeRestriction;
    notes: string;
  }>,
  fingerprint: string
): Promise<ZoneDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const zone = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.zones.update({
        path: zonePath,
        fingerprint,
        requestBody: zoneConfig,
      })
    );

    return {
      zoneId: zone.zoneId || '',
      name: zone.name || '',
      path: zone.path || '',
      fingerprint: zone.fingerprint || undefined,
      notes: zone.notes || undefined,
      boundary: zone.boundary || undefined,
      childContainer: zone.childContainer || undefined,
      typeRestriction: zone.typeRestriction || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'updateZone', { zonePath, zoneConfig, fingerprint });
  }
}

/**
 * Delete a zone (DESTRUCTIVE!)
 */
export async function deleteZone(zonePath: string): Promise<{ deleted: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.zones.delete({
        path: zonePath,
      })
    );
    return { deleted: true };
  } catch (error) {
    return handleApiError(error, 'deleteZone', { zonePath });
  }
}
