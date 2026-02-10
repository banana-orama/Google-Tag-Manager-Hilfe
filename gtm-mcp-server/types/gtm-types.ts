/**
 * TypeScript type definitions for GTM API v2
 * Based on official Google Tag Manager API documentation
 */

// ============================================
// Parameter Types
// ============================================

export type ParameterType = 
  | 'template' 
  | 'integer' 
  | 'boolean' 
  | 'list' 
  | 'map' 
  | 'triggerReference' 
  | 'tagReference';

export interface GTMBaseParameter {
  key: string;
  type: ParameterType;
  isWeakReference?: boolean;
}

export interface GTMTemplateParameter extends GTMBaseParameter {
  type: 'template';
  value: string;
}

export interface GTMIntegerParameter extends GTMBaseParameter {
  type: 'integer';
  value: string; // API returns string
}

export interface GTMBooleanParameter extends GTMBaseParameter {
  type: 'boolean';
  value: string; // 'true' or 'false'
}

export interface GTMListParameter extends GTMBaseParameter {
  type: 'list';
  list: GTMParameter[];
}

export interface GTMMapParameter extends GTMBaseParameter {
  type: 'map';
  map: GTMParameter[];
}

export interface GTMTriggerReferenceParameter extends GTMBaseParameter {
  type: 'triggerReference';
  value: string; // Trigger ID
}

export interface GTMTagReferenceParameter extends GTMBaseParameter {
  type: 'tagReference';
  value: string; // Tag name
}

export type GTMParameter = 
  | GTMTemplateParameter 
  | GTMIntegerParameter 
  | GTMBooleanParameter 
  | GTMListParameter 
  | GTMMapParameter 
  | GTMTriggerReferenceParameter 
  | GTMTagReferenceParameter;

// ============================================
// Condition Types
// ============================================

export type ConditionType = 
  | 'equals' 
  | 'contains' 
  | 'startsWith' 
  | 'endsWith' 
  | 'matchRegex' 
  | 'greater' 
  | 'greaterOrEquals' 
  | 'less' 
  | 'lessOrEquals' 
  | 'cssSelector' 
  | 'urlMatches';

export interface GTMConditionParameter {
  key: 'arg0' | 'arg1' | 'ignore_case' | 'negate';
  type: 'template' | 'boolean';
  value: string;
}

export interface GTMCondition {
  type: ConditionType;
  parameter: GTMConditionParameter[];
}

// ============================================
// Trigger Types
// ============================================

export type WebTriggerType = 
  | 'pageview' 
  | 'domReady' 
  | 'windowLoaded'
  | 'click' 
  | 'linkClick' 
  | 'formSubmission'
  | 'customEvent'
  | 'timer' 
  | 'scrollDepth' 
  | 'elementVisibility'
  | 'jsError' 
  | 'historyChange'
  | 'youTubeVideo';

export type ServerTriggerType = 
  | 'always' 
  | 'customEvent' 
  | 'triggerGroup'
  | 'init' 
  | 'consentInit' 
  | 'serverPageview';

export type FirebaseTriggerType =
  | 'firebaseAppException'
  | 'firebaseAppUpdate'
  | 'firebaseCampaign'
  | 'firebaseFirstOpen'
  | 'firebaseInAppPurchase'
  | 'firebaseNotificationDismiss'
  | 'firebaseNotificationForeground'
  | 'firebaseNotificationOpen'
  | 'firebaseNotificationReceive'
  | 'firebaseOsUpdate'
  | 'firebaseSessionStart'
  | 'firebaseUserEngagement';

export type AmpTriggerType =
  | 'ampClick'
  | 'ampTimer'
  | 'ampScroll'
  | 'ampVisibility';

export type TriggerType = 
  | WebTriggerType 
  | ServerTriggerType 
  | FirebaseTriggerType 
  | AmpTriggerType;

// ============================================
// Variable Types
// ============================================

export type VariableType = 
  | 'c'   // Cookie
  | 'jsm' // JavaScript Macro
  | 'v'   // URL Variable
  | 'k'   // Constant
  | 'aev' // Auto-Event Variable
  | 'r'   // Random Number
  | 'smm' // Storage Macro
  | 'f'   // Data Layer
  | 'ev'  // Environment Variable
  | 'fn'  // Function Call
  | 'd'   // DOM Element
  | 'j'   // JavaScript Variable
  | 'ejs' // E-Commerce Settings
  | 'en'  // Enhanced E-Commerce (mobile)
  | 'dn'; // Debug Mode (mobile)

// ============================================
// Container Types
// ============================================

export type ContainerUsageContext = 'web' | 'server' | 'amp' | 'ios' | 'android';

export type ContainerType = 'web' | 'server' | 'amp' | 'ios' | 'android';

// ============================================
// Tag Types (partial list - many more exist)
// ============================================

export type CommonTagType = 
  | 'html'      // Custom HTML
  | 'gaawe'     // GA4 Event
  | 'googtag'   // Google tag (gtag.js)
  | 'awct'      // Google Ads Conversion Tracking
  | 'sp'        // Google Ads Remarketing
  | 'ua'        // Universal Analytics
  | 'flc'       // Floodlight Counter
  | 'flc'       // Floodlight Sales
  | 'bzi'       // Bing Ads
  | 'tp'        // Twitter Pixel
  | 'msm'       // Microsoft Advertising
  | 'qcm'       // Quantcast
  | 'adm'       // Adometry
  | 'gclidw';   // Google Click ID

// ============================================
// Full Configuration Interfaces
// ============================================

export interface WebTriggerConfig {
  type: WebTriggerType | FirebaseTriggerType | AmpTriggerType;
  name: string;
  filter?: GTMCondition[];
  customEventFilter?: GTMCondition[];
  autoEventFilter?: GTMCondition[];
  parentFolderId?: string;
  notes?: string;
}

export interface ServerTriggerConfig {
  type: ServerTriggerType;
  name: string;
  customEventFilter?: GTMCondition[];
  parentFolderId?: string;
  notes?: string;
}

export interface TagConfig {
  type: string;
  name: string;
  parameter?: GTMParameter[];
  firingTriggerId?: string[];
  blockingTriggerId?: string[];
  paused?: boolean;
  parentFolderId?: string;
  notes?: string;
  tagFiringOption?: 'unlimited' | 'oncePerEvent' | 'oncePerLoad';
  liveOnly?: boolean;
  scheduleStartMs?: string;
  scheduleEndMs?: string;
}

export interface VariableConfig {
  type: VariableType;
  name: string;
  parameter?: GTMParameter[];
  parentFolderId?: string;
  notes?: string;
}

// ============================================
// Container Capabilities
// ============================================

export interface ContainerCapabilities {
  containerType: ContainerType;
  usageContext: string[];
  hasClients: boolean;
  hasTransformations: boolean;
  hasWebTriggers: boolean;
  hasServerTriggers: boolean;
  supportedTriggerTypes: string[];
  supportedVariableTypes: string[];
  notes: string[];
}

// ============================================
// API Response Types
// ============================================

export interface GTMEntitySummary {
  id: string;
  name: string;
  type: string;
  path: string;
  folderId?: string;
}

export interface GTMTagSummary extends GTMEntitySummary {
  firingTriggerId?: string[];
  blockingTriggerId?: string[];
  paused?: boolean;
}

export interface GTMTriggerSummary extends GTMEntitySummary {
  // No additional fields
}

export interface GTMVariableSummary extends GTMEntitySummary {
  // No additional fields
}

// ============================================
// Helper Type Guards
// ============================================

export function isWebTrigger(type: string): type is WebTriggerType {
  return [
    'pageview', 'domReady', 'windowLoaded',
    'click', 'linkClick', 'formSubmission',
    'customEvent', 'timer', 'scrollDepth',
    'elementVisibility', 'jsError', 'historyChange',
    'youTubeVideo'
  ].includes(type);
}

export function isServerTrigger(type: string): type is ServerTriggerType {
  return ['always', 'customEvent', 'triggerGroup', 'init', 'consentInit', 'serverPageview'].includes(type);
}

export function isServerContainer(usageContext: string[]): boolean {
  return usageContext.includes('server');
}

export function isWebContainer(usageContext: string[]): boolean {
  return usageContext.includes('web');
}
