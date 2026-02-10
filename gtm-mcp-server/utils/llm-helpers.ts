/**
 * LLM Helper Functions
 * Provides templates and validation helpers for LLM interactions
 */

import { ApiError } from './error-handler.js';
import { WEB_TRIGGER_TYPES, SERVER_TRIGGER_TYPES } from './container-validator.js';

export interface TriggerTemplate {
  type: string;
  name: string;
  filter?: any[];
  customEventFilter?: any[];
  autoEventFilter?: any[];
  description?: string;
  containerType?: 'web' | 'server' | 'both';
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[];
  example?: any;
}

// Helper to create condition with correct API v2 format (arg0/arg1 with parameter array)
function createCondition(type: string, arg0: string, arg1: string, ignoreCase?: boolean): any {
  const condition: any = {
    type,
    parameter: [
      { key: 'arg0', type: 'template', value: arg0 },
      { key: 'arg1', type: 'template', value: arg1 },
    ],
  };
  if (ignoreCase !== undefined) {
    condition.parameter.push({ key: 'ignore_case', type: 'boolean', value: ignoreCase.toString() });
  }
  return condition;
}

// Trigger templates with correct API v2 format
const triggerTemplates: Record<string, TriggerTemplate> = {
  PAGEVIEW: {
    type: 'pageview',
    name: 'All Pages',
    filter: [],
    description: 'Fires on all page views (no filter = all pages)',
    containerType: 'web',
  },
  PAGEVIEW_FILTERED: {
    type: 'pageview',
    name: 'Checkout Pages Only',
    filter: [createCondition('contains', '{{Page URL}}', '/checkout')],
    description: 'Fires only on pages containing /checkout in the URL',
    containerType: 'web',
  },
  CLICK_DOWNLOAD: {
    type: 'click',
    name: 'Download Link Clicks',
    filter: [createCondition('contains', '{{Click URL}}', '/downloads/')],
    description: 'Fires when clicking elements with /downloads/ in the URL',
    containerType: 'web',
  },
  CUSTOM_EVENT_PURCHASE: {
    type: 'customEvent',
    name: 'Purchase Event',
    customEventFilter: [createCondition('equals', '{{Event}}', 'purchase')],
    description: 'Fires when a custom event named "purchase" is pushed to the data layer',
    containerType: 'both',
  },
  CUSTOM_EVENT_GENERIC: {
    type: 'customEvent',
    name: 'Custom Event',
    customEventFilter: [createCondition('equals', '{{Event}}', 'my_event')],
    description: 'Fires when dataLayer.push({ event: "my_event" }) is called. Change "my_event" to your event name.',
    containerType: 'both',
  },
  FORM_SUBMISSION_CONTACT: {
    type: 'formSubmission',
    name: 'Contact Form Submit',
    filter: [createCondition('contains', '{{Form ID}}', 'contact-form')],
    description: 'Fires when the contact form is submitted',
    containerType: 'web',
  },
  LINK_CLICK_EXTERNAL: {
    type: 'linkClick',
    name: 'External Link Clicks',
    filter: [createCondition('matchRegex', '{{Click URL}}', '^(https?://|//)((?!example\\.com).)*$')],
    description: 'Fires when clicking links to external domains. Replace example.com with your domain.',
    containerType: 'web',
  },
  TIMER_30S: {
    type: 'timer',
    name: '30 Seconds on Page',
    filter: [],
    description: 'Fires after 30 seconds on the page (configure interval in GTM UI)',
    containerType: 'web',
  },
  SCROLL_DEPTH_50: {
    type: 'scrollDepth',
    name: 'Scroll to 50%',
    filter: [],
    description: 'Fires when user scrolls to 50% of the page (configure thresholds in GTM UI)',
    containerType: 'web',
  },
  ELEMENT_VISIBILITY: {
    type: 'elementVisibility',
    name: 'Element Visible',
    filter: [],
    description: 'Fires when a specific element becomes visible (configure selector in GTM UI)',
    containerType: 'web',
  },
  SERVER_ALWAYS: {
    type: 'always',
    name: 'All Server Events',
    description: 'Fires on all incoming server events (no filter needed)',
    containerType: 'server',
  },
  SERVER_CUSTOM: {
    type: 'customEvent',
    name: 'Custom Server Event',
    customEventFilter: [createCondition('equals', '{{Event}}', 'my_server_event')],
    description: 'Fires when specific server event name matches. Change "my_server_event" to your event.',
    containerType: 'server',
  },
};

export function getTriggerTemplate(templateType: string): TriggerTemplate {
  const templateKey = templateType.toUpperCase().replace(/-/g, '_');
  
  if (triggerTemplates[templateKey]) {
    return JSON.parse(JSON.stringify(triggerTemplates[templateKey]));
  }

  // Default to pageview
  return JSON.parse(JSON.stringify(triggerTemplates['PAGEVIEW']));
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

  // Normalize type to lowercase
  const normalizedType = config.type?.toLowerCase();

  // Check container type compatibility
  if (containerType === 'server') {
    if (!SERVER_TRIGGER_TYPES.includes(normalizedType)) {
      errors.push(
        `Type "${config.type}" not supported in server containers. Use: ${SERVER_TRIGGER_TYPES.join(', ')}`
      );
      suggestions.push('Server-side containers only support: always, customEvent, triggerGroup');
      suggestions.push('Use gtm_get_container_info to check supported trigger types');
    }
  } else if (containerType === 'web') {
    if (SERVER_TRIGGER_TYPES.includes(normalizedType) && normalizedType !== 'customEvent') {
      errors.push(`Type "${config.type}" is for server containers only. Use pageview instead.`);
      suggestions.push('For web containers, use pageview to fire on all pages');
    }
    
    if (normalizedType === 'customEvent') {
      if (!config.customEventFilter) {
        warnings.push('CUSTOM_EVENT triggers typically need customEventFilter');
        suggestions.push('Add customEventFilter to specify which events to match');
        suggestions.push('Example: customEventFilter: [{ type: "equals", parameter: [{ key: "arg0", value: "{{Event}}" }, { key: "arg1", value: "my_event" }] }]');
      }
    }
  }

  // Validate filter format (check for deprecated arg1/arg2 format)
  const validateFilterFormat = (filters: any[], filterName: string) => {
    if (!Array.isArray(filters)) return;
    
    filters.forEach((cond: any, index: number) => {
      // Check for deprecated direct arg1/arg2 format
      if (cond.arg1 !== undefined && cond.arg2 !== undefined && !cond.parameter) {
        errors.push(`${filterName}[${index}] uses deprecated format with direct arg1/arg2`);
        suggestions.push('Use parameter array with arg0/arg1 keys (API v2 format)');
      }
      
      // Check for correct parameter format
      if (cond.parameter && Array.isArray(cond.parameter)) {
        const hasArg0 = cond.parameter.some((p: any) => p.key === 'arg0');
        const hasArg1 = cond.parameter.some((p: any) => p.key === 'arg1');
        
        if (!hasArg0 || !hasArg1) {
          warnings.push(`${filterName}[${index}] may be missing arg0 or arg1 in parameter array`);
          suggestions.push('Ensure parameter array has keys: arg0 (left operand), arg1 (right operand)');
        }
        
        // Check for type field in parameters
        cond.parameter.forEach((p: any, pIndex: number) => {
          if (!p.type) {
            warnings.push(`${filterName}[${index}].parameter[${pIndex}] missing "type" field`);
            suggestions.push('Add type: "template" to parameter objects');
          }
        });
      }
    });
  };

  if (config.filter) {
    if (!Array.isArray(config.filter)) {
      errors.push('filter must be an array of Condition objects');
    } else {
      validateFilterFormat(config.filter, 'filter');
    }
  }

  if (config.customEventFilter) {
    if (!Array.isArray(config.customEventFilter)) {
      errors.push('customEventFilter must be an array of Condition objects');
    } else {
      validateFilterFormat(config.customEventFilter, 'customEventFilter');
    }
  }

  if (config.autoEventFilter) {
    if (!Array.isArray(config.autoEventFilter)) {
      errors.push('autoEventFilter must be an array of Condition objects');
    } else {
      validateFilterFormat(config.autoEventFilter, 'autoEventFilter');
    }
  }

  // Valid condition types
  const validConditionTypes = [
    'equals', 'contains', 'matchRegex', 'startsWith', 'endsWith',
    'greater', 'less', 'greaterOrEquals', 'lessOrEquals',
    'cssSelector', 'urlMatches'
  ];

  const checkConditionTypes = (conditions: any[], filterName: string) => {
    if (!Array.isArray(conditions)) return;
    conditions.forEach((cond: any, index: number) => {
      if (cond.type && !validConditionTypes.includes(cond.type)) {
        warnings.push(`Unknown condition type "${cond.type}" in ${filterName}[${index}]`);
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
      validTemplate: getTriggerTemplate(config.type || 'pageview'),
      conditionFormat: {
        correct: {
          type: 'contains',
          parameter: [
            { key: 'arg0', type: 'template', value: '{{Page URL}}' },
            { key: 'arg1', type: 'template', value: '/checkout' },
          ],
        },
        note: 'Use arg0 and arg1 with parameter array (API v2 format)',
      },
    },
  };
}

export function getTriggerTypeSuggestions(containerType: string): {
  web: string[];
  server: string[];
  amp: string[];
} {
  return {
    web: WEB_TRIGGER_TYPES.slice(0, 15),
    server: SERVER_TRIGGER_TYPES,
    amp: ['ampClick', 'ampTimer', 'ampScroll', 'ampVisibility'],
  };
}

export function formatConditionExample(conditionType: string): any {
  const examples: Record<string, any> = {
    equals: {
      type: 'equals',
      parameter: [
        { key: 'arg0', type: 'template', value: '{{Page URL}}' },
        { key: 'arg1', type: 'template', value: 'https://example.com/page' },
      ],
      note: 'Exact match',
    },
    contains: {
      type: 'contains',
      parameter: [
        { key: 'arg0', type: 'template', value: '{{Page URL}}' },
        { key: 'arg1', type: 'template', value: '/checkout' },
      ],
      note: 'Partial match (contains string)',
    },
    startsWith: {
      type: 'startsWith',
      parameter: [
        { key: 'arg0', type: 'template', value: '{{Page Path}}' },
        { key: 'arg1', type: 'template', value: '/blog/' },
      ],
      note: 'Starts with string',
    },
    endsWith: {
      type: 'endsWith',
      parameter: [
        { key: 'arg0', type: 'template', value: '{{Click URL}}' },
        { key: 'arg1', type: 'template', value: '.pdf' },
      ],
      note: 'Ends with string',
    },
    matchRegex: {
      type: 'matchRegex',
      parameter: [
        { key: 'arg0', type: 'template', value: '{{Page URL}}' },
        { key: 'arg1', type: 'template', value: '^https://example\\.com/.*' },
      ],
      note: 'Regular expression match',
    },
    greater: {
      type: 'greater',
      parameter: [
        { key: 'arg0', type: 'template', value: '{{Scroll Depth Threshold}}' },
        { key: 'arg1', type: 'template', value: '50' },
      ],
      note: 'Numeric greater than',
    },
    less: {
      type: 'less',
      parameter: [
        { key: 'arg0', type: 'template', value: '{{Event Count}}' },
        { key: 'arg1', type: 'template', value: '10' },
      ],
      note: 'Numeric less than',
    },
  };

  return examples[conditionType] || {
    type: 'equals',
    parameter: [
      { key: 'arg0', type: 'template', value: '{{Page URL}}' },
      { key: 'arg1', type: 'template', value: 'https://example.com' },
    ],
    note: 'Default example',
  };
}

// Variable parameter reference
export interface VariableParameterInfo {
  key: string;
  type: 'template' | 'boolean' | 'integer';
  required: boolean;
  description: string;
  example?: string;
}

export function getVariableParameters(variableType: string): {
  type: string;
  parameters: {
    required: VariableParameterInfo[];
    optional: VariableParameterInfo[];
  };
  example: any;
} {
  const varParams: Record<string, any> = {
    k: { // Constant
      type: 'k',
      parameters: {
        required: [
          { key: 'value', type: 'template', required: true, description: 'Constant value', example: 'G-XXXXXXXXXX' },
        ],
        optional: [],
      },
      example: {
        name: 'GA4 Measurement ID',
        type: 'k',
        parameter: [{ key: 'value', type: 'template', value: 'G-XXXXXXXXXX' }],
      },
    },
    c: { // Cookie
      type: 'c',
      parameters: {
        required: [
          { key: 'cookieName', type: 'template', required: true, description: 'Cookie name', example: '_ga' },
        ],
        optional: [
          { key: 'urlDecoder', type: 'boolean', required: false, description: 'URL decode value', example: 'false' },
        ],
      },
      example: {
        name: 'GA Client ID',
        type: 'c',
        parameter: [{ key: 'cookieName', type: 'template', value: '_ga' }],
      },
    },
    v: { // URL Variable
      type: 'v',
      parameters: {
        required: [
          { key: 'urlComponent', type: 'template', required: true, description: 'URL component (query, path, fragment, host, port, url)', example: 'query' },
        ],
        optional: [
          { key: 'queryKey', type: 'template', required: false, description: 'Query parameter key', example: 'utm_source' },
          { key: 'componentIndex', type: 'integer', required: false, description: 'Index for array-based components' },
        ],
      },
      example: {
        name: 'UTM Source',
        type: 'v',
        parameter: [
          { key: 'urlComponent', type: 'template', value: 'query' },
          { key: 'queryKey', type: 'template', value: 'utm_source' },
        ],
      },
    },
    f: { // Data Layer
      type: 'f',
      parameters: {
        required: [
          { key: 'dataLayerName', type: 'template', required: true, description: 'Data Layer variable name', example: 'ecommerce.purchase.value' },
        ],
        optional: [
          { key: 'version', type: 'integer', required: false, description: 'Data Layer version', example: '2' },
        ],
      },
      example: {
        name: 'E-Commerce Value',
        type: 'f',
        parameter: [{ key: 'dataLayerName', type: 'template', value: 'ecommerce.purchase.value' }],
      },
    },
    jsm: { // JavaScript
      type: 'jsm',
      parameters: {
        required: [
          { key: 'javascript', type: 'template', required: true, description: 'JavaScript function body', example: 'function() { return Date.now(); }' },
        ],
        optional: [],
      },
      example: {
        name: 'Current Timestamp',
        type: 'jsm',
        parameter: [{ key: 'javascript', type: 'template', value: 'function() { return Date.now(); }' }],
      },
    },
    aev: { // Auto-Event Variable
      type: 'aev',
      parameters: {
        required: [
          { key: 'varType', type: 'template', required: true, description: 'Variable type (ELEMENT, TEXT, URL, etc.)', example: 'TEXT' },
        ],
        optional: [],
      },
      example: {
        name: 'Click Text',
        type: 'aev',
        parameter: [{ key: 'varType', type: 'template', value: 'TEXT' }],
      },
    },
    r: { // Random Number
      type: 'r',
      parameters: {
        required: [],
        optional: [
          { key: 'min', type: 'integer', required: false, description: 'Minimum value', example: '0' },
          { key: 'max', type: 'integer', required: false, description: 'Maximum value', example: '100' },
        ],
      },
      example: {
        name: 'Random Number',
        type: 'r',
        parameter: [],
      },
    },
    smm: { // Storage Macro
      type: 'smm',
      parameters: {
        required: [
          { key: 'key', type: 'template', required: true, description: 'Storage key', example: 'user_id' },
        ],
        optional: [
          { key: 'storageType', type: 'template', required: false, description: 'Storage type (localStorage, sessionStorage)', example: 'localStorage' },
        ],
      },
      example: {
        name: 'Local Storage User ID',
        type: 'smm',
        parameter: [
          { key: 'key', type: 'template', value: 'user_id' },
          { key: 'storageType', type: 'template', value: 'localStorage' },
        ],
      },
    },
  };

  return varParams[variableType] || {
    type: variableType,
    parameters: { required: [], optional: [] },
    example: {
      name: 'My Variable',
      type: variableType,
      parameter: [],
    },
    note: 'Unknown variable type - check GTM documentation for parameters',
  };
}
