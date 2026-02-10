/**
 * Tag parameter helpers
 * Provides reference and validation for tag parameters
 */

export interface TagParameterInfo {
  key: string;
  type: 'template' | 'integer' | 'boolean' | 'list' | 'map' | 'triggerReference' | 'tagReference';
  required: boolean;
  description: string;
  example?: string;
  defaultValue?: string;
}

export interface TagTypeInfo {
  type: string;
  displayName: string;
  category: 'analytics' | 'advertising' | 'custom' | 'utility' | 'other';
  description: string;
  parameters: {
    required: TagParameterInfo[];
    optional: TagParameterInfo[];
  };
  example: any;
  containerCompatibility: ('web' | 'server')[];
  note?: string;
}

const TAG_TYPES: Record<string, TagTypeInfo> = {
  html: {
    type: 'html',
    displayName: 'Custom HTML',
    category: 'custom',
    description: 'Inject custom HTML or JavaScript code into pages',
    containerCompatibility: ['web'],
    parameters: {
      required: [
        { 
          key: 'html', 
          type: 'template', 
          required: true, 
          description: 'HTML/JavaScript code to inject',
          example: '<script>console.log("Hello");</script>'
        },
      ],
      optional: [
        { 
          key: 'supportsDocumentWrite', 
          type: 'boolean', 
          required: false, 
          description: 'Allow document.write()',
          example: 'false',
          defaultValue: 'false'
        },
        {
          key: 'useIframe',
          type: 'boolean',
          required: false,
          description: 'Render in iframe',
          example: 'false',
          defaultValue: 'false'
        },
      ],
    },
    example: {
      name: 'Custom HTML Tag',
      type: 'html',
      parameter: [
        { key: 'html', type: 'template', value: '<script>console.log("test");</script>' }
      ],
      firingTriggerId: ['1'],
    },
  },

  gaawe: {
    type: 'gaawe',
    displayName: 'GA4 Event',
    category: 'analytics',
    description: 'Send events to Google Analytics 4',
    containerCompatibility: ['web', 'server'],
    parameters: {
      required: [
        { 
          key: 'measurementId', 
          type: 'template', 
          required: true, 
          description: 'GA4 Measurement ID',
          example: 'G-XXXXXXXXXX'
        },
      ],
      optional: [
        { 
          key: 'eventName', 
          type: 'template', 
          required: false, 
          description: 'Event name to send',
          example: 'purchase',
          defaultValue: 'custom_event'
        },
        {
          key: 'eventSettingsTable',
          type: 'list',
          required: false,
          description: 'Event parameters as key-value pairs',
        },
        {
          key: 'userProperties',
          type: 'list',
          required: false,
          description: 'User properties',
        },
        {
          key: 'sendEcommerceData',
          type: 'boolean',
          required: false,
          description: 'Send ecommerce data from data layer',
          defaultValue: 'false'
        },
      ],
    },
    example: {
      name: 'GA4 - Purchase Event',
      type: 'gaawe',
      parameter: [
        { key: 'measurementId', type: 'template', value: 'G-XXXXXXXXXX' },
        { key: 'eventName', type: 'template', value: 'purchase' },
        { 
          key: 'eventSettingsTable', 
          type: 'list', 
          list: [
            { 
              type: 'map', 
              map: [
                { key: 'parameter', type: 'template', value: 'transaction_id' },
                { key: 'parameterValue', type: 'template', value: '{{Transaction ID}}' }
              ]
            },
            { 
              type: 'map', 
              map: [
                { key: 'parameter', type: 'template', value: 'value' },
                { key: 'parameterValue', type: 'template', value: '{{Purchase Value}}' }
              ]
            }
          ]
        }
      ],
      firingTriggerId: ['1'],
    },
  },

  googtag: {
    type: 'googtag',
    displayName: 'Google tag (gtag.js)',
    category: 'analytics',
    description: 'Google tag configuration for GA4, Ads, etc.',
    containerCompatibility: ['web'],
    parameters: {
      required: [
        { 
          key: 'tagId', 
          type: 'template', 
          required: true, 
          description: 'Tag ID (Measurement ID or Ads ID)',
          example: 'G-XXXXXXXXXX'
        },
      ],
      optional: [],
    },
    example: {
      name: 'Google tag - GA4',
      type: 'googtag',
      parameter: [
        { key: 'tagId', type: 'template', value: 'G-XXXXXXXXXX' }
      ],
      firingTriggerId: ['1'],
    },
  },

  awct: {
    type: 'awct',
    displayName: 'Google Ads Conversion Tracking',
    category: 'advertising',
    description: 'Track Google Ads conversions',
    containerCompatibility: ['web'],
    parameters: {
      required: [
        { 
          key: 'conversionId', 
          type: 'template', 
          required: true, 
          description: 'Google Ads Conversion ID',
          example: 'AW-XXXXXXXX'
        },
        { 
          key: 'conversionLabel', 
          type: 'template', 
          required: true, 
          description: 'Conversion label',
          example: 'abc123'
        },
      ],
      optional: [
        { 
          key: 'conversionValue', 
          type: 'template', 
          required: false, 
          description: 'Conversion value',
          example: '99.99'
        },
        { 
          key: 'currencyCode', 
          type: 'template', 
          required: false, 
          description: 'Currency code',
          example: 'USD'
        },
        { 
          key: 'orderId', 
          type: 'template', 
          required: false, 
          description: 'Order ID for deduplication',
          example: '{{Transaction ID}}'
        },
      ],
    },
    example: {
      name: 'Google Ads - Purchase Conversion',
      type: 'awct',
      parameter: [
        { key: 'conversionId', type: 'template', value: 'AW-XXXXXXXX' },
        { key: 'conversionLabel', type: 'template', value: 'abc123' },
        { key: 'conversionValue', type: 'template', value: '{{Purchase Value}}' },
        { key: 'currencyCode', type: 'template', value: 'USD' },
      ],
      firingTriggerId: ['1'],
    },
  },

  sp: {
    type: 'sp',
    displayName: 'Google Ads Remarketing',
    category: 'advertising',
    description: 'Google Ads remarketing tag',
    containerCompatibility: ['web'],
    parameters: {
      required: [
        { 
          key: 'conversionId', 
          type: 'template', 
          required: true, 
          description: 'Google Ads Conversion ID',
          example: 'AW-XXXXXXXX'
        },
      ],
      optional: [
        { 
          key: 'customParams', 
          type: 'map', 
          required: false, 
          description: 'Custom remarketing parameters'
        },
        { 
          key: 'userId', 
          type: 'template', 
          required: false, 
          description: 'User ID for user list building',
          example: '{{User ID}}'
        },
      ],
    },
    example: {
      name: 'Google Ads Remarketing',
      type: 'sp',
      parameter: [
        { key: 'conversionId', type: 'template', value: 'AW-XXXXXXXX' },
      ],
      firingTriggerId: ['1'],
    },
  },

  ua: {
    type: 'ua',
    displayName: 'Universal Analytics',
    category: 'analytics',
    description: 'Universal Analytics tracking (deprecated - use GA4 instead)',
    containerCompatibility: ['web'],
    parameters: {
      required: [
        { 
          key: 'trackingId', 
          type: 'template', 
          required: true, 
          description: 'UA Tracking ID',
          example: 'UA-XXXXXXXX-X'
        },
        { 
          key: 'type', 
          type: 'template', 
          required: true, 
          description: 'Track type (TRACK_PAGEVIEW, TRACK_EVENT, etc.)',
          example: 'TRACK_EVENT'
        },
      ],
      optional: [
        { 
          key: 'fieldsToSet', 
          type: 'list', 
          required: false, 
          description: 'Additional fields'
        },
      ],
    },
    example: {
      name: 'UA - Event',
      type: 'ua',
      parameter: [
        { key: 'trackingId', type: 'template', value: 'UA-XXXXXXXX-X' },
        { key: 'type', type: 'template', value: 'TRACK_EVENT' },
      ],
      firingTriggerId: ['1'],
    },
    note: 'Universal Analytics is deprecated. Use GA4 (gaawe) instead.',
  },

  flc: {
    type: 'flc',
    displayName: 'Floodlight Counter',
    category: 'advertising',
    description: 'Google Marketing Platform Floodlight Counter tag',
    containerCompatibility: ['web'],
    parameters: {
      required: [
        { key: 'advertiserId', type: 'template', required: true, description: 'Advertiser ID' },
        { key: 'groupTag', type: 'template', required: true, description: 'Group tag' },
        { key: 'activityTag', type: 'template', required: true, description: 'Activity tag' },
      ],
      optional: [
        { key: 'countingMethod', type: 'template', required: false, description: 'Counting method' },
        { key: 'ordinal', type: 'template', required: false, description: 'Ordinal value' },
      ],
    },
    example: {
      name: 'Floodlight Counter',
      type: 'flc',
      parameter: [
        { key: 'advertiserId', type: 'template', value: '123456' },
        { key: 'groupTag', type: 'template', value: 'group' },
        { key: 'activityTag', type: 'template', value: 'activit' },
      ],
      firingTriggerId: ['1'],
    },
  },
};

export function getTagTypeInfo(tagType: string): TagTypeInfo | null {
  return TAG_TYPES[tagType] || null;
}

export function getAllTagTypes(): { type: string; displayName: string; category: string; description: string }[] {
  return Object.values(TAG_TYPES).map(t => ({
    type: t.type,
    displayName: t.displayName,
    category: t.category,
    description: t.description,
  }));
}

export function getTagTypesByCategory(category: string): TagTypeInfo[] {
  return Object.values(TAG_TYPES).filter(t => t.category === category);
}

export function validateTagParameters(tagType: string, parameters: any[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  corrected?: any[];
} {
  const tagInfo = TAG_TYPES[tagType];
  
  if (!tagInfo) {
    return {
      valid: false,
      errors: [`Unknown tag type: ${tagType}`],
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const corrected: any[] = [];
  const processedKeys = new Set<string>();

  // Check required parameters
  for (const reqParam of tagInfo.parameters.required) {
    const found = parameters.find(p => p.key === reqParam.key);
    if (!found) {
      errors.push(`Missing required parameter: ${reqParam.key}`);
    } else {
      processedKeys.add(reqParam.key);
      
      // Check for missing type field
      if (!found.type) {
        warnings.push(`Parameter "${reqParam.key}" missing type field, adding type: ${reqParam.type}`);
        corrected.push({ ...found, type: reqParam.type });
      } else {
        corrected.push(found);
      }
    }
  }

  // Check all parameters for type field and validity
  for (const param of parameters) {
    if (processedKeys.has(param.key)) continue;
    
    const isRequired = tagInfo.parameters.required.some(r => r.key === param.key);
    const isOptional = tagInfo.parameters.optional.some(o => o.key === param.key);
    
    if (!isRequired && !isOptional) {
      warnings.push(`Unknown parameter: ${param.key} for tag type ${tagType}`);
    }
    
    if (!param.type) {
      warnings.push(`Parameter "${param.key}" missing type field`);
      corrected.push({ ...param, type: 'template' });
    } else {
      corrected.push(param);
    }
    
    processedKeys.add(param.key);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    corrected: warnings.length > 0 ? corrected : undefined,
  };
}

export function getParameterTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    template: 'String value (may include {{variable}} references)',
    integer: 'Numeric value (integer)',
    boolean: 'true or false',
    list: 'Array of parameters',
    map: 'Object with key-value pairs',
    triggerReference: 'Reference to a trigger by ID',
    tagReference: 'Reference to a tag by name',
  };
  return descriptions[type] || 'Unknown type';
}
