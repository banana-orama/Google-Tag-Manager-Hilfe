#!/usr/bin/env node

import { loadTemplateRegistry, saveTemplateRegistry, TemplateRegistryEntry } from '../utils/template-registry.js';

function isPriorityTemplate(repository: string): boolean {
  const r = repository.toLowerCase();
  return r.includes('facebook') || r.includes('fb-') || r.includes('linkedin') || r.includes('microsoft');
}

function setDefaultTagShape(entry: TemplateRegistryEntry): void {
  if (entry.entityKind === 'unknown') entry.entityKind = 'tag';
  if (entry.containerContext === 'UNKNOWN') entry.containerContext = 'SERVER';
  if (!Array.isArray(entry.requiredParameters)) entry.requiredParameters = [];
  if (!Array.isArray(entry.optionalParameters)) entry.optionalParameters = [];
  if (!entry.defaults) entry.defaults = {};
  if (!entry.examplePayload || typeof entry.examplePayload !== 'object') entry.examplePayload = {};

  // Do not overwrite extracted requirements; only provide minimal, safe hints.
  const hasEventName =
    entry.requiredParameters.some((p) => p.key === 'event_name') ||
    entry.optionalParameters.some((p) => p.key === 'event_name');
  if (!hasEventName) {
    entry.optionalParameters.push({
      key: 'event_name',
      type: 'template',
      description: 'Event name (e.g., purchase)',
    });
  }
  const hasEventId =
    entry.requiredParameters.some((p) => p.key === 'event_id') ||
    entry.optionalParameters.some((p) => p.key === 'event_id');
  if (!hasEventId) {
    entry.optionalParameters.push({
      key: 'event_id',
      type: 'template',
      description: 'Event ID for deduplication',
    });
  }

  if (!('event_name' in entry.defaults)) entry.defaults.event_name = 'purchase';
  if (!('event_id' in entry.defaults)) entry.defaults.event_id = 'PLACEHOLDER_EVENT_ID';

  entry.examplePayload = {
    name: `Template - ${entry.repository}`,
    type: entry.type || 'TEMPLATE_TYPE_PLACEHOLDER',
    parameter: [
      { key: 'event_name', type: 'template', value: String(entry.defaults.event_name) },
      { key: 'event_id', type: 'template', value: String(entry.defaults.event_id) },
    ],
  };
}

async function main() {
  const registry = await loadTemplateRegistry();
  let updated = 0;
  for (const entry of registry.entries) {
    if (!isPriorityTemplate(entry.repository)) continue;
    setDefaultTagShape(entry);
    entry.verificationNote = entry.verificationNote
      ? `${entry.verificationNote} | Priority enrichment applied`
      : 'Priority enrichment applied';
    updated += 1;
  }
  await saveTemplateRegistry(registry);
  console.log(`Priority template enrichment applied: ${updated} entries`);
}

main().catch((error) => {
  console.error('Failed to enrich priority templates:', error);
  process.exit(1);
});
