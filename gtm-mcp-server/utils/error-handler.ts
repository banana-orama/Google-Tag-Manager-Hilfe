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
  | 'TRIGGER_INVALID_TYPE'
  | 'TRIGGER_CONDITION_FORMAT'
  | 'CONTAINER_TYPE_MISMATCH'
  | 'SERVER_ONLY_FEATURE'
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
    TRIGGER_INVALID_TYPE: 'The trigger type is not supported by this container. Web and Server containers support different trigger types.',
    TRIGGER_CONDITION_FORMAT: 'Conditions should use "parameter" array with arg0/arg1 keys (API v2 format).',
    CONTAINER_TYPE_MISMATCH: 'This operation is only supported in specific container types. Check if you\'re using the right container type.',
    SERVER_ONLY_FEATURE: 'This feature (clients/transformations) is only available in Server-Side GTM containers.',
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
    
    PERMISSION_DENIED: null,
    
    RESOURCE_NOT_FOUND: null,
    
    FILTER_FORMAT_DEPRECATED: {
      deprecated: { type: 'equals', arg1: '{{Event}}', arg2: 'purchase' },
      correct: {
        type: 'equals',
        parameter: [
          { key: 'arg0', type: 'template', value: '{{Event}}' },
          { key: 'arg1', type: 'template', value: 'purchase' },
        ],
      },
    },
    
    UNKNOWN: null,
  };
  
  return examples[errorType];
}
