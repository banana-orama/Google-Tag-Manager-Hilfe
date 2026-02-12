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
  declaredCapabilities: {
    triggers: string[];
    variables: string[];
    clients: boolean;
    transformations: boolean;
  };
  verifiedCapabilities: {
    triggers: string[];
    variables: string[];
    tags: string[];
    clients: string[];
    transformations: string[];
  };
  capabilityConflicts: string[];
  capabilities: ContainerCapabilities;
}

const containerInfoCache = new Map<string, ContainerInfo>();

// Web trigger types (camelCase, API v2 compliant)
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

// Server trigger types (camelCase, API v2 compliant)
const SERVER_TRIGGER_TYPES = [
  'always', 'customEvent', 'triggerGroup',
  'init', 'consentInit', 'serverPageview'
];

// Common variable types (Web/Mobile built-ins). Server containers often use template-defined variable types.
const COMMON_VARIABLE_TYPES = ['c', 'jsm', 'v', 'k', 'aev', 'r', 'smm', 'f', 'ev', 'fn', 'd', 'j', 'ejs'];

// Mobile-only variable types
const MOBILE_VARIABLE_TYPES = ['en', 'dn'];

export function getContainerCapabilities(usageContext: string[]): ContainerCapabilities {
  const uc = usageContext.map((u) => String(u).toLowerCase());
  const isServer = uc.includes('server');
  const isWeb = uc.includes('web');
  const isMobile = uc.includes('ios') || uc.includes('android');
  const isAmp = uc.includes('amp');

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

  return {
    containerType: isServer ? 'server' : isWeb ? 'web' : isAmp ? 'amp' : isMobile ? (uc[0] as 'ios' | 'android') : 'web',
    usageContext: uc,
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

  let verifiedWorkspacePath: string | undefined;
  try {
    const workspaces = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.list({ parent: containerPath })
    );
    verifiedWorkspacePath = workspaces.workspace?.[0]?.path || undefined;
  } catch {
    verifiedWorkspacePath = undefined;
  }

  const collectTypes = (items: Array<{ type?: string }> | undefined): string[] =>
    [...new Set((items || []).map((item) => String(item.type || '').trim()).filter(Boolean))].sort();

  let verifiedTags: string[] = [];
  let verifiedTriggers: string[] = [];
  let verifiedVariables: string[] = [];
  let verifiedClients: string[] = [];
  let verifiedTransformations: string[] = [];
  if (verifiedWorkspacePath) {
    try {
      const tags = await gtmApiCall(() => tagmanager.accounts.containers.workspaces.tags.list({ parent: verifiedWorkspacePath! }));
      verifiedTags = collectTypes(tags.tag as Array<{ type?: string }> | undefined);
    } catch {}
    try {
      const triggers = await gtmApiCall(() => tagmanager.accounts.containers.workspaces.triggers.list({ parent: verifiedWorkspacePath! }));
      verifiedTriggers = collectTypes(triggers.trigger as Array<{ type?: string }> | undefined);
    } catch {}
    try {
      const vars = await gtmApiCall(() => tagmanager.accounts.containers.workspaces.variables.list({ parent: verifiedWorkspacePath! }));
      verifiedVariables = collectTypes(vars.variable as Array<{ type?: string }> | undefined);
    } catch {}
    try {
      const clients = await gtmApiCall(() => tagmanager.accounts.containers.workspaces.clients.list({ parent: verifiedWorkspacePath! }));
      verifiedClients = collectTypes(clients.client as Array<{ type?: string }> | undefined);
    } catch {}
    try {
      const transformations = await gtmApiCall(() => tagmanager.accounts.containers.workspaces.transformations.list({ parent: verifiedWorkspacePath! }));
      verifiedTransformations = collectTypes(transformations.transformation as Array<{ type?: string }> | undefined);
    } catch {}
  }

  const declaredVariables = capabilities.containerType === 'server'
    ? [] // server variable types are template-defined; static web variable list is misleading.
    : capabilities.supportedVariableTypes;

  const conflicts: string[] = [];
  if (capabilities.containerType === 'server' && declaredVariables.length > 0) {
    conflicts.push('Declared server variable types should be empty/static-agnostic.');
  }
  if (verifiedVariables.length === 0 && capabilities.containerType === 'server') {
    conflicts.push('No verified variable types found in sampled server workspace; template-specific types may still be valid.');
  }

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
      triggers: verifiedTriggers.length > 0 ? verifiedTriggers : capabilities.supportedTriggerTypes,
      variables: verifiedVariables.length > 0 ? verifiedVariables : declaredVariables,
    },
    declaredCapabilities: {
      triggers: capabilities.supportedTriggerTypes,
      variables: declaredVariables,
      clients: capabilities.hasClients,
      transformations: capabilities.hasTransformations,
    },
    verifiedCapabilities: {
      triggers: verifiedTriggers,
      variables: verifiedVariables,
      tags: verifiedTags,
      clients: verifiedClients,
      transformations: verifiedTransformations,
    },
    capabilityConflicts: conflicts,
    capabilities,
  };

  containerInfoCache.clear();
  containerInfoCache.set(containerPath, info);
  return info;
}

// Helper to normalize trigger type (accept both camelCase, UPPERCASE, lowercase, and snake_case)
// GTM API v2 uses camelCase trigger types
export function normalizeTriggerType(type: string): string {
  const lower = type.toLowerCase();

  // Map lowercase variations to proper camelCase
  // Include all possible case variations to prevent issues
  const typeMap: Record<string, string> = {
    // Exact camelCase matches (most common)
    'pageview': 'pageview',
    'domready': 'domReady',
    'dom_ready': 'domReady',
    'windowloaded': 'windowLoaded',
    'window_loaded': 'windowLoaded',
    'click': 'click',
    'linkclick': 'linkClick',
    'link_click': 'linkClick',
    'formsubmission': 'formSubmission',
    'form_submission': 'formSubmission',
    'customevent': 'customEvent',
    'custom_event': 'customEvent',
    'customEvent': 'customEvent',
    'timer': 'timer',
    'scrolldepth': 'scrollDepth',
    'scroll_depth': 'scrollDepth',
    'elementvisibility': 'elementVisibility',
    'element_visibility': 'elementVisibility',
    'jserror': 'jsError',
    'js_error': 'jsError',
    'historychange': 'historyChange',
    'history_change': 'historyChange',
    'youtubevideo': 'youTubeVideo',
    'youtube_video': 'youTubeVideo',
    'firebaseappexception': 'firebaseAppException',
    'firebaseappupdate': 'firebaseAppUpdate',
    'firebasecampaign': 'firebaseCampaign',
    'firebasefirstopen': 'firebaseFirstOpen',
    'firebaseinapppurchase': 'firebaseInAppPurchase',
    'firebasenotificationdismiss': 'firebaseNotificationDismiss',
    'firebasenotificationforeground': 'firebaseNotificationForeground',
    'firebasenotificationopen': 'firebaseNotificationOpen',
    'firebasenotificationreceive': 'firebaseNotificationReceive',
    'firebaseosupdate': 'firebaseOsUpdate',
    'firebasesessionstart': 'firebaseSessionStart',
    'firebaseuserengagement': 'firebaseUserEngagement',
    'ampclick': 'ampClick',
    'amptimer': 'ampTimer',
    'ampscroll': 'ampScroll',
    'ampvisibility': 'ampVisibility',
    'always': 'always',
    'triggergroup': 'triggerGroup',
    'trigger_group': 'triggerGroup',
    'init': 'init',
    'consentinit': 'consentInit',
    'consent_init': 'consentInit',
    'serverpageview': 'serverPageview',
    'server_pageview': 'serverPageview',
  };

  // Always return camelCase for GTM API v2 compatibility
  return typeMap[lower] || type;
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

  // Check if trigger type is supported for this container type
  // Note: Only validate if we're NOT in a server container, as server containers may have custom trigger types
  const isServer = containerInfo.capabilities.containerType === 'server';

  // Check if type is valid (directly use normalizedType from function)
  const isWebValid = WEB_TRIGGER_TYPES.some(t => t.toLowerCase() === normalizedType.toLowerCase());
  const isServerValid = SERVER_TRIGGER_TYPES.some(t => t.toLowerCase() === normalizedType.toLowerCase());

  if (!isServer && !isWebValid) {
    const isServerOnly = SERVER_TRIGGER_TYPES.some(t => t.toLowerCase() === normalizedType.toLowerCase());
    const isWebOnly = WEB_TRIGGER_TYPES.some(t => t.toLowerCase() === normalizedType.toLowerCase());

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

  // Legacy arg1/arg2 filter formats are accepted and normalized in trigger tool handlers.

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

  // Strict API v2: server-side variable types can be template-defined and are not safely enumerable.
  if (containerInfo.capabilities.containerType === 'server') {
    if (!config.type || config.type.trim() === '') {
      return {
        code: 'INVALID_TYPE',
        message: 'Variable type is required',
        errorType: 'VARIABLE_TYPE_REQUIRED',
        suggestions: [
          'Provide an explicit server variable type',
          'Prefer templateReference for deterministic type resolution',
        ],
      };
    }
    return null;
  }

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
