/**
 * GTM User Permissions API tools
 * Manage user access to GTM accounts and containers
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';

export interface UserPermissionSummary {
  path: string;
  emailAddress: string;
  accountId: string;
}

export interface UserPermissionDetails extends UserPermissionSummary {
  accountAccess?: tagmanager_v2.Schema$AccountAccess;
  containerAccess?: tagmanager_v2.Schema$ContainerAccess[];
}

/**
 * List all user permissions for an account
 */
export async function listUserPermissions(accountPath: string): Promise<UserPermissionSummary[]> {
  const tagmanager = getTagManagerClient();

  const permissions = await gtmApiCall(() =>
    tagmanager.accounts.user_permissions.list({
      parent: accountPath,
    })
  );

  if (!permissions.userPermission) {
    return [];
  }

  return permissions.userPermission.map((perm) => ({
    path: perm.path || '',
    emailAddress: perm.emailAddress || '',
    accountId: perm.accountId || '',
  }));
}

/**
 * Get a single user permission with full details
 */
export async function getUserPermission(permissionPath: string): Promise<UserPermissionDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const perm = await gtmApiCall(() =>
      tagmanager.accounts.user_permissions.get({
        path: permissionPath,
      })
    );

    return {
      path: perm.path || '',
      emailAddress: perm.emailAddress || '',
      accountId: perm.accountId || '',
      accountAccess: perm.accountAccess || undefined,
      containerAccess: perm.containerAccess || undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new user permission
 */
export async function createUserPermission(
  accountPath: string,
  permissionConfig: {
    emailAddress: string;
    accountAccess?: tagmanager_v2.Schema$AccountAccess;
    containerAccess?: tagmanager_v2.Schema$ContainerAccess[];
  }
): Promise<UserPermissionDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const perm = await gtmApiCall(() =>
      tagmanager.accounts.user_permissions.create({
        parent: accountPath,
        requestBody: permissionConfig,
      })
    );

    return {
      path: perm.path || '',
      emailAddress: perm.emailAddress || '',
      accountId: perm.accountId || '',
      accountAccess: perm.accountAccess || undefined,
      containerAccess: perm.containerAccess || undefined,
    };
  } catch (error) {
    console.error('Error creating user permission:', error);
    return null;
  }
}

/**
 * Update an existing user permission
 */
export async function updateUserPermission(
  permissionPath: string,
  permissionConfig: Partial<{
    accountAccess: tagmanager_v2.Schema$AccountAccess;
    containerAccess: tagmanager_v2.Schema$ContainerAccess[];
  }>
): Promise<UserPermissionDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const perm = await gtmApiCall(() =>
      tagmanager.accounts.user_permissions.update({
        path: permissionPath,
        requestBody: permissionConfig,
      })
    );

    return {
      path: perm.path || '',
      emailAddress: perm.emailAddress || '',
      accountId: perm.accountId || '',
      accountAccess: perm.accountAccess || undefined,
      containerAccess: perm.containerAccess || undefined,
    };
  } catch (error) {
    console.error('Error updating user permission:', error);
    return null;
  }
}

/**
 * Delete a user permission (DESTRUCTIVE!)
 */
export async function deleteUserPermission(permissionPath: string): Promise<boolean> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.user_permissions.delete({
        path: permissionPath,
      })
    );
    return true;
  } catch (error) {
    console.error('Error deleting user permission:', error);
    return false;
  }
}
