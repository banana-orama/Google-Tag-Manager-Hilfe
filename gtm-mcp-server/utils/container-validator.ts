/**
 * Container type detection and validation utilities
 * Provides automatic container type detection and feature validation
 */

import { getTagManagerClient, gtmApiCall } from './gtm-client.js';
import { ApiError } from './error-handler.js';

export interface ContainerCapabilities {
  containerType: 'web' | 'server' | 'amp' | 'ios' | 'android';
  usageContext: string[];
  hasClients: boolean;
  hasTransformations: boolean;
  hasWebTriggers: boolean;
  hasServerTriggers: boolean;
  supportedTriggerTypes: string[];
  supportedVariableTypes: string[];
  notes: string[];
}

export interface ContainerInfo {
  accountId: string;
  containerId: string;
  name: string;
  publicId: string;
  usageContext: string[];
  supportedFeatures: {
    clients: boolean;
    transformations: boolean;
    zones: boolean;
    triggers: string[];
    variables: string[];
  };
  capabilities: ContainerCapabilities;
}

const containerInfoCache = new Map<string, ContainerInfo>();

// Web trigger types (lowercase, API v2 compliant)
const WEB_TRIGGER_TYPES = [
  'pageview', 'domReady', 'windowLoaded',
  'click', 'linkClick', 'formSubmission',
  'customEvent', 'timer', 'scrollDepth',
  'elementVisibility', 'jsError', 'historyChange',
  'youTubeVideo',
  'firebaseAppException', 'firebaseAppUpdate', 'firebaseCampaign',
  'firebaseFirstOpen', 'firebaseInAppPurchase', 'firebaseNotificationDismiss',
  'firebaseNotificationForeground', 'firebaseNotificationOpen',
  'firebaseNotificationReceive', 'firebaseOsUpdate', 'firebaseSessionStart',
  'firebaseUserEngagement',
  'ampClick', 'ampTimer', 'ampScroll', 'ampVisibility'
];

// Server trigger types (lowercase, API v2 compliant)
const SERVER_TRIGGER_TYPES = [
  'always', 'customEvent', 'triggerGroup',
  'init', 'consentInit', 'serverPageview'
];

// Common variable types
const COMMON_VARIABLE_TYPES = ['c', 'jsm', 'v', 'k', 'aev', 'r', 'smm', 'f', 'ev', 'fn', 'd', 'j', 'ejs'];

// Mobile-only variable types
const MOBILE_VARIABLE_TYPES = ['en', 'dn'];

export function getContainerCapabilities(usageContext: string[]): ContainerCapabilities {
  const isServer = usageContext.includes('server');
  const isWeb = usageContext.includes('web');
  const isMobile = usageContext.includes('ios') || usageContext.includes('android');
  const isAmp = usageContext.includes('amp');

  const notes: string[] = [];
  
  if (isServer) {
    notes.push('This is a Server container');
    notes.push('Clients and Transformations are available');
    notes.push('Only server trigger types are supported (always, customEvent, triggerGroup)');
  } else if (isWeb) {
    notes.push('This is a Web container');
    notes.push('Clients and Transformations are NOT available (Server-only features)');
    notes.push('Use "filter" with parameter array for trigger conditions');
  } else if (isAmp) {
    notes.push('This is an AMP container');
    notes.push('AMP-specific triggers are available');
  } else if (isMobile) {
    notes.push('This is a Mobile container (iOS/Android)');
    notes.push('Firebase triggers are available');
  }

  const containerType = isServer ? 'server' : isWeb ? 'web' : isAmp ? 'amp' : isMobile ? usageContext[0] : 'web';

  return {
    containerType: isServer ? 'server' : isWeb ? 'web' : isAmp ? 'amp' : isMobile ? usageContext[0] as 'ios' | 'android' : 'web',
    usageContext,
    hasClients: isServer,
    hasTransformations: isServer,
    hasWebTriggers: isWeb || isAmp,
    hasServerTriggers: isServer,
    supportedTriggerTypes: isServer 
      ? SERVER_TRIGGER_TYPES 
      : WEB_TRIGGER_TYPES,
    supportedVariableTypes: isMobile 
      ? [...COMMON_VARIABLE_TYPES, ...MOBILE_VARIABLE_TYPES] 
      : COMMON_VARIABLE_TYPES,
    notes,
  };
}

export async function getContainerInfo(containerPath: string): Promise<ContainerInfo> {
  if (containerInfoCache.has(containerPath)) {
    return containerInfoCache.get(containerPath)!;
  }

  const tagmanager = getTagManagerClient();
  const container = await gtmApiCall(() =>
    tagmanager.accounts.containers.get({ path: containerPath })
  );

  const capabilities = getContainerCapabilities(container.usageContext!);

  const info: ContainerInfo = {
    accountId: container.accountId!,
    containerId: container.containerId!,
    name: container.name!,
    publicId: container.publicId!,
    usageContext: container.usageContext!,
    supportedFeatures: {
      clients: capabilities.hasClients,
      transformations: capabilities.hasTransformations,
      zones: true,
      triggers: capabilities.supportedTriggerTypes,
      variables: capabilities.supportedVariableTypes,
    },
    capabilities,
  };

  containerInfoCache.set(containerPath, info);
  return info;
}

// Helper to normalize trigger type (accept both UPPERCASE and lowercase)
function normalizeTriggerType(type: string): string {
  // Map UPPERCASE to lowercase for API v2 compliance
  const typeMap: Record<string, string> = {
    'PAGEVIEW': 'pageview',
    'DOM_READY': 'domReady',
    'WINDOW_LOADED': 'windowLoaded',
    'CLICK': 'click',
    'LINK_CLICK': 'linkClick',
    'FORM_SUBMISSION': 'formSubmission',
    'CUSTOM_EVENT': 'customEvent',
    'TIMER': 'timer',
    'SCROLL_DEPTH': 'scrollDepth',
    'ELEMENT_VISIBILITY': 'elementVisibility',
    'JS_ERROR': 'jsError',
    'HISTORY_CHANGE': 'historyChange',
    'YOU_TUBE_VIDEO': 'youTubeVideo',
    'FIREBASE_APP_EXCEPTION': 'firebaseAppException',
    'FIREBASE_APP_UPDATE': 'firebaseAppUpdate',
    'FIREBASE_CAMPAIGN': 'firebaseCampaign',
    'FIREBASE_FIRST_OPEN': 'firebaseFirstOpen',
    'FIREBASE_IN_APP_PURCHASE': 'firebaseInAppPurchase',
    'FIREBASE_NOTIFICATION_DISMISS': 'firebaseNotificationDismiss',
    'FIREBASE_NOTIFICATION_FOREGROUND': 'firebaseNotificationForeground',
    'FIREBASE_NOTIFICATION_OPEN': 'firebaseNotificationOpen',
    'FIREBASE_NOTIFICATION_RECEIVE': 'firebaseNotificationReceive',
    'FIREBASE_OS_UPDATE': 'firebaseOsUpdate',
    'FIREBASE_SESSION_START': 'firebaseSessionStart',
    'FIREBASE_USER_ENGAGEMENT': 'firebaseUserEngagement',
    'AMP_CLICK': 'ampClick',
    'AMP_TIMER': 'ampTimer',
    'AMP_SCROLL': 'ampScroll',
    'AMP_VISIBILITY': 'ampVisibility',
  };

  return typeMap[type] || type.toLowerCase();
}

export async function validateTriggerConfig(
  config: { name: string; type: string; filter?: any[]; customEventFilter?: any[] },
  workspacePath: string
): Promise<ApiError | null> {
  if (!config.name || config.name.trim() === '') {
    return {
      code: 'INVALID_NAME',
      message: 'Trigger name is required',
      errorType: 'TRIGGER_NAME_REQUIRED',
      suggestions: ['Provide a non-empty name for the trigger'],
      example: { name: 'My Trigger' },
      help: 'The trigger name must be a non-empty string',
    };
  }

  const containerPath = workspacePath.replace(/\/workspaces\/\d+$/, '');
  const containerInfo = await getContainerInfo(containerPath);
  const normalizedType = normalizeTriggerType(config.type);

  // Check if trigger type is supported for this container
  if (!containerInfo.supportedFeatures.triggers.includes(normalizedType)) {
    const isServerOnly = SERVER_TRIGGER_TYPES.includes(normalizedType);
    const isWebOnly = WEB_TRIGGER_TYPES.includes(normalizedType);

    let help = '';
    let suggestions: string[] = [];

    if (isServerOnly && !containerInfo.capabilities.hasServerTriggers) {
      help = `"${normalizedType}" is a Server-only trigger type`;
      suggestions = [
        'This trigger type is only available in Server containers',
        'For web containers, use: pageview, click, formSubmission, customEvent, timer, scrollDepth',
        'Check container type with gtm_get_container_info',
      ];
    } else if (isWebOnly && !containerInfo.capabilities.hasWebTriggers) {
      help = `"${normalizedType}" is a Web-only trigger type`;
      suggestions = [
        'This trigger type is only available in Web/AMP containers',
        'For server containers, use: always, customEvent, triggerGroup',
        'Check container type with gtm_get_container_info',
      ];
    } else {
      suggestions = [
        `This container type supports: ${containerInfo.supportedFeatures.triggers.slice(0, 10).join(', ')}...`,
        'Check container type with gtm_get_container_info',
      ];
    }

    return {
      code: 'INVALID_TYPE',
      message: `Invalid trigger type "${config.type}" for this container type`,
      errorType: 'TRIGGER_TYPE_MISMATCH',
      details: {
        providedType: config.type,
        normalizedType,
        containerType: containerInfo.capabilities.containerType,
        validTypes: containerInfo.supportedFeatures.triggers,
      },
      help,
      suggestions,
      example: {
        validTypes: containerInfo.supportedFeatures.triggers.slice(0, 10),
        note: 'Choose one of these types for your container',
      },
    };
  }

  // Validate customEvent filter format (should use parameter array with arg0/arg1)
  if (config.customEventFilter && Array.isArray(config.customEventFilter)) {
    for (let i = 0; i < config.customEventFilter.length; i++) {
      const filter = config.customEventFilter[i];
      // Check if using old format (direct arg1/arg2) vs new format (parameter array)
      if (filter.arg1 !== undefined && filter.arg2 !== undefined && !filter.parameter) {
        return {
          code: 'INVALID_FILTER_FORMAT',
          message: `customEventFilter at index ${i} uses deprecated format`,
          errorType: 'FILTER_FORMAT_DEPRECATED',
          help: 'Conditions should use "parameter" array with arg0/arg1 keys (API v2 format)',
          suggestions: [
            'Use parameter array with key/type/value objects',
            'Replace arg1/arg2 with parameter array containing arg0 and arg1',
          ],
          example: {
            incorrect: { type: 'equals', arg1: '{{Event}}', arg2: 'purchase' },
            correct: {
              type: 'equals',
              parameter: [
                { key: 'arg0', type: 'template', value: '{{Event}}' },
                { key: 'arg1', type: 'template', value: 'purchase' },
              ],
            },
          },
        };
      }
    }
  }

  // Validate filter format
  if (config.filter && Array.isArray(config.filter)) {
    for (let i = 0; i < config.filter.length; i++) {
      const filter = config.filter[i];
      if (filter.arg1 !== undefined && filter.arg2 !== undefined && !filter.parameter) {
        return {
          code: 'INVALID_FILTER_FORMAT',
          message: `filter at index ${i} uses deprecated format`,
          errorType: 'FILTER_FORMAT_DEPRECATED',
          help: 'Conditions should use "parameter" array with arg0/arg1 keys (API v2 format)',
          suggestions: [
            'Use parameter array with key/type/value objects',
            'Replace arg1/arg2 with parameter array containing arg0 and arg1',
          ],
          example: {
            incorrect: { type: 'contains', arg1: '{{Page URL}}', arg2: '/checkout' },
            correct: {
              type: 'contains',
              parameter: [
                { key: 'arg0', type: 'template', value: '{{Page URL}}' },
                { key: 'arg1', type: 'template', value: '/checkout' },
              ],
            },
          },
        };
      }
    }
  }

  return null;
}

export async function validateVariableConfig(
  config: { name: string; type: string },
  workspacePath: string
): Promise<ApiError | null> {
  if (!config.name || config.name.trim() === '') {
    return {
      code: 'INVALID_NAME',
      message: 'Variable name is required',
      errorType: 'VARIABLE_NAME_REQUIRED',
      suggestions: ['Provide a non-empty name for the variable'],
      example: { name: 'My Variable' },
      help: 'The variable name must be a non-empty string',
    };
  }

  // Check for {{ }} in variable name (common mistake)
  if (config.name.includes('{{') || config.name.includes('}}')) {
    return {
      code: 'INVALID_NAME',
      message: 'Variable name should not contain {{ }}',
      errorType: 'VARIABLE_NAME_FORMAT',
      help: 'Variable names should be plain text without {{ }} brackets',
      suggestions: [
        'Remove {{ }} from the variable name',
        'Use plain names like "API Key" not "{{API Key}}"',
        '{{ }} are only used when referencing variables in tag fields',
      ],
      example: {
        incorrect: '{{GA4 Measurement ID}}',
        correct: 'GA4 Measurement ID',
      },
    };
  }

  const containerPath = workspacePath.replace(/\/workspaces\/\d+$/, '');
  const containerInfo = await getContainerInfo(containerPath);

  if (!containerInfo.supportedFeatures.variables.includes(config.type)) {
    return {
      code: 'INVALID_TYPE',
      message: `Invalid variable type "${config.type}" for this container type`,
      errorType: 'VARIABLE_TYPE_MISMATCH',
      details: {
        providedType: config.type,
        containerType: containerInfo.usageContext.join(', '),
        validTypes: containerInfo.supportedFeatures.variables
      },
      suggestions: [
        `This container type supports: ${containerInfo.supportedFeatures.variables.join(', ')}`,
        'Check if you\'re trying to create a mobile-only variable in a web container',
        'See GTM documentation for variable types'
      ],
      example: {
        validTypes: containerInfo.supportedFeatures.variables,
        note: 'Choose one of these types for your container'
      }
    };
  }

  return null;
}

export async function validateClientConfig(
  config: { name: string; type: string },
  workspacePath: string
): Promise<ApiError | null> {
  if (!config.name || config.name.trim() === '') {
    return {
      code: 'INVALID_NAME',
      message: 'Client name is required',
      errorType: 'CLIENT_NAME_REQUIRED',
      suggestions: ['Provide a non-empty name for the client'],
      example: { name: 'My Client' },
      help: 'The client name must be a non-empty string',
    };
  }

  const containerPath = workspacePath.replace(/\/workspaces\/\d+$/, '');
  const containerInfo = await getContainerInfo(containerPath);

  if (!containerInfo.capabilities.hasClients) {
    return {
      code: 'INVALID_CONTAINER_TYPE',
      message: 'Clients are only available in Server-Side containers',
      errorType: 'SERVER_ONLY_FEATURE',
      details: {
        containerType: containerInfo.capabilities.containerType,
      },
      help: 'Clients receive and process incoming requests in Server-Side GTM',
      suggestions: [
        'This is NOT a Server container',
        'Clients are only available in Server-Side GTM containers',
        'Use gtm_get_container_info to check your container type',
        'For web containers, use tags and variables instead',
      ],
      example: {
        serverOnly: ['clients', 'transformations'],
        checkCommand: 'gtm_get_container_info',
      },
    };
  }

  return null;
}

export async function validateTransformationConfig(
  config: { name: string; type: string },
  workspacePath: string
): Promise<ApiError | null> {
  if (!config.name || config.name.trim() === '') {
    return {
      code: 'INVALID_NAME',
      message: 'Transformation name is required',
      errorType: 'TRANSFORMATION_NAME_REQUIRED',
      suggestions: ['Provide a non-empty name for the transformation'],
      example: { name: 'My Transformation' },
      help: 'The transformation name must be a non-empty string',
    };
  }

  const containerPath = workspacePath.replace(/\/workspaces\/\d+$/, '');
  const containerInfo = await getContainerInfo(containerPath);

  if (!containerInfo.capabilities.hasTransformations) {
    return {
      code: 'INVALID_CONTAINER_TYPE',
      message: 'Transformations are only available in Server-Side containers',
      errorType: 'SERVER_ONLY_FEATURE',
      details: {
        containerType: containerInfo.capabilities.containerType,
      },
      help: 'Transformations modify or enrich data before tags fire in Server-Side GTM',
      suggestions: [
        'This is NOT a Server container',
        'Transformations are only available in Server-Side GTM containers',
        'Use gtm_get_container_info to check your container type',
        'For web containers, use variables instead',
      ],
      example: {
        serverOnly: ['clients', 'transformations'],
        checkCommand: 'gtm_get_container_info',
      },
    };
  }

  return null;
}

export function clearContainerInfoCache(): void {
  containerInfoCache.clear();
}

// Export for use in other modules
export { WEB_TRIGGER_TYPES, SERVER_TRIGGER_TYPES, COMMON_VARIABLE_TYPES };
