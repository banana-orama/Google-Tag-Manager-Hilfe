/**
 * GTM Destinations API tools
 * Destinations are linked to containers (e.g., GA4 destination)
 */

import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';

export interface DestinationSummary {
  destinationId: string;
  name: string;
  path: string;
  destinationLinkId?: string;
}

export interface DestinationDetails extends DestinationSummary {
  fingerprint?: string;
}

/**
 * List all destinations linked to a container
 */
export async function listDestinations(containerPath: string): Promise<DestinationSummary[]> {
  const tagmanager = getTagManagerClient();

  const destinations = await gtmApiCall(() =>
    tagmanager.accounts.containers.destinations.list({
      parent: containerPath,
    })
  );

  if (!destinations.destination) {
    return [];
  }

  return destinations.destination.map((dest) => ({
    destinationId: dest.destinationId || '',
    name: dest.name || '',
    path: dest.path || '',
    destinationLinkId: dest.destinationLinkId || undefined,
  }));
}

/**
 * Get a single destination with full details
 */
export async function getDestination(destinationPath: string): Promise<DestinationDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const dest = await gtmApiCall(() =>
      tagmanager.accounts.containers.destinations.get({
        path: destinationPath,
      })
    );

    return {
      destinationId: dest.destinationId || '',
      name: dest.name || '',
      path: dest.path || '',
      destinationLinkId: dest.destinationLinkId || undefined,
      fingerprint: dest.fingerprint || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Link a destination to a container
 * Note: The destinationId is typically the linked resource ID (e.g., GA4 property ID)
 */
export async function linkDestination(
  containerPath: string,
  destinationId: string
): Promise<DestinationDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const dest = await gtmApiCall(() =>
      tagmanager.accounts.containers.destinations.link({
        parent: containerPath,
        destinationId,
      })
    );

    return {
      destinationId: dest.destinationId || '',
      name: dest.name || '',
      path: dest.path || '',
      destinationLinkId: dest.destinationLinkId || undefined,
      fingerprint: dest.fingerprint || undefined,
    };
  } catch (error) {
    console.error('Error linking destination:', error);
    return null;
  }
}
