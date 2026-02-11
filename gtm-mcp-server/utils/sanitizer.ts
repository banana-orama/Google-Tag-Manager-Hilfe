/**
 * Input Validation and Sanitization Utilities
 * Provides safe validation for user inputs
 */

import { resolve, normalize } from 'path';

/**
 * Sanitize GTM path to prevent path traversal
 */
export function sanitizeGtmPath(path: string): string {
  const resolvedPath = resolve(path);
  const normalizedPath = normalize(resolvedPath);
  
  // Validate it's a proper GTM path format
  const gtmPathPattern = /^accounts\/\d+\/(containers|workspaces|tags|triggers|variables|folders|templates|clients|transformations|zones|destinations|environments|built_in_variables|gtag_config|user_permissions)(\/\d+)?$/;
  
  if (!gtmPathPattern.test(normalizedPath)) {
    throw new Error(`Invalid GTM path format: ${path}. Expected format: accounts/{id}/containers/{id}/...`);
  }
  
  // Prevent path traversal attempts
  if (normalizedPath.includes('..') || normalizedPath.includes('~') || normalizedPath.includes('\0')) {
    throw new Error('Path traversal detected');
  }
  
  return normalizedPath;
}

/**
 * Sanitize user input string to prevent XSS
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  
  // Remove potentially dangerous characters
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>))[^<]*>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

/**
 * Validate GTM resource IDs
 */
export function validateResourceId(id: string, type: 'accountId' | 'containerId' | 'workspaceId' | 'tagId' | 'triggerId' | 'variableId'): boolean {
  const numericIdPattern = /^\d+$/;
  return numericIdPattern.test(id);
}

/**
 * Validate container type
 */
export function validateContainerType(type: string): boolean {
  const validTypes = ['web', 'server', 'amp', 'ios', 'android'];
  return validTypes.includes(type);
}

/**
 * Validate trigger type (API v2 format - camelCase)
 */
export function validateTriggerType(type: string): boolean {
  // Common web trigger types
  const webTriggers = [
    'pageview', 'domReady', 'windowLoaded', 'click', 'linkClick',
    'formSubmission', 'customEvent', 'timer', 'scrollDepth',
    'elementVisibility', 'jsError', 'historyChange', 'youTubeVideo',
    'ampClick', 'ampTimer', 'ampScroll', 'ampVisibility'
  ];
  
  // Server trigger types
  const serverTriggers = [
    'always', 'customEvent', 'triggerGroup', 'init', 'consentInit', 'serverPageview'
  ];
  
  const validTypes = [...webTriggers, ...serverTriggers];
  return validTypes.includes(type);
}

/**
 * Validate variable type
 */
export function validateVariableType(type: string): boolean {
  const validTypes = ['k', 'c', 'v', 'f', 'jsm', 'aev', 'r', 'smm'];
  return validTypes.includes(type);
}

/**
 * Check if a string contains HTML tags
 */
export function containsHtmlTags(str: string): boolean {
  return /<[^>]+>.*<\/[^>]+>/.test(str);
}

/**
 * Extract safe error message without exposing internal paths
 */
export function sanitizeErrorMessage(error: unknown): string {
  const errorStr = error instanceof Error ? error.message : String(error);
  
  // Remove file paths that might leak system information
  return errorStr
    .replace(/\/[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+/g, '');
}
