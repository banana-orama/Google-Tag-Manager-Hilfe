/**
 * GTM API Client wrapper with rate limiting
 */

import { google, tagmanager_v2 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { rateLimiter } from './rate-limiter.js';

export type TagManager = tagmanager_v2.Tagmanager;

let tagmanagerClient: TagManager | null = null;

/**
 * Initialize the Tag Manager client
 */
export function initTagManagerClient(auth: OAuth2Client): TagManager {
  tagmanagerClient = google.tagmanager({ version: 'v2', auth });
  return tagmanagerClient;
}

/**
 * Get the Tag Manager client (must be initialized first)
 */
export function getTagManagerClient(): TagManager {
  if (!tagmanagerClient) {
    throw new Error('Tag Manager client not initialized. Call initTagManagerClient first.');
  }
  return tagmanagerClient;
}

/**
 * Execute a GTM API call with rate limiting
 */
export async function gtmApiCall<T>(fn: () => Promise<{ data: T }>): Promise<T> {
  const result = await rateLimiter.execute(fn);
  return result.data;
}

/**
 * Helper to extract path components
 */
export function parsePath(path: string): {
  accountId?: string;
  containerId?: string;
  workspaceId?: string;
  versionId?: string;
} {
  const parts: Record<string, string> = {};
  const regex = /accounts\/(\d+)|containers\/(\d+)|workspaces\/(\d+)|versions\/(\d+)/g;
  let match;

  while ((match = regex.exec(path)) !== null) {
    if (match[1]) parts.accountId = match[1];
    if (match[2]) parts.containerId = match[2];
    if (match[3]) parts.workspaceId = match[3];
    if (match[4]) parts.versionId = match[4];
  }

  return parts;
}

/**
 * Build a path string from components
 */
export function buildPath(components: {
  accountId: string;
  containerId?: string;
  workspaceId?: string;
}): string {
  let path = `accounts/${components.accountId}`;
  if (components.containerId) {
    path += `/containers/${components.containerId}`;
    if (components.workspaceId) {
      path += `/workspaces/${components.workspaceId}`;
    }
  }
  return path;
}
