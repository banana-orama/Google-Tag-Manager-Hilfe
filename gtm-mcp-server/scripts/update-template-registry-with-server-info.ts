/**
 * Update Template Registry with Server Container Information
 * Uses research results to mark templates as SERVER/WEB and TAG/CLIENT/VARIABLE
 */

import * as fs from 'fs';
import * as path from 'path';

interface TemplateRegistry {
  version: number;
  updatedAt: string;
  entries: TemplateEntry[];
}

interface TemplateEntry {
  owner: string;
  repository: string;
  containerContext: string;
  entityKind: string;
  requiredParameters: string[];
  optionalParameters: string[];
  defaults: Record<string, any>;
  examplePayload: Record<string, any>;
  status: string;
  lastVerifiedAt: string;
  verificationNote?: string;
  type?: string;
  sha?: string;
}

interface ServerTemplateMapping {
  owner: string;
  repository: string;
  type: 'TAG' | 'CLIENT' | 'VARIABLE' | 'TRANSFORMATION';
  containerContext: 'SERVER' | 'WEB';
  category?: string;
  parameters?: {
    required?: string[];
    optional?: string[];
  };
}

// Server templates from research
const serverTemplates: ServerTemplateMapping[] = [
  // Tags
  { owner: 'stape-io', repository: 'facebook-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING', parameters: { required: ['accessToken', 'pixelId', 'actionSource'], optional: ['eventName', 'testId'] } },
  { owner: 'stape-io', repository: 'klaviyo-tag', type: 'TAG', containerContext: 'SERVER', category: 'MARKETING', parameters: { required: ['apiKey'], optional: ['type', 'email', 'phone'] } },
  { owner: 'stape-io', repository: 'json-http-request-tag', type: 'TAG', containerContext: 'SERVER', category: 'UTILITY' },
  { owner: 'stape-io', repository: 'ga4-advanced-tag', type: 'TAG', containerContext: 'SERVER', category: 'ANALYTICS' },
  { owner: 'stape-io', repository: 'gads-conversion-adjustments-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING' },
  { owner: 'stape-io', repository: 'gads-conversion-improver-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING' },
  { owner: 'stape-io', repository: 'gads-offline-conversion-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING' },
  { owner: 'stape-io', repository: 'google-conversion-events-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING' },
  { owner: 'stape-io', repository: 'google-customer-match-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING' },
  { owner: 'stape-io', repository: 'tiktok-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING' },
  { owner: 'stape-io', repository: 'linkedin-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING' },
  { owner: 'stape-io', repository: 'pinterest-capi-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING' },
  { owner: 'stape-io', repository: 'snapchat-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING' },
  { owner: 'stape-io', repository: 'microsoft-capi-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING' },
  { owner: 'stape-io', repository: 'twitter-tag', type: 'TAG', containerContext: 'SERVER', category: 'ADVERTISING' },
  { owner: 'stape-io', repository: 'event-enricher-tag', type: 'TAG', containerContext: 'SERVER', category: 'UTILITY' },
  { owner: 'stape-io', repository: 'json-response-tag', type: 'TAG', containerContext: 'SERVER', category: 'UTILITY' },
  { owner: 'stape-io', repository: 'logger-tag', type: 'TAG', containerContext: 'SERVER', category: 'UTILITY' },
  { owner: 'stape-io', repository: 'firestore-writer-tag', type: 'TAG', containerContext: 'SERVER', category: 'DATABASE' },
  { owner: 'stape-io', repository: 'spreadsheet-tag', type: 'TAG', containerContext: 'SERVER', category: 'DATABASE' },
  
  // Clients
  { owner: 'stape-io', repository: 'data-client', type: 'CLIENT', containerContext: 'SERVER', parameters: { optional: ['exposeFPIDCookie', 'httpOnlyCookie', 'generateClientId'] } },
  { owner: 'stape-io', repository: 'exponea-client', type: 'CLIENT', containerContext: 'SERVER' },
  { owner: 'stape-io', repository: 'piano-client', type: 'CLIENT', containerContext: 'SERVER' },
  { owner: 'stape-io', repository: 'file-proxy-client', type: 'CLIENT', containerContext: 'SERVER' },
  
  // Variables
  { owner: 'stape-io', repository: 'data-variable', type: 'VARIABLE', containerContext: 'SERVER' },
  { owner: 'stape-io', repository: 'facebook-parameter-generator-variable', type: 'VARIABLE', containerContext: 'SERVER' },
  { owner: 'stape-io', repository: 'consent-parser-variable', type: 'VARIABLE', containerContext: 'SERVER' },
  { owner: 'stape-io', repository: 'http-lookup-variable', type: 'VARIABLE', containerContext: 'SERVER' },
  { owner: 'stape-io', repository: 'hubspot-lookup-variable', type: 'VARIABLE', containerContext: 'SERVER' },
  { owner: 'stape-io', repository: 'klaviyo-lookup-variable', type: 'VARIABLE', containerContext: 'SERVER' },
  { owner: 'stape-io', repository: 'json-converter-variable', type: 'VARIABLE', containerContext: 'SERVER' },
  { owner: 'stape-io', repository: 'math-variable', type: 'VARIABLE', containerContext: 'SERVER' },
  { owner: 'stape-io', repository: 'object-builder-variable', type: 'VARIABLE', containerContext: 'SERVER' },
  { owner: 'stape-io', repository: 'object-property-extractor-variable', type: 'VARIABLE', containerContext: 'SERVER' },
  
  // Web templates with server companions
  { owner: 'stape-io', repository: 'data-tag', type: 'TAG', containerContext: 'WEB' },
  { owner: 'stape-io', repository: 'fb-tag', type: 'TAG', containerContext: 'WEB' },
  { owner: 'stape-io', repository: 'unique-event-id-variable', type: 'VARIABLE', containerContext: 'WEB' },
  { owner: 'stape-io', repository: 'tiktok-web-tag', type: 'TAG', containerContext: 'WEB' },
  { owner: 'stape-io', repository: 'user-data-extractor-web-tag', type: 'TAG', containerContext: 'WEB' },
];

async function updateRegistry() {
  const registryPath = path.join(process.cwd(), 'config/template-registry.json');
  const registry: TemplateRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  
  let updatedCount = 0;
  const templateMap = new Map<string, ServerTemplateMapping>();
  
  // Build lookup map
  serverTemplates.forEach(t => {
    templateMap.set(`${t.owner}/${t.repository}`, t);
  });
  
  // Update existing entries
  registry.entries.forEach((entry, index) => {
    const key = `${entry.owner}/${entry.repository}`;
    const mapping = templateMap.get(key);
    
    if (mapping) {
      // Update with server info
      entry.containerContext = mapping.containerContext;
      entry.entityKind = mapping.type;
      
      // Update parameters if available
      if (mapping.parameters) {
        entry.requiredParameters = mapping.parameters.required || [];
        entry.optionalParameters = mapping.parameters.optional || [];
      }
      
      // Mark as verified (we know this is a real template)
      entry.status = 'verified';
      entry.verificationNote = `Verified as ${mapping.containerContext} ${mapping.type}`;
      entry.lastVerifiedAt = new Date().toISOString();
      
      updatedCount++;
      console.log(`✓ Updated ${key}: ${mapping.containerContext} ${mapping.type}`);
    }
  });
  
  // Save updated registry
  registry.updatedAt = new Date().toISOString();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  
  console.log(`\n✅ Registry updated: ${updatedCount} entries enhanced with server info`);
  console.log(`📊 Total entries: ${registry.entries.length}`);
}

updateRegistry().catch(console.error);
