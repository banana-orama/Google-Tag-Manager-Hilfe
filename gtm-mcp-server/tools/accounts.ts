/**
 * Account-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';

export interface AccountSummary {
  accountId: string;
  name: string;
  path: string;
  containerCount?: number;
}

/**
 * List all accessible GTM accounts
 * Returns a compressed summary to save tokens
 */
export async function listAccounts(): Promise<AccountSummary[]> {
  const tagmanager = getTagManagerClient();

  const accounts = await gtmApiCall(() =>
    tagmanager.accounts.list()
  );

  if (!accounts.account) {
    return [];
  }

  // Return compressed summary
  return accounts.account.map((account) => ({
    accountId: account.accountId || '',
    name: account.name || '',
    path: account.path || '',
  }));
}

/**
 * Get a single account by ID
 */
export async function getAccount(accountId: string): Promise<tagmanager_v2.Schema$Account | null> {
  const tagmanager = getTagManagerClient();

  try {
    const account = await gtmApiCall(() =>
      tagmanager.accounts.get({
        path: `accounts/${accountId}`,
      })
    );
    return account;
  } catch (error) {
    return null;
  }
}
