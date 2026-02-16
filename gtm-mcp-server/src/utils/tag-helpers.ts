/**
 * GTM Tag Parameter Helpers
 * 
 * Utilities for creating properly structured GTM tag parameters
 * Based on: docs/TAG_PARAMETER_STRUCTURES.md
 */

/**
 * Build configSettingsTable for Google Tag (googtag)
 * Used for GA4 Configuration settings like server_container_url
 */
export function buildConfigSettingsTable(settings: Record<string, string>): any {
  return {
    key: "configSettingsTable",
    type: "list",
    list: Object.entries(settings).map(([param, value]) => ({
      type: "map",
      map: [
        { key: "parameter", type: "template", value: param },
        { key: "parameterValue", type: "template", value: value }
      ]
    }))
  };
}

/**
 * Build eventSettingsTable for GA4 Event Tag (gaawe)
 * Used for event parameters like event_id, value, currency
 */
export function buildEventSettingsTable(params: Record<string, string>): any {
  return {
    key: "eventSettingsTable",
    type: "list",
    list: Object.entries(params).map(([param, value]) => ({
      type: "map",
      map: [
        { key: "parameter", type: "template", value: param },
        { key: "parameterValue", type: "template", value: value }
      ]
    }))
  };
}

/**
 * Build userPropertiesTable for GA4 tags
 * Used for user properties in GA4 Configuration and Event tags
 */
export function buildUserPropertiesTable(properties: Record<string, string>): any {
  return {
    key: "userProperties",
    type: "list",
    list: Object.entries(properties).map(([name, value]) => ({
      type: "map",
      map: [
        { key: "name", type: "template", value: name },
        { key: "value", type: "template", value: value }
      ]
    }))
  };
}

/**
 * Helper to create GA4 Configuration Tag with server-side tracking
 * 
 * @example
 * const ga4Config = createGA4ConfigTag({
 *   measurementId: "G-XXXXXXXXXX",
 *   serverUrl: "https://data.example.com",
 *   sendPageView: false
 * });
 */
export function createGA4ConfigTag(config: {
  name?: string;
  measurementId: string;
  serverUrl?: string;
  sendPageView?: boolean;
  userId?: string;
  firingTriggerId: string[];
}): any {
  const settings: Record<string, string> = {};
  
  if (config.serverUrl) {
    settings["server_container_url"] = config.serverUrl;
  }
  
  if (config.sendPageView !== undefined) {
    settings["send_page_view"] = config.sendPageView.toString();
  }
  
  if (config.userId) {
    settings["user_id"] = config.userId;
  }
  
  const parameters: any[] = [
    { key: "tagId", type: "template", value: config.measurementId }
  ];
  
  if (Object.keys(settings).length > 0) {
    parameters.push(buildConfigSettingsTable(settings));
  }
  
  return {
    name: config.name || "GA4 Configuration",
    type: "googtag",
    parameter: parameters,
    firingTriggerId: config.firingTriggerId
  };
}

/**
 * Helper to create GA4 Event Tag with event parameters
 * 
 * @example
 * const ga4Event = createGA4EventTag({
 *   eventName: "purchase",
 *   measurementId: "G-XXXXXXXXXX",
 *   eventParams: {
 *     event_id: "{{DL - Unique Event ID}}",
 *     value: "99.99",
 *     currency: "USD"
 *   }
 * });
 */
export function createGA4EventTag(config: {
  name?: string;
  eventName: string;
  measurementId?: string;
  eventParams?: Record<string, string>;
  firingTriggerId: string[];
}): any {
  const parameters: any[] = [
    { key: "eventName", type: "template", value: config.eventName }
  ];
  
  if (config.measurementId) {
    parameters.push({
      key: "measurementIdOverride",
      type: "template",
      value: config.measurementId
    });
  }
  
  if (config.eventParams && Object.keys(config.eventParams).length > 0) {
    parameters.push(buildEventSettingsTable(config.eventParams));
  }
  
  return {
    name: config.name || `GA4 Event - ${config.eventName}`,
    type: "gaawe",
    parameter: parameters,
    firingTriggerId: config.firingTriggerId
  };
}

/**
 * Helper to create Google Ads Conversion Tag
 * 
 * @example
 * const gadsConversion = createGoogleAdsConversionTag({
 *   conversionId: "AW-XXXXXXXX",
 *   conversionLabel: "abc123",
 *   orderId: "{{DL - Unique Event ID}}"
 * });
 */
export function createGoogleAdsConversionTag(config: {
  name?: string;
  conversionId: string;
  conversionLabel: string;
  value?: string;
  currency?: string;
  orderId?: string;
  firingTriggerId: string[];
}): any {
  const parameters: any[] = [
    { key: "conversionId", type: "template", value: config.conversionId },
    { key: "conversionLabel", type: "template", value: config.conversionLabel }
  ];
  
  if (config.value) {
    parameters.push({ key: "conversionValue", type: "template", value: config.value });
  }
  
  if (config.currency) {
    parameters.push({ key: "currencyCode", type: "template", value: config.currency });
  }
  
  if (config.orderId) {
    parameters.push({ key: "orderId", type: "template", value: config.orderId });
  }
  
  return {
    name: config.name || "Google Ads Conversion",
    type: "awct",
    parameter: parameters,
    firingTriggerId: config.firingTriggerId
  };
}

/**
 * Helper to create Facebook Pixel Tag (stape-io/fb-tag)
 * 
 * @example
 * const fbTag = createFacebookPixelTag({
 *   pixelId: "123456789",
 *   eventId: "{{DL - Unique Event ID}}",
 *   templateId: "cvt_KFNBV"
 * });
 */
export function createFacebookPixelTag(config: {
  name?: string;
  pixelId: string;
  eventId?: string;
  templateId: string;
  firingTriggerId: string[];
}): any {
  const parameters: any[] = [
    { key: "pixelIds", type: "template", value: config.pixelId }
  ];
  
  if (config.eventId) {
    parameters.push({ key: "eventId", type: "template", value: config.eventId });
  }
  
  return {
    name: config.name || "Facebook Pixel",
    type: config.templateId,
    parameter: parameters,
    firingTriggerId: config.firingTriggerId
  };
}

/**
 * Validate tag parameter structure
 * Returns errors if structure is incorrect
 */
export function validateTagParameters(tagType: string, parameters: any[]): string[] {
  const errors: string[] = [];
  
  // Check for common mistakes
  parameters.forEach(param => {
    // Direct server_container_url (should be in configSettingsTable)
    if (param.key === "server_container_url" && tagType === "googtag") {
      errors.push("server_container_url must be in configSettingsTable, not as direct parameter");
    }
    
    // Direct event_id (should be in eventSettingsTable)
    if (param.key === "event_id" && tagType === "gaawe") {
      errors.push("event_id must be in eventSettingsTable, not as direct parameter");
    }
    
    // Missing type field
    if (!param.type) {
      errors.push(`Parameter "${param.key}" is missing "type" field`);
    }
    
    // List parameter without list array
    if (param.type === "list" && !param.list) {
      errors.push(`Parameter "${param.key}" has type "list" but no "list" array`);
    }
    
    // Map parameter without map array
    if (param.type === "map" && !param.map) {
      errors.push(`Parameter "${param.key}" has type "map" but no "map" array`);
    }
  });
  
  return errors;
}

/**
 * Extract parameters from existing tag for analysis
 */
export function extractTagParameters(tag: any): {
  direct: Record<string, any>;
  configSettings?: Record<string, string>;
  eventSettings?: Record<string, string>;
} {
  const result: any = {
    direct: {}
  };
  
  if (!tag.parameter) return result;
  
  tag.parameter.forEach((param: any) => {
    if (param.key === "configSettingsTable" && param.list) {
      result.configSettings = {};
      param.list.forEach((item: any) => {
        if (item.map) {
          const paramMap: any = {};
          item.map.forEach((p: any) => {
            paramMap[p.key] = p.value;
          });
          if (paramMap.parameter && paramMap.parameterValue) {
            result.configSettings[paramMap.parameter] = paramMap.parameterValue;
          }
        }
      });
    } else if (param.key === "eventSettingsTable" && param.list) {
      result.eventSettings = {};
      param.list.forEach((item: any) => {
        if (item.map) {
          const paramMap: any = {};
          item.map.forEach((p: any) => {
            paramMap[p.key] = p.value;
          });
          if (paramMap.parameter && paramMap.parameterValue) {
            result.eventSettings[paramMap.parameter] = paramMap.parameterValue;
          }
        }
      });
    } else {
      result.direct[param.key] = param.value;
    }
  });
  
  return result;
}
