/**
 * Error handling utilities for GTM API calls
 * Provides detailed error information with suggestions and examples
 */

export interface ApiError {
  code: string;
  message: string;
  errorType?: string;
  details?: any;
  help?: string;
  suggestions?: string[];
  example?: any;
}

type ErrorType = 
  | 'PARAMETER_MISSING_TYPE'
  | 'PARAMETER_INVALID_FORMAT'
  | 'RATE_LIMITED'
  | 'ENTITY_TYPE_UNKNOWN'
  | 'UPDATE_NOT_APPLIED'
  | 'TRIGGER_INVALID_TYPE'
  | 'TRIGGER_CONDITION_FORMAT'
  | 'CONTAINER_TYPE_MISMATCH'
  | 'SERVER_ONLY_FEATURE'
  | 'WORKSPACE_STATE_INVALID'
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_CONTEXT_MISMATCH'
  | 'TEMPLATE_PERMISSION_DENIED'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_NOT_FOUND'
  | 'FILTER_FORMAT_DEPRECATED'
  | 'UNKNOWN';

export function handleApiError(
  error: any,
  operation: string,
  params?: any
): ApiError {
  console.error(`Error in ${operation}:`, error);

  if (error.response) {
    const apiError = error.response.data?.error || error.response.data;
    const errorType = detectErrorType(apiError, operation);
    
    return {
      code: apiError.code || 'UNKNOWN',
      message: apiError.message || 'Unknown error',
      errorType,
      details: apiError,
      help: generateHelp(errorType, operation),
      suggestions: generateSuggestions(errorType, operation, apiError),
      example: generateExample(errorType, params),
    };
  }

  return {
    code: 'NETWORK_ERROR',
    message: error.message || 'Network error occurred',
    errorType: 'UNKNOWN',
    help: 'Check your internet connection and try again',
    suggestions: ['Verify network connectivity', 'Check if GTM API is accessible', 'Try again later'],
  };
}

function detectErrorType(apiError: any, operation: string): ErrorType {
  const message = apiError.message?.toLowerCase() || '';
  const reason = apiError.status || apiError.reason || '';

  if (apiError.code === 429 || message.includes('resource exhausted') || message.includes('ratelimit')) {
    return 'RATE_LIMITED';
  }

  if (message.includes('unknown entity type') || message.includes('template public id')) {
    return 'ENTITY_TYPE_UNKNOWN';
  }

  if (message.includes('not applied') || message.includes('update_not_applied')) {
    return 'UPDATE_NOT_APPLIED';
  }

  if (operation.includes('importTemplateFromGallery')) {
    if (apiError.code === 404 || message.includes('not found') || reason === 'notFound') {
      return 'TEMPLATE_NOT_FOUND';
    }
    if (message.includes('context') || message.includes('container context') || message.includes('unsupported in this container')) {
      return 'TEMPLATE_CONTEXT_MISMATCH';
    }
    if (apiError.code === 403 || message.includes('permission') || message.includes('denied') || reason === 'permissionDenied') {
      return 'TEMPLATE_PERMISSION_DENIED';
    }
    if (message.includes('workspace') && (message.includes('state') || message.includes('submitted') || message.includes('conflict'))) {
      return 'WORKSPACE_STATE_INVALID';
    }
  }
  
  if (message.includes('type') && message.includes('invalid')) {
    return 'PARAMETER_MISSING_TYPE';
  }
  
  if (message.includes('parameter') && (message.includes('invalid') || message.includes('required'))) {
    return 'PARAMETER_INVALID_FORMAT';
  }
  
  if (message.includes('trigger type') || message.includes('trigger.type') || operation.includes('trigger')) {
    if (message.includes('invalid') || message.includes('unknown')) {
      return 'TRIGGER_INVALID_TYPE';
    }
  }
  
  if (message.includes('filter') && message.includes('invalid')) {
    return 'TRIGGER_CONDITION_FORMAT';
  }
  
  if (message.includes('permission') || message.includes('forbidden') || message.includes('denied')) {
    return 'PERMISSION_DENIED';
  }
  
  if (message.includes('not found')) {
    return 'RESOURCE_NOT_FOUND';
  }
  
  if (operation.includes('client') || operation.includes('transformation')) {
    if (message.includes('invalid') || message.includes('not available')) {
      return 'SERVER_ONLY_FEATURE';
    }
  }
  
  if (message.includes('server') || message.includes('container type')) {
    return 'CONTAINER_TYPE_MISMATCH';
  }
  
  return 'UNKNOWN';
}

function generateHelp(errorType: ErrorType, operation: string): string {
  const helpTexts: Record<ErrorType, string> = {
    PARAMETER_MISSING_TYPE: 'Each parameter must include a "type" field. Valid types: template, integer, boolean, list, map, triggerReference, tagReference.',
    PARAMETER_INVALID_FORMAT: 'Check the parameter format for this operation. All parameters need key, type, and value fields.',
    RATE_LIMITED: 'The GTM API is rate-limiting this request (HTTP 429). Wait and retry with fewer/serialized requests.',
    ENTITY_TYPE_UNKNOWN: 'The requested GTM type/template public ID is not recognized in this workspace context.',
    UPDATE_NOT_APPLIED: 'The update call completed, but the requested field change was not persisted. Verify supported fields for this entity type.',
    TRIGGER_INVALID_TYPE: 'The trigger type is not supported by this container. Web and Server containers support different trigger types.',
    TRIGGER_CONDITION_FORMAT: 'Conditions should use "parameter" array with arg0/arg1 keys (API v2 format).',
    CONTAINER_TYPE_MISMATCH: 'This operation is only supported in specific container types. Check if you\'re using the right container type.',
    SERVER_ONLY_FEATURE: 'This feature (clients/transformations) is only available in Server-Side GTM containers.',
    WORKSPACE_STATE_INVALID: 'Workspace is not in a valid state for this write/import operation. Sync or use a fresh workspace.',
    TEMPLATE_NOT_FOUND: 'Template repository/SHA could not be resolved by GTM gallery import.',
    TEMPLATE_CONTEXT_MISMATCH: 'Template exists but is not compatible with this container context (WEB vs SERVER).',
    TEMPLATE_PERMISSION_DENIED: 'Template import denied by GTM permissions or gallery access restrictions.',
    PERMISSION_DENIED: 'Your account lacks permission for this operation. Contact your GTM administrator.',
    RESOURCE_NOT_FOUND: 'The specified resource was not found. Check the path and ensure the resource exists.',
    FILTER_FORMAT_DEPRECATED: 'The filter format using direct arg1/arg2 is deprecated. Use parameter array with arg0/arg1.',
    UNKNOWN: 'An unexpected error occurred. Check the error details for more information.',
  };
  
  return helpTexts[errorType];
}

function generateSuggestions(errorType: ErrorType, operation: string, apiError: any): string[] {
  const suggestions: Record<ErrorType, string[]> = {
    PARAMETER_MISSING_TYPE: [
      'Add "type": "template" to each parameter object',
      'Example: { "key": "html", "type": "template", "value": "<script>...</script>" }',
      'For lists, use "type": "list" and provide "list" array instead of "value"',
      'Valid types: template, integer, boolean, list, map, triggerReference, tagReference',
    ],
    PARAMETER_INVALID_FORMAT: [
      'Check if all required fields are present (key, type, value)',
      'Verify the parameter structure matches the expected format',
      'Use gtm_get_tag_parameters or gtm_get_variable_parameters for reference',
    ],
    RATE_LIMITED: [
      'Wait 30-120 seconds and retry',
      'Avoid parallel tool calls; run requests sequentially',
      'If this persists, you may be hitting per-minute or per-project quota limits',
      'Check whether other processes are also calling the GTM API with the same OAuth client',
    ],
    ENTITY_TYPE_UNKNOWN: [
      'Run a validate_* tool first to resolve available type hints',
      'Use templateReference + registry for deterministic type resolution',
      'Import and verify the template before create',
    ],
    UPDATE_NOT_APPLIED: [
      'Read entity after update and compare target fields',
      'Verify the field is supported for this GTM type',
      'Prefer gtag_config for server URL transport updates',
    ],
    TRIGGER_INVALID_TYPE: [
      'Web containers support: pageview, click, formSubmission, customEvent, timer, scrollDepth, etc.',
      'Server containers support: always, customEvent, triggerGroup',
      'Use gtm_get_container_info to check supported trigger types',
      'Trigger types should be lowercase (API v2 format)',
    ],
    TRIGGER_CONDITION_FORMAT: [
      'Use parameter array with key/type/value objects',
      'Keys are arg0 and arg1 (not arg1 and arg2)',
      'Example: { "type": "contains", "parameter": [{ "key": "arg0", "type": "template", "value": "{{Page URL}}" }, { "key": "arg1", "type": "template", "value": "/checkout" }] }',
    ],
    CONTAINER_TYPE_MISMATCH: [
      'Use gtm_get_container_info to verify container capabilities',
      'Clients and Transformations are only available in Server containers',
      'Web containers support tags, triggers, variables, and folders',
      'Server containers have different trigger types (always, customEvent)',
    ],
    SERVER_ONLY_FEATURE: [
      'This feature requires a Server-Side GTM container',
      'Use gtm_get_container_info to check your container type',
      'Clients receive and process incoming requests in Server-Side GTM',
      'Transformations modify data before tags fire in Server-Side GTM',
    ],
    WORKSPACE_STATE_INVALID: [
      'Run gtm_get_workspace_status and resolve conflicts',
      'Retry in a fresh workspace',
      'Avoid writes in submitted/locked workspace state',
    ],
    TEMPLATE_NOT_FOUND: [
      'Verify owner/repository/version values',
      'Confirm template exists in GTM Gallery',
      'Try import without version pin first',
    ],
    TEMPLATE_CONTEXT_MISMATCH: [
      'Import template into matching container context (WEB or SERVER)',
      'Check template registry containerContext',
      'Use gtm_get_container_info before import',
    ],
    TEMPLATE_PERMISSION_DENIED: [
      'Ensure account has template import permissions',
      'Retry with acknowledgePermissions where supported',
      'Use another template or owner if repository is restricted',
    ],
    PERMISSION_DENIED: [
      'Verify your account has the required permissions',
      'Contact your GTM account administrator',
      'Check if you need to re-authenticate with additional scopes',
    ],
    RESOURCE_NOT_FOUND: [
      'Verify the resource path is correct',
      'Check if the workspace/container exists',
      'Ensure you have access to the resource',
      'Path format: accounts/{id}/containers/{id}/workspaces/{id}',
    ],
    FILTER_FORMAT_DEPRECATED: [
      'Convert direct arg1/arg2 to parameter array format',
      'Replace arg1 with arg0 in parameter key',
      'Replace arg2 with arg1 in parameter key',
      'Example: { "type": "equals", "parameter": [{ "key": "arg0", ... }, { "key": "arg1", ... }] }',
    ],
    UNKNOWN: [
      'Check the error details for specific information',
      'Try the operation with validated parameters',
      'Use helper tools like gtm_validate_trigger_config',
    ],
  };
  
  return suggestions[errorType];
}

function generateExample(errorType: ErrorType, params: any): ApiError['example'] {
  const examples: Record<ErrorType, ApiError['example']> = {
    PARAMETER_MISSING_TYPE: {
      incorrect: { "key": "html", "value": "<script>...</script>" },
      correct: { "key": "html", "type": "template", "value": "<script>...</script>" },
      validTypes: ['template', 'integer', 'boolean', 'list', 'map', 'triggerReference', 'tagReference'],
    },
    
    PARAMETER_INVALID_FORMAT: {
      correct: [
        { "key": "measurementId", "type": "template", "value": "G-XXXXXXXXXX" },
        { "key": "eventName", "type": "template", "value": "purchase" },
      ],
      note: 'All parameters must have key, type, and value fields',
    },
    ENTITY_TYPE_UNKNOWN: {
      note: 'Use validate_* output availableTypeHints or template registry mapping before create.',
    },
    UPDATE_NOT_APPLIED: {
      note: 'Update may return success but field can be dropped for unsupported type/field combinations.',
      followUp: 'Re-read entity and compare fields.',
    },
    
    TRIGGER_INVALID_TYPE: {
      webTriggers: ['pageview', 'click', 'formSubmission', 'customEvent', 'timer', 'scrollDepth'],
      serverTriggers: ['always', 'customEvent', 'triggerGroup'],
      note: 'Trigger types should be lowercase (API v2 format)',
      checkCommand: 'gtm_get_container_info',
    },
    
    TRIGGER_CONDITION_FORMAT: {
      correct: {
        type: 'contains',
        parameter: [
          { key: 'arg0', type: 'template', value: '{{Page URL}}' },
          { key: 'arg1', type: 'template', value: '/checkout' },
        ],
      },
      note: 'Use arg0 and arg1 (not arg1 and arg2), always with parameter array',
    },
    
    CONTAINER_TYPE_MISMATCH: {
      serverOnly: ['clients', 'transformations'],
      webOnly: ['pageview trigger', 'click trigger', 'html tags'],
      checkCommand: 'gtm_get_container_info',
    },
    
    SERVER_ONLY_FEATURE: {
      serverOnlyFeatures: ['clients', 'transformations'],
      serverTriggers: ['always', 'customEvent', 'triggerGroup'],
      checkCommand: 'gtm_get_container_info',
    },
    WORKSPACE_STATE_INVALID: {
      checkCommand: 'gtm_get_workspace_status',
      note: 'Use a non-submitted editable workspace.',
    },
    TEMPLATE_NOT_FOUND: {
      example: { owner: 'stape-io', repository: 'fb-tag' },
      note: 'Repository or version pin may be invalid.',
    },
    TEMPLATE_CONTEXT_MISMATCH: {
      note: 'A SERVER template cannot be imported into WEB container (and vice versa).',
    },
    TEMPLATE_PERMISSION_DENIED: {
      note: 'GTM/Gallery access control denied this import.',
    },
    
    PERMISSION_DENIED: null,
    
    RESOURCE_NOT_FOUND: null,
    
    FILTER_FORMAT_DEPRECATED: {
      deprecated: { type: 'equals', arg1: '{{_event}}', arg2: 'purchase' },
      correct: {
        type: 'equals',
        parameter: [
          { key: 'arg0', type: 'template', value: '{{_event}}' },
          { key: 'arg1', type: 'template', value: 'purchase' },
        ],
      },
    },

    RATE_LIMITED: {
      note: 'HTTP 429 from GTM API. Wait and retry later.',
      exampleWaitSeconds: 60,
    },
    
    UNKNOWN: null,
  };
  
  return examples[errorType];
}
