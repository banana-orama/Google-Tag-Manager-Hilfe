/**
 * Error handling utilities for GTM API calls
 * Provides detailed error information with suggestions and examples
 */

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  suggestions?: string[];
  example?: any;
}

export function handleApiError(
  error: any,
  operation: string,
  params?: any
): ApiError {
  console.error(`Error in ${operation}:`, error);

  if (error.response) {
    const apiError = error.response.data;
    return {
      code: apiError.error?.code || 'UNKNOWN',
      message: apiError.error?.message || 'Unknown error',
      details: apiError.error,
      suggestions: generateSuggestions(apiError.error, operation),
      example: generateExample(apiError.error, params),
    };
  }

  return {
    code: 'NETWORK_ERROR',
    message: error.message || 'Network error occurred',
    details: error,
    suggestions: ['Check your internet connection', 'Try again later'],
  };
}

function generateSuggestions(error: any, operation: string): string[] {
  const suggestions: string[] = [];

  if (error.message?.includes('Parameter \'type\' is invalid')) {
    suggestions.push(
      'Invalid trigger/variable type',
      'Check valid types for your container type',
      'See documentation for type examples'
    );
  }

  if (error.message?.includes('Parameter \'filter\' is invalid')) {
    suggestions.push(
      'Filter must be an array of Condition objects',
      'Each Condition needs: type, arg1, arg2',
      'Example: [{ "type": "contains", "arg1": "{{Page URL}}", "arg2": "/test" }]'
    );
  }

  if (operation.includes('CUSTOM_EVENT') && error.message?.includes('required')) {
    suggestions.push(
      'CUSTOM_EVENT triggers require customEventFilter parameter',
      'customEventFilter must contain at least one condition'
    );
  }

  return suggestions;
}

function generateExample(error: any, params: any): any {
  if (error.message?.includes('Parameter \'filter\' is invalid')) {
    return {
      correctFormat: {
        filter: [
          {
            type: 'contains',
            arg1: '{{Page URL}}',
            arg2: '/checkout'
          }
        ]
      },
      explanation: 'Filter must be an array of Condition objects with type, arg1, and arg2'
    };
  }

  if (error.message?.includes('Parameter \'type\' is invalid')) {
    return {
      validWebTriggerTypes: [
        'PAGEVIEW', 'CLICK', 'FORM_SUBMISSION', 'CUSTOM_EVENT',
        'TIMER', 'SCROLL_DEPTH', 'ELEMENT_VISIBILITY'
      ],
      validServerTriggerTypes: ['always', 'customEvent'],
      note: 'Server-side containers have different trigger types'
    };
  }

  return null;
}
