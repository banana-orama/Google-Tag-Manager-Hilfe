/**
 * LLM Helper Functions
 * Provides templates and validation helpers for LLM interactions
 */

import { ApiError } from './error-handler.js';

export interface TriggerTemplate {
  type: string;
  name: string;
  filter?: any[];
  customEventFilter?: any[];
  autoEventFilter?: any[];
  description?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[];
  example?: any;
}

const triggerTemplates: Record<string, TriggerTemplate> = {
  PAGEVIEW: {
    type: 'PAGEVIEW',
    name: 'All Pages',
    filter: [],
    description: 'Fires on all page views (no filter = all pages)',
  },
  PAGEVIEW_FILTERED: {
    type: 'PAGEVIEW',
    name: 'Checkout Pages Only',
    filter: [
      {
        type: 'contains',
        arg1: '{{Page Path}}',
        arg2: '/checkout'
      }
    ],
    description: 'Fires only on pages containing /checkout in the path',
  },
  CLICK_DOWNLOAD: {
    type: 'CLICK',
    name: 'Download Link Clicks',
    filter: [
      {
        type: 'contains',
        arg1: '{{Click URL}}',
        arg2: '/downloads/'
      }
    ],
    description: 'Fires when clicking links pointing to /downloads/',
  },
  CUSTOM_EVENT_PURCHASE: {
    type: 'CUSTOM_EVENT',
    name: 'Purchase Event',
    customEventFilter: [
      {
        type: 'equals',
        arg1: '{{Event}}',
        arg2: 'purchase'
      }
    ],
    description: 'Fires when a custom event named "purchase" is pushed to the data layer',
  },
  FORM_SUBMISSION_CONTACT: {
    type: 'FORM_SUBMISSION',
    name: 'Contact Form Submit',
    filter: [
      {
        type: 'contains',
        arg1: '{{Form ID}}',
        arg2: 'contact-form'
      }
    ],
    description: 'Fires when the contact form is submitted',
  },
  LINK_CLICK_EXTERNAL: {
    type: 'LINK_CLICK',
    name: 'External Link Clicks',
    filter: [
      {
        type: 'matchRegex',
        arg1: '{{Click URL}}',
        arg2: '^(https?://|//)((?!example\\.com).)*$',
        note: 'Replace example\\.com with your domain'
      }
    ],
    description: 'Fires when clicking links to external domains',
  },
  TIMER_30S: {
    type: 'TIMER',
    name: '30 Seconds on Page',
    filter: [],
    autoEventFilter: [
      {
        type: 'gte',
        arg1: '{{Event}}',
        arg2: 'gtm.timer'
      }
    ],
    description: 'Fires after 30 seconds on the page',
  },
  SCROLL_DEPTH_50: {
    type: 'SCROLL_DEPTH',
    name: 'Scroll to 50%',
    filter: [
      {
        type: 'gte',
        arg1: '{{Scroll Depth Threshold}}',
        arg2: 50
      }
    ],
    description: 'Fires when user scrolls to 50% of the page',
  },
  SERVER_ALWAYS: {
    type: 'always',
    name: 'All Server Events',
    description: 'Fires on all incoming server events (no filter needed)',
  },
  SERVER_CUSTOM: {
    type: 'customEvent',
    name: 'Custom Server Event',
    customEventFilter: [
      {
        type: 'equals',
        arg1: '{{Event}}',
        arg2: 'my_event'
      }
    ],
    description: 'Fires when custom event name matches',
  },
};

export function getTriggerTemplate(templateType: string): TriggerTemplate {
  const templateKey = templateType.toUpperCase().replace(/-/g, '_');
  
  if (triggerTemplates[templateKey]) {
    return JSON.parse(JSON.stringify(triggerTemplates[templateKey]));
  }

  return getTriggerTemplate('PAGEVIEW');
}

export function getAvailableTriggerTemplates(): string[] {
  return Object.keys(triggerTemplates).map(key => {
    return key.toLowerCase().replace(/_/g, '-');
  });
}

export function validateTriggerConfigFull(
  config: any,
  containerType: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (!config.type) {
    errors.push('Trigger type is required');
  }

  if (!config.name || config.name.trim() === '') {
    errors.push('Trigger name is required');
  }

  if (containerType === 'server') {
    const serverTypes = ['always', 'customEvent', 'triggerGroup'];
    if (config.type && !serverTypes.includes(config.type)) {
      errors.push(
        `Type "${config.type}" not supported in server containers. Use: ${serverTypes.join(', ')}`
      );
      suggestions.push('Server-side containers only support: always, customEvent, triggerGroup');
      suggestions.push('For web containers, consider using PAGEVIEW, CLICK, FORM_SUBMISSION, etc.');
    }
  } else {
    if (config.type === 'always') {
      errors.push('"always" type is for server containers only. Use PAGEVIEW instead');
      suggestions.push('For web containers, use PAGEVIEW to fire on all pages');
    }
    if (config.type === 'customEvent') {
      if (!config.customEventFilter) {
        errors.push('CUSTOM_EVENT triggers require customEventFilter parameter');
        suggestions.push('Add customEventFilter with a Condition object');
        suggestions.push('Example: [{ "type": "equals", "arg1": "{{Event}}", "arg2": "my_event" }]');
      } else {
        if (!Array.isArray(config.customEventFilter)) {
          errors.push('customEventFilter must be an array of Condition objects');
        } else {
          config.customEventFilter.forEach((cond: any, index: number) => {
            if (!cond.type || !cond.arg1 || cond.arg2 === undefined) {
              errors.push(`customEventFilter condition at index ${index} is missing required fields (type, arg1, arg2)`);
            }
          });
        }
      }
    }
  }

  if (config.filter) {
    if (!Array.isArray(config.filter)) {
      errors.push('filter must be an array of Condition objects');
      suggestions.push('Filter format: [{ "type": "contains", "arg1": "{{Page URL}}", "arg2": "/checkout" }]');
    } else {
      config.filter.forEach((cond: any, index: number) => {
        if (!cond.type || !cond.arg1 || cond.arg2 === undefined) {
          errors.push(`Filter condition at index ${index} is missing required fields (type, arg1, arg2)`);
        }
      });
    }
  }

  if (config.autoEventFilter) {
    if (!Array.isArray(config.autoEventFilter)) {
      errors.push('autoEventFilter must be an array of Condition objects');
    } else {
      config.autoEventFilter.forEach((cond: any, index: number) => {
        if (!cond.type || !cond.arg1 || cond.arg2 === undefined) {
          errors.push(`autoEventFilter condition at index ${index} is missing required fields (type, arg1, arg2)`);
        }
      });
    }
  }

  const validConditionTypes = [
    'equals', 'contains', 'matchRegex', 'startsWith', 'endsWith',
    'greater', 'less', 'greaterOrEquals', 'lessOrEquals',
    'cssSelector', 'urlMatches', 'boolean'
  ];

  const checkConditionTypes = (conditions: any[], filterName: string) => {
    if (!Array.isArray(conditions)) return;
    conditions.forEach((cond: any, index: number) => {
      if (cond.type && !validConditionTypes.includes(cond.type)) {
        warnings.push(`Unknown condition type "${cond.type}" in ${filterName} at index ${index}`);
        suggestions.push(`Valid condition types: ${validConditionTypes.join(', ')}`);
      }
    });
  };

  checkConditionTypes(config.filter, 'filter');
  checkConditionTypes(config.customEventFilter, 'customEventFilter');
  checkConditionTypes(config.autoEventFilter, 'autoEventFilter');

  if (errors.length === 0 && warnings.length === 0 && suggestions.length === 0) {
    suggestions.push('Configuration looks good! You can create the trigger now.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    example: {
      validTemplate: getTriggerTemplate(config.type || 'PAGEVIEW'),
      note: 'Use this as a reference for your configuration',
    },
  };
}

export function getTriggerTypeSuggestions(containerType: string): {
  web: string[];
  server: string[];
  amp: string[];
} {
  return {
    web: [
      'PAGEVIEW', 'DOM_READY', 'WINDOW_LOADED',
      'CLICK', 'LINK_CLICK', 'FORM_SUBMISSION',
      'CUSTOM_EVENT', 'TIMER', 'SCROLL_DEPTH',
      'ELEMENT_VISIBILITY', 'JS_ERROR', 'HISTORY_CHANGE',
      'YOU_TUBE_VIDEO',
    ],
    server: ['always', 'customEvent', 'triggerGroup'],
    amp: ['AMP_CLICK', 'AMP_TIMER', 'AMP_SCROLL', 'AMP_VISIBILITY'],
  };
}

export function formatConditionExample(conditionType: string): any {
  const examples: Record<string, any> = {
    equals: {
      type: 'equals',
      arg1: '{{Page URL}}',
      arg2: 'https://example.com/page',
      note: 'Exact match',
    },
    contains: {
      type: 'contains',
      arg1: '{{Page URL}}',
      arg2: '/checkout',
      note: 'Partial match (contains string)',
    },
    startsWith: {
      type: 'startsWith',
      arg1: '{{Page Path}}',
      arg2: '/blog/',
      note: 'Starts with string',
    },
    endsWith: {
      type: 'endsWith',
      arg1: '{{Click URL}}',
      arg2: '.pdf',
      note: 'Ends with string',
    },
    matchRegex: {
      type: 'matchRegex',
      arg1: '{{Page URL}}',
      arg2: '^https://example\\.com/.*',
      note: 'Regular expression match',
    },
    greater: {
      type: 'greater',
      arg1: '{{Scroll Depth Threshold}}',
      arg2: 50,
      note: 'Numeric greater than',
    },
    less: {
      type: 'less',
      arg1: '{{Event}}',
      arg2: 10,
      note: 'Numeric less than',
    },
  };

  return examples[conditionType] || {
    type: 'equals',
    arg1: '{{Page URL}}',
    arg2: 'https://example.com',
    note: 'Default example',
  };
}
