/**
 * Built-In Variables GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';

export interface BuiltInVariableSummary {
  name: string;
  type: string;
  path: string;
}

// All available built-in variable types
export const BUILT_IN_VARIABLE_TYPES = [
  // Page variables
  'PAGE_URL', 'PAGE_HOSTNAME', 'PAGE_PATH', 'REFERRER', 'PAGE_TITLE',
  // Utility variables
  'EVENT', 'CONTAINER_ID', 'CONTAINER_VERSION', 'RANDOM_NUMBER',
  'HTML_ID', 'DEBUG_MODE', 'ENVIRONMENT_NAME',
  // Click variables
  'CLICK_ELEMENT', 'CLICK_CLASSES', 'CLICK_ID', 'CLICK_TARGET',
  'CLICK_URL', 'CLICK_TEXT',
  // Form variables
  'FORM_ELEMENT', 'FORM_CLASSES', 'FORM_ID', 'FORM_TARGET',
  'FORM_URL', 'FORM_TEXT',
  // Error variables
  'ERROR_MESSAGE', 'ERROR_URL', 'ERROR_LINE',
  // Scroll variables
  'SCROLL_DEPTH_THRESHOLD', 'SCROLL_DEPTH_UNITS', 'SCROLL_DEPTH_DIRECTION',
  // Video variables
  'VIDEO_PROVIDER', 'VIDEO_URL', 'VIDEO_TITLE', 'VIDEO_DURATION',
  'VIDEO_PERCENT', 'VIDEO_VISIBLE', 'VIDEO_STATUS', 'VIDEO_CURRENT_TIME',
  // Visibility variables
  'VISIBLE_ELEMENT', 'VISIBLE_FIRST_TIME', 'VISIBLE_RATIO',
  // History variables
  'NEW_HISTORY_FRAGMENT', 'OLD_HISTORY_FRAGMENT', 'NEW_HISTORY_STATE',
  'OLD_HISTORY_STATE', 'HISTORY_SOURCE',
  // AMP variables
  'AMP_BROWSER_LANGUAGE', 'AMP_CANONICAL_HOST', 'AMP_CANONICAL_PATH',
  'AMP_CANONICAL_URL', 'AMP_CLIENT_ID', 'AMP_CLIENT_MAX_SCROLL_X',
  'AMP_CLIENT_MAX_SCROLL_Y', 'AMP_CLIENT_SCREEN_HEIGHT', 'AMP_CLIENT_SCREEN_WIDTH',
  'AMP_CLIENT_SCROLL_X', 'AMP_CLIENT_SCROLL_Y', 'AMP_CLIENT_TIMESTAMP',
  'AMP_CLIENT_TIMEZONE', 'AMP_GEO_CITY', 'AMP_GEO_COUNTRY', 'AMP_GEO_REGION',
  'AMP_PAGE_DOWNLOAD_TIME', 'AMP_PAGE_LOAD_TIME', 'AMP_PAGE_VIEW_ID',
  'AMP_RANDOM', 'AMP_SCREEN_COLOR_DEPTH', 'AMP_SCROLL_HEIGHT', 'AMP_SCROLL_WIDTH',
  'AMP_TOTAL_ENGAGED_TIME', 'AMP_USER_LANGUAGE', 'AMP_VIEWER',
  // Server-side variables
  'REQUEST_PATH', 'REQUEST_METHOD', 'QUERY_STRING',
] as const;

/**
 * List all enabled built-in variables in a workspace
 */
export async function listBuiltInVariables(workspacePath: string): Promise<BuiltInVariableSummary[]> {
  const tagmanager = getTagManagerClient();

  const builtInVars = await gtmApiCall(() =>
    tagmanager.accounts.containers.workspaces.built_in_variables.list({
      parent: workspacePath,
    })
  );

  if (!builtInVars.builtInVariable) {
    return [];
  }

  return builtInVars.builtInVariable.map((biv) => ({
    name: biv.name || '',
    type: biv.type || '',
    path: biv.path || '',
  }));
}

/**
 * Enable built-in variables by type
 */
export async function createBuiltInVariables(
  workspacePath: string,
  types: string[]
): Promise<BuiltInVariableSummary[]> {
  const tagmanager = getTagManagerClient();

  try {
    const result = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.built_in_variables.create({
        parent: workspacePath,
        type: types,
      })
    );

    if (!result.builtInVariable) {
      return [];
    }

    return result.builtInVariable.map((biv) => ({
      name: biv.name || '',
      type: biv.type || '',
      path: biv.path || '',
    }));
  } catch (error) {
    console.error('Error creating built-in variables:', error);
    return [];
  }
}

/**
 * Disable (delete) built-in variables by type
 */
export async function deleteBuiltInVariables(
  workspacePath: string,
  types: string[]
): Promise<boolean> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.built_in_variables.delete({
        path: workspacePath,
        type: types,
      })
    );
    return true;
  } catch (error) {
    console.error('Error deleting built-in variables:', error);
    return false;
  }
}

/**
 * Revert built-in variable changes in workspace
 */
export async function revertBuiltInVariable(
  workspacePath: string,
  type: string
): Promise<boolean> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.built_in_variables.revert({
        path: workspacePath,
        type,
      })
    );
    return true;
  } catch (error) {
    console.error('Error reverting built-in variable:', error);
    return false;
  }
}
