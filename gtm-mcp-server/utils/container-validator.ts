/**
 * Container type detection and validation utilities
 * Provides automatic container type detection and feature validation
 */

import { getTagManagerClient, gtmApiCall } from './gtm-client.js';
import { ApiError } from './error-handler.js';

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
}

const containerInfoCache = new Map<string, ContainerInfo>();

export async function getContainerInfo(containerPath: string): Promise<ContainerInfo> {
  if (containerInfoCache.has(containerPath)) {
    return containerInfoCache.get(containerPath)!;
  }

  const tagmanager = getTagManagerClient();
  const container = await gtmApiCall(() =>
    tagmanager.accounts.containers.get({ path: containerPath })
  );

  const info: ContainerInfo = {
    accountId: container.accountId!,
    containerId: container.containerId!,
    name: container.name!,
    publicId: container.publicId!,
    usageContext: container.usageContext!,
    supportedFeatures: {
      clients: container.usageContext!.includes('server'),
      transformations: container.usageContext!.includes('server'),
      zones: true,
      triggers: getSupportedTriggers(container.usageContext!),
      variables: getSupportedVariables(container.usageContext!),
    },
  };

  containerInfoCache.set(containerPath, info);
  return info;
}

function getSupportedTriggers(usageContext: string[]): string[] {
  if (usageContext.includes('server')) {
    return ['always', 'customEvent', 'triggerGroup'];
  }

  return [
    'PAGEVIEW', 'DOM_READY', 'WINDOW_LOADED',
    'CLICK', 'LINK_CLICK',
    'FORM_SUBMISSION',
    'CUSTOM_EVENT',
    'TIMER', 'SCROLL_DEPTH', 'ELEMENT_VISIBILITY',
    'JS_ERROR', 'HISTORY_CHANGE',
    'YOU_TUBE_VIDEO',
    'FIREBASE_APP_EXCEPTION', 'FIREBASE_APP_UPDATE',
    'FIREBASE_CAMPAIGN', 'FIREBASE_FIRST_OPEN',
    'FIREBASE_IN_APP_PURCHASE', 'FIREBASE_NOTIFICATION_DISMISS',
    'FIREBASE_NOTIFICATION_FOREGROUND', 'FIREBASE_NOTIFICATION_OPEN',
    'FIREBASE_OS_UPDATE', 'FIREBASE_SESSION_START',
    'FIREBASE_USER_ENGAGEMENT',
    'AMP_CLICK', 'AMP_TIMER', 'AMP_SCROLL', 'AMP_VISIBILITY'
  ];
}

function getSupportedVariables(usageContext: string[]): string[] {
  const common = ['c', 'jsm', 'v', 'k', 'aev', 'r', 'smm', 'f', 'ev', 'fn', 'd', 'j', 'ejs'];
  const mobileOnly = ['en', 'dn'];

  if (usageContext.includes('ios') || usageContext.includes('android')) {
    return [...common, ...mobileOnly];
  }

  return common;
}

export async function validateTriggerConfig(
  config: { name: string; type: string },
  workspacePath: string
): Promise<ApiError | null> {
  if (!config.name || config.name.trim() === '') {
    return {
      code: 'INVALID_NAME',
      message: 'Trigger name is required',
      suggestions: ['Provide a non-empty name for the trigger'],
      example: { name: 'My Trigger' }
    };
  }

  const containerPath = workspacePath.replace(/\/workspaces\/\d+$/, '');
  const containerInfo = await getContainerInfo(containerPath);

  if (!containerInfo.supportedFeatures.triggers.includes(config.type)) {
    return {
      code: 'INVALID_TYPE',
      message: `Invalid trigger type "${config.type}" for this container type`,
      details: {
        providedType: config.type,
        containerType: containerInfo.usageContext.join(', '),
        validTypes: containerInfo.supportedFeatures.triggers
      },
      suggestions: [
        `This container type supports: ${containerInfo.supportedFeatures.triggers.join(', ')}`,
        'Check if you\'re trying to create a server-side trigger in a web container',
        'See GTM documentation for trigger types'
      ],
      example: {
        validTypes: containerInfo.supportedFeatures.triggers,
        note: 'Choose one of these types for your container'
      }
    };
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
      suggestions: ['Provide a non-empty name for the variable'],
      example: { name: 'My Variable' }
    };
  }

  const containerPath = workspacePath.replace(/\/workspaces\/\d+$/, '');
  const containerInfo = await getContainerInfo(containerPath);

  if (!containerInfo.supportedFeatures.variables.includes(config.type)) {
    return {
      code: 'INVALID_TYPE',
      message: `Invalid variable type "${config.type}" for this container type`,
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
      suggestions: ['Provide a non-empty name for the client'],
      example: { name: 'My Client' }
    };
  }

  const containerPath = workspacePath.replace(/\/workspaces\/\d+$/, '');
  const containerInfo = await getContainerInfo(containerPath);

  if (!containerInfo.supportedFeatures.clients) {
    return {
      code: 'INVALID_CONTAINER_TYPE',
      message: 'Clients are only available in Server-Side containers',
      details: {
        containerType: containerInfo.usageContext.join(', '),
      },
      suggestions: [
        'This is a web or mobile container, which does not support clients',
        'Clients are only available in Server-Side GTM containers',
        'If you need to create tags or variables, use those functions instead'
      ],
      example: {
        alternative: 'For web containers, use tags and variables instead of clients',
      }
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
      suggestions: ['Provide a non-empty name for the transformation'],
      example: { name: 'My Transformation' }
    };
  }

  const containerPath = workspacePath.replace(/\/workspaces\/\d+$/, '');
  const containerInfo = await getContainerInfo(containerPath);

  if (!containerInfo.supportedFeatures.transformations) {
    return {
      code: 'INVALID_CONTAINER_TYPE',
      message: 'Transformations are only available in Server-Side containers',
      details: {
        containerType: containerInfo.usageContext.join(', '),
      },
      suggestions: [
        'This is a web or mobile container, which does not support transformations',
        'Transformations are only available in Server-Side GTM containers',
        'If you need to modify data, use variables instead'
      ],
      example: {
        alternative: 'For web containers, use variables instead of transformations',
      }
    };
  }

  return null;
}

export function clearContainerInfoCache(): void {
  containerInfoCache.clear();
}
