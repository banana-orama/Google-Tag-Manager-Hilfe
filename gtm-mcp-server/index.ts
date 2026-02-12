#!/usr/bin/env node
/**
 * GTM MCP Server
 * Model Context Protocol server for Google Tag Manager API
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import {
  getAuthenticatedClient,
  hasCredentials,
  hasValidTokens,
  getCredentialsPath,
} from './auth/oauth.js';
import { initTagManagerClient } from './utils/gtm-client.js';
import { rateLimiter } from './utils/rate-limiter.js';
import { getTriggerTemplate, validateTriggerConfigFull, getVariableParameters } from './utils/llm-helpers.js';
import { getContainerInfo } from './utils/container-validator.js';
import { validateEntityConfigStrict } from './utils/entity-validators.js';
import { getAvailableEntityTypes, preflightTemplateBasedCreate, TemplateReference } from './utils/template-registry.js';
import { getTagTypeInfo, getAllTagTypes, validateTagParameters } from './utils/tag-helpers.js';
import { getWorkflow, getAllWorkflows, customizeWorkflow } from './utils/workflow-guides.js';
import { searchEntities, formatSearchResults } from './utils/search.js';
import { checkBestPractices, formatBestPracticesResult } from './utils/best-practices.js';

// Tool implementations
import * as accounts from './tools/accounts.js';
import * as containers from './tools/containers.js';
import * as workspaces from './tools/workspaces.js';
import * as tags from './tools/tags.js';
import * as triggers from './tools/triggers.js';
import * as variables from './tools/variables.js';
import * as versions from './tools/versions.js';
import * as folders from './tools/folders.js';
import * as templates from './tools/templates.js';
import * as builtInVariables from './tools/builtInVariables.js';
import * as clients from './tools/clients.js';
import * as transformations from './tools/transformations.js';
import * as zones from './tools/zones.js';
import * as environments from './tools/environments.js';
import * as destinations from './tools/destinations.js';
import * as userPermissions from './tools/userPermissions.js';
import * as gtagConfig from './tools/gtagConfig.js';

// Shared JSON-schema snippets for LLM-friendly tool contracts.
// Keep these permissive enough for future GTM types, but explicit enough for good prompting.
const GTM_PARAMETER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  description:
    'GTM API v2 Parameter object. `type` is required by GTM for most operations. Use `value` for template/boolean/integer, `list` for list, and `map` for map parameters.',
  properties: {
    key: { type: 'string', description: 'Parameter key (e.g., "measurementId", "eventName", "html", "arg0", "arg1")' },
    type: {
      type: 'string',
      description: 'Parameter type',
      enum: ['template', 'boolean', 'integer', 'list', 'map', 'triggerReference', 'tagReference'],
    },
    value: {
      description: 'Parameter value (for template/boolean/integer). For template, value is a string.',
      anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
    },
    list: {
      type: 'array',
      description: 'Nested parameters when type="list"',
      items: { type: 'object' },
    },
    map: {
      type: 'array',
      description: 'Nested parameters when type="map"',
      items: { type: 'object' },
    },
  },
  required: ['key', 'type'],
  additionalProperties: true,
};

const TEMPLATE_REFERENCE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  description: 'Optional template registry reference. If provided, type/parameters are validated against template-registry.json.',
  properties: {
    owner: { type: 'string', description: 'Template gallery owner (e.g., stape-io)' },
    repository: { type: 'string', description: 'Template gallery repository' },
    version: { type: 'string', description: 'Optional SHA/version pin' },
  },
  required: ['owner', 'repository'],
  additionalProperties: false,
};

// Define all available tools
const TOOLS: Tool[] = [
  // === STATUS ===
  {
    name: 'gtm_status',
    description: 'Check GTM API connection status and rate limit info',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  // === ACCOUNTS ===
  {
    name: 'gtm_list_accounts',
    description: 'List all accessible GTM accounts. Returns account IDs and names.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'gtm_get_account',
    description: 'Get full details of a specific GTM account',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'GTM Account ID',
        },
      },
      required: ['accountId'],
    },
  },

  // === CONTAINERS ===
  {
    name: 'gtm_list_containers',
    description: 'List all containers in an account',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'GTM Account ID',
        },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'gtm_lookup_container',
    description: 'Find a container by its public ID (e.g., GTM-XXXXX)',
    inputSchema: {
      type: 'object',
      properties: {
        publicId: {
          type: 'string',
          description: 'Container public ID like GTM-XXXXX',
        },
      },
      required: ['publicId'],
    },
  },
  {
    name: 'gtm_get_container',
    description: 'Get detailed information about a specific container',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: {
          type: 'string',
          description: 'Container path (e.g., accounts/123/containers/456)',
        },
      },
      required: ['containerPath'],
    },
  },
  {
    name: 'gtm_create_container',
    description: 'Create a new GTM container (requires confirmation)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to create a new container.',
        },
        accountId: {
          type: 'string',
          description: 'GTM Account ID',
        },
        name: {
          type: 'string',
          description: 'Container name',
        },
        usageContext: {
          type: 'string',
          enum: ['web', 'server', 'amp', 'ios', 'android'],
          description: 'Container type',
        },
      },
      required: ['accountId', 'name', 'usageContext', 'confirm'],
    },
  },
  {
    name: 'gtm_delete_container',
    description: 'Delete a GTM container (DESTRUCTIVE - requires confirmation)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        containerPath: {
          type: 'string',
          description: 'Container path (e.g., accounts/123/containers/456)',
        },
      },
      required: ['containerPath', 'confirm'],
    },
  },

  // === WORKSPACES ===
  {
    name: 'gtm_list_workspaces',
    description: 'List all workspaces in a container',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: {
          type: 'string',
          description: 'Container path',
        },
      },
      required: ['containerPath'],
    },
  },
  {
    name: 'gtm_create_workspace',
    description: 'Create a new workspace for making changes',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: {
          type: 'string',
          description: 'Container path',
        },
        name: {
          type: 'string',
          description: 'Workspace name',
        },
        description: {
          type: 'string',
          description: 'Workspace description (optional)',
        },
      },
      required: ['containerPath', 'name'],
    },
  },
  {
    name: 'gtm_get_workspace',
    description: 'Get details of a specific workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'gtm_delete_workspace',
    description: 'Delete a workspace (DESTRUCTIVE - requires confirmation)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        workspacePath: {
          type: 'string',
          description: 'Workspace path to delete',
        },
      },
      required: ['workspacePath', 'confirm'],
    },
  },
  {
    name: 'gtm_sync_workspace',
    description: 'Sync a workspace with the latest container version (requires confirmation)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to sync the workspace.',
        },
        workspacePath: {
          type: 'string',
          description: 'Workspace path to sync',
        },
      },
      required: ['workspacePath', 'confirm'],
    },
  },
  {
    name: 'gtm_get_workspace_status',
    description: 'Get workspace status including pending changes and conflicts',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
      },
      required: ['workspacePath'],
    },
  },

  // === TAGS ===
  {
    name: 'gtm_list_tags',
    description: 'List all tags in a workspace with summary (compressed for token efficiency)',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'gtm_get_tag',
    description: 'Get full details of a specific tag including parameters',
    inputSchema: {
      type: 'object',
      properties: {
        tagPath: {
          type: 'string',
          description: 'Tag path',
        },
      },
      required: ['tagPath'],
    },
  },
  {
    name: 'gtm_create_tag',
    description: 'Create a new tag. For template-based types, prefer templateReference to resolve/validate against template registry.',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        name: {
          type: 'string',
          description: 'Tag name',
        },
        type: {
          type: 'string',
          description: 'Tag type (e.g., gaawe, html, awct). Optional if templateReference resolves it.',
        },
        templateReference: TEMPLATE_REFERENCE_SCHEMA,
        firingTriggerId: {
          type: 'array',
          items: { type: 'string' },
          description: 'Trigger IDs that fire this tag',
        },
        parameter: {
          type: 'array',
          description: `Tag parameters (GTM API v2 Parameter[]).

**Example (GA4 Event tag):**
\`\`\`json
[
  { "key": "measurementId", "type": "template", "value": "G-XXXXXXXXXX" },
  { "key": "eventName", "type": "template", "value": "purchase" }
]
\`\`\``,
          items: GTM_PARAMETER_SCHEMA,
        },
      },
      required: ['workspacePath', 'name'],
    },
  },
  {
    name: 'gtm_update_tag',
    description: 'Update an existing tag (requires fingerprint from gtm_get_tag)',
    inputSchema: {
      type: 'object',
      properties: {
        tagPath: { type: 'string', description: 'Tag path' },
        fingerprint: { type: 'string', description: 'Fingerprint from gtm_get_tag (optimistic locking)' },
        tagConfig: {
          type: 'object',
          description: 'Partial tag fields to update (name, parameter, firingTriggerId, blockingTriggerId, paused, parentFolderId)',
          additionalProperties: true,
        },
      },
      required: ['tagPath', 'fingerprint', 'tagConfig'],
    },
  },
  {
    name: 'gtm_revert_tag',
    description: 'Revert tag changes in the current workspace',
    inputSchema: {
      type: 'object',
      properties: {
        tagPath: { type: 'string', description: 'Tag path to revert' },
      },
      required: ['tagPath'],
    },
  },
  {
    name: 'gtm_delete_tag',
    description: 'Delete a tag (DESTRUCTIVE - requires confirmation)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        tagPath: {
          type: 'string',
          description: 'Tag path to delete',
        },
      },
      required: ['tagPath', 'confirm'],
    },
  },

  // === TRIGGERS ===
  {
    name: 'gtm_list_triggers',
    description: 'List all triggers in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'gtm_get_trigger',
    description: 'Get full details of a specific trigger',
    inputSchema: {
      type: 'object',
      properties: {
        triggerPath: {
          type: 'string',
          description: 'Trigger path',
        },
      },
      required: ['triggerPath'],
    },
  },
  {
    name: 'gtm_create_trigger',
    description: `Create a new GTM trigger.

**Container Compatibility:**
- **Web containers:** pageview, domReady, windowLoaded, click, linkClick, formSubmission, customEvent, timer, scrollDepth, elementVisibility, jsError, historyChange, youTubeVideo
- **Server containers:** always, customEvent, triggerGroup, init, consentInit, serverPageview

**Condition Format (API v2 preferred)**
Use \`parameter\` array with \`arg0\`/\`arg1\` keys:
\`\`\`json
{
  "type": "contains",
  "parameter": [
    { "key": "arg0", "type": "template", "value": "{{Page URL}}" },
    { "key": "arg1", "type": "template", "value": "/checkout" }
  ]
}
\`\`\`

**Condition Types:** equals, contains, startsWith, endsWith, matchRegex, greater, greaterOrEquals, less, lessOrEquals, cssSelector, urlMatches

**When to use which filter:**
- \`filter\`: Trigger activation conditions (e.g., only on certain pages)
- \`customEventFilter\`: ONLY for customEvent type triggers (matches data layer event name)
- \`autoEventFilter\`: For auto-event triggers (element visibility, etc.)

Legacy \`arg1\`/\`arg2\` syntax is accepted and normalized automatically.

**Check compatibility:** Use \`gtm_get_container_info\` before creating triggers.`,
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        name: {
          type: 'string',
          description: 'Trigger name',
        },
        type: {
          type: 'string',
          description: 'Trigger type (lowercase: pageview, click, customEvent, etc.) - depends on container type',
          enum: [
            'pageview', 'domReady', 'windowLoaded', 'customEvent',
            'click', 'linkClick', 'formSubmission',
            'timer', 'scrollDepth', 'elementVisibility',
            'jsError', 'historyChange', 'youTubeVideo',
            'init', 'consentInit', 'serverPageview', 'always', 'triggerGroup',
            'firebaseAppException', 'firebaseAppUpdate', 'firebaseCampaign',
            'firebaseFirstOpen', 'firebaseInAppPurchase', 'firebaseNotificationDismiss',
            'firebaseNotificationForeground', 'firebaseNotificationOpen',
            'firebaseOsUpdate', 'firebaseSessionStart', 'firebaseUserEngagement',
            'ampClick', 'ampTimer', 'ampScroll', 'ampVisibility'
          ],
        },
        filter: {
          type: 'array',
          description: `Trigger activation conditions.

Preferred: use parameter array with arg0/arg1 (API v2 format)
\`\`\`json
[{
  "type": "contains",
  "parameter": [
    { "key": "arg0", "type": "template", "value": "{{Page URL}}" },
    { "key": "arg1", "type": "template", "value": "/checkout" }
  ]
}]
\`\`\`

**Optional:** Add { "key": "ignore_case", "type": "boolean", "value": "true" } for case-insensitive matching`,
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Condition type (equals, contains, matchRegex, startsWith, endsWith, greater, less, etc.)' },
              parameter: {
                type: 'array',
                description: 'Condition parameters with arg0, arg1, and optional ignore_case/negate',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string', description: 'Parameter key (arg0, arg1, ignore_case, negate)' },
                    type: { type: 'string', description: 'Parameter type (template, boolean)' },
                    value: { type: 'string', description: 'Parameter value' },
                  },
                  required: ['key', 'type', 'value'],
                },
              },
              arg0: { type: 'string', description: 'Legacy left operand (auto-normalized to parameter arg0)' },
              arg1: { type: 'string', description: 'Legacy operand (auto-normalized to parameter arg0/arg1)' },
              arg2: { type: 'string', description: 'Legacy right operand (auto-normalized to parameter arg1)' },
            },
            required: ['type'],
          },
        },
        customEventFilter: {
          type: 'array',
          description: `Filter for customEvent triggers ONLY. Same format as filter.

**Example - Match data layer event "purchase":**
\`\`\`json
[{
  "type": "equals",
  "parameter": [
    { "key": "arg0", "type": "template", "value": "{{_event}}" },
    { "key": "arg1", "type": "template", "value": "purchase" }
  ]
}]
\`\`\``,
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              parameter: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    type: { type: 'string' },
                    value: { type: 'string' },
                  },
                  required: ['key', 'type', 'value'],
                },
              },
              arg0: { type: 'string', description: 'Legacy left operand (auto-normalized to parameter arg0)' },
              arg1: { type: 'string', description: 'Legacy operand (auto-normalized to parameter arg0/arg1)' },
              arg2: { type: 'string', description: 'Legacy right operand (auto-normalized to parameter arg1)' },
            },
            required: ['type'],
          },
        },
        autoEventFilter: {
          type: 'array',
          description: 'Auto-event filter (same format as filter)',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              parameter: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    type: { type: 'string' },
                    value: { type: 'string' },
                  },
                  required: ['key', 'type', 'value'],
                },
              },
              arg0: { type: 'string', description: 'Legacy left operand (auto-normalized to parameter arg0)' },
              arg1: { type: 'string', description: 'Legacy operand (auto-normalized to parameter arg0/arg1)' },
              arg2: { type: 'string', description: 'Legacy right operand (auto-normalized to parameter arg1)' },
            },
            required: ['type'],
          },
        },
        parentFolderId: {
          type: 'string',
          description: 'Parent folder ID (optional)',
        },
      },
      required: ['workspacePath', 'name', 'type'],
    },
  },
  {
    name: 'gtm_update_trigger',
    description: 'Update an existing trigger (requires fingerprint from gtm_get_trigger)',
    inputSchema: {
      type: 'object',
      properties: {
        triggerPath: { type: 'string', description: 'Trigger path' },
        fingerprint: { type: 'string', description: 'Fingerprint from gtm_get_trigger' },
        triggerConfig: {
          type: 'object',
          description: 'Partial trigger fields to update (name, filter, customEventFilter, autoEventFilter, parentFolderId)',
          additionalProperties: true,
        },
      },
      required: ['triggerPath', 'fingerprint', 'triggerConfig'],
    },
  },
  {
    name: 'gtm_delete_trigger',
    description: 'Delete a trigger (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        triggerPath: {
          type: 'string',
          description: 'Trigger path to delete',
        },
      },
      required: ['triggerPath', 'confirm'],
    },
  },

  // === VARIABLES ===
  {
    name: 'gtm_list_variables',
    description: 'List all variables in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'gtm_get_variable',
    description: 'Get full details of a specific variable',
    inputSchema: {
      type: 'object',
      properties: {
        variablePath: {
          type: 'string',
          description: 'Variable path',
        },
      },
      required: ['variablePath'],
    },
  },
  {
    name: 'gtm_create_variable',
    description: `Create a new variable.

**Common Variable Types:**
- \`c\`: 1st Party Cookie
- \`jsm\`: JavaScript Macro (custom JavaScript)
- \`v\`: URL Variable
- \`k\`: Constant (fixed value)
- \`aev\`: Auto-Event Variable
- \`r\`: Random Number
- \`smm\`: Storage Macro (localStorage/sessionStorage)
- \`f\`: Data Layer Variable

**Parameter Examples:**
- Constant (\`k\`): \`[{ "key": "value", "value": "my_fixed_value" }]\`
- Cookie (\`c\`): \`[{ "key": "cookieName", "value": "_ga" }]\`
- URL Variable (\`v\`): \`[{ "key": "urlComponent", "value": "query" }, { "key": "queryKey", "value": "utm_source" }]\`
- Data Layer (\`f\`): \`[{ "key": "dataLayerName", "value": "ecommerce" }]\`
- JavaScript Macro (\`jsm\`): \`[{ "key": "javascript", "value": "function() { return Date.now(); }" }]\``,
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        name: {
          type: 'string',
          description: 'Variable name (plain text, without {{}})',
        },
        type: {
          type: 'string',
          description: 'Variable type (e.g., c, jsm, v, aev, k, f, r, smm). Optional if templateReference resolves it.',
        },
        templateReference: TEMPLATE_REFERENCE_SCHEMA,
        parameter: {
          type: 'array',
          description: `Variable parameters (GTM API v2 Parameter[]).

**Example format:**
\`\`\`json
[
  { "key": "cookieName", "type": "template", "value": "_ga" }
]
\`\`\`

**Type-specific parameters:**
- Constant (k): key="value", type="template", value="your fixed value"
- Cookie (c): key="cookieName", type="template", value="cookie name"
- URL Variable (v): key="urlComponent" (path/query/fragment), key="queryKey" for query params
- Data Layer (f): key="dataLayerName", value="variable name"
- JavaScript Macro (jsm): key="javascript", value="function body"
`,
          items: GTM_PARAMETER_SCHEMA,
        },
      },
      required: ['workspacePath', 'name'],
    },
  },
  {
    name: 'gtm_update_variable',
    description: 'Update an existing variable (requires fingerprint from gtm_get_variable)',
    inputSchema: {
      type: 'object',
      properties: {
        variablePath: { type: 'string', description: 'Variable path' },
        fingerprint: { type: 'string', description: 'Fingerprint from gtm_get_variable' },
        variableConfig: {
          type: 'object',
          description: 'Partial variable fields to update (name, parameter, parentFolderId)',
          additionalProperties: true,
        },
      },
      required: ['variablePath', 'fingerprint', 'variableConfig'],
    },
  },
  {
    name: 'gtm_delete_variable',
    description: 'Delete a variable (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        variablePath: {
          type: 'string',
          description: 'Variable path to delete',
        },
      },
      required: ['variablePath', 'confirm'],
    },
  },

  // === FOLDERS ===
  {
    name: 'gtm_list_folders',
    description: 'List all folders in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'gtm_create_folder',
    description: 'Create a new folder',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        name: {
          type: 'string',
          description: 'Folder name',
        },
      },
      required: ['workspacePath', 'name'],
    },
  },
  {
    name: 'gtm_get_folder',
    description: 'Get full details of a specific folder',
    inputSchema: {
      type: 'object',
      properties: {
        folderPath: {
          type: 'string',
          description: 'Folder path',
        },
      },
      required: ['folderPath'],
    },
  },
  {
    name: 'gtm_update_folder',
    description: 'Update a folder name (requires fingerprint from gtm_get_folder)',
    inputSchema: {
      type: 'object',
      properties: {
        folderPath: { type: 'string', description: 'Folder path' },
        fingerprint: { type: 'string', description: 'Fingerprint from gtm_get_folder' },
        name: { type: 'string', description: 'New folder name' },
      },
      required: ['folderPath', 'fingerprint', 'name'],
    },
  },
  {
    name: 'gtm_delete_folder',
    description: 'Delete a folder (DESTRUCTIVE - requires confirmation)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: 'Required. Must be true to perform the deletion.' },
        folderPath: { type: 'string', description: 'Folder path to delete' },
      },
      required: ['folderPath', 'confirm'],
    },
  },
  {
    name: 'gtm_get_folder_entities',
    description: 'Get tags/triggers/variables currently assigned to a folder',
    inputSchema: {
      type: 'object',
      properties: {
        folderPath: { type: 'string', description: 'Folder path' },
      },
      required: ['folderPath'],
    },
  },
  {
    name: 'gtm_move_entities_to_folder',
    description: 'Move tags/triggers/variables to a folder by IDs',
    inputSchema: {
      type: 'object',
      properties: {
        folderPath: { type: 'string', description: 'Folder path' },
        entityIds: {
          type: 'object',
          properties: {
            tagId: { type: 'array', items: { type: 'string' } },
            triggerId: { type: 'array', items: { type: 'string' } },
            variableId: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
      },
      required: ['folderPath', 'entityIds'],
    },
  },

  // === TEMPLATES ===
  {
    name: 'gtm_list_templates',
    description: 'List all custom templates in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'gtm_get_template',
    description: 'Get full details of a specific template including template code',
    inputSchema: {
      type: 'object',
      properties: {
        templatePath: {
          type: 'string',
          description: 'Template path',
        },
      },
      required: ['templatePath'],
    },
  },
  {
    name: 'gtm_create_template',
    description: 'Create a new custom template',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        name: {
          type: 'string',
          description: 'Template name',
        },
        templateData: {
          type: 'string',
          description: 'Template code/data (the .tpl file content)',
        },
      },
      required: ['workspacePath', 'name', 'templateData'],
    },
  },
  {
    name: 'gtm_import_template_from_gallery',
    description: 'Import a template from the Community Template Gallery (API v2 templates:import_from_gallery)',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        host: {
          type: 'string',
          description: 'Optional. Ignored by GTM API v2 import endpoint (kept for backward compatibility).',
        },
        owner: {
          type: 'string',
          description: 'Gallery owner/organization',
        },
        repository: {
          type: 'string',
          description: 'Gallery repository name',
        },
        version: {
          type: 'string',
          description: 'Optional gallery SHA. If omitted, GTM imports latest gallery SHA.',
        },
      },
      required: ['workspacePath', 'owner', 'repository'],
    },
  },
  {
    name: 'gtm_update_template',
    description: 'Update a custom template (requires fingerprint from gtm_get_template)',
    inputSchema: {
      type: 'object',
      properties: {
        templatePath: { type: 'string', description: 'Template path' },
        fingerprint: { type: 'string', description: 'Fingerprint from gtm_get_template' },
        templateConfig: {
          type: 'object',
          description: 'Partial template fields to update (name, templateData)',
          additionalProperties: true,
        },
      },
      required: ['templatePath', 'fingerprint', 'templateConfig'],
    },
  },
  {
    name: 'gtm_revert_template',
    description: 'Revert template changes in workspace',
    inputSchema: {
      type: 'object',
      properties: {
        templatePath: { type: 'string', description: 'Template path to revert' },
      },
      required: ['templatePath'],
    },
  },
  {
    name: 'gtm_delete_template',
    description: 'Delete a template (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        templatePath: {
          type: 'string',
          description: 'Template path to delete',
        },
      },
      required: ['templatePath', 'confirm'],
    },
  },

  // === VERSIONS ===
  {
    name: 'gtm_list_versions',
    description: 'List all version headers in a container',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: {
          type: 'string',
          description: 'Container path',
        },
      },
      required: ['containerPath'],
    },
  },
  {
    name: 'gtm_get_latest_version_header',
    description: 'Get the latest container version header (metadata only)',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: { type: 'string', description: 'Container path' },
      },
      required: ['containerPath'],
    },
  },
  {
    name: 'gtm_get_live_version',
    description: 'Get the currently published (live) version with content summary',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: {
          type: 'string',
          description: 'Container path',
        },
      },
      required: ['containerPath'],
    },
  },
  {
    name: 'gtm_get_version',
    description: 'Get a specific version with full content',
    inputSchema: {
      type: 'object',
      properties: {
        versionPath: {
          type: 'string',
          description: 'Version path',
        },
      },
      required: ['versionPath'],
    },
  },
  {
    name: 'gtm_create_version',
    description: 'Create a new version from a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        name: {
          type: 'string',
          description: 'Version name',
        },
        notes: {
          type: 'string',
          description: 'Version notes (optional)',
        },
      },
      required: ['workspacePath', 'name'],
    },
  },
  {
    name: 'gtm_delete_version',
    description: 'Delete a version (DESTRUCTIVE - requires confirmation)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: 'Required. Must be true to perform the deletion.' },
        versionPath: { type: 'string', description: 'Version path to delete' },
      },
      required: ['versionPath', 'confirm'],
    },
  },
  {
    name: 'gtm_undelete_version',
    description: 'Undelete a deleted version (requires confirmation)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: 'Required. Must be true to undelete the version.' },
        versionPath: { type: 'string', description: 'Version path to undelete' },
      },
      required: ['versionPath', 'confirm'],
    },
  },
  {
    name: 'gtm_publish_version',
    description: 'Publish a version (make it live) - IMPORTANT ACTION requires confirmation',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to publish the version and make it live.',
        },
        versionPath: {
          type: 'string',
          description: 'Version path to publish',
        },
      },
      required: ['versionPath', 'confirm'],
    },
  },
  {
    name: 'gtm_export_version',
    description: 'Export a version as GTM container JSON format',
    inputSchema: {
      type: 'object',
      properties: {
        versionPath: {
          type: 'string',
          description: 'Version path to export',
        },
      },
      required: ['versionPath'],
    },
  },

  // === ANALYSIS ===
  {
    name: 'gtm_analyze_container',
    description: 'Analyze a container and return summary with tag/trigger/variable counts by type',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: {
          type: 'string',
          description: 'Container path to analyze',
        },
      },
      required: ['containerPath'],
    },
  },

  // === HELPER TOOLS ===
  {
    name: 'gtm_get_container_info',
    description: 'Get detailed container information including type and supported features. Use this to validate if trigger/variable types are supported.',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: {
          type: 'string',
          description: 'Container path (e.g., accounts/123/containers/456)',
        },
      },
      required: ['containerPath'],
    },
  },
  {
    name: 'gtm_validate_trigger_config',
    description: 'Validate a trigger configuration before creating it. Returns validation errors, warnings, and suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        triggerConfig: {
          type: 'object',
          description: 'Trigger configuration to validate',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            filter: { type: 'array' },
            customEventFilter: { type: 'array' },
            autoEventFilter: { type: 'array' },
          },
        },
        containerType: {
          type: 'string',
          enum: ['web', 'server', 'amp', 'ios', 'android'],
          description: 'Container type',
        },
      },
      required: ['triggerConfig', 'containerType'],
    },
  },
  {
    name: 'gtm_validate_tag_config',
    description: 'Validate a tag create payload before write. Returns deterministic strict-validation output.',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace path' },
        tagConfig: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            parameter: { type: 'array', items: GTM_PARAMETER_SCHEMA },
            templateReference: TEMPLATE_REFERENCE_SCHEMA,
          },
          required: ['name'],
        },
      },
      required: ['workspacePath', 'tagConfig'],
    },
  },
  {
    name: 'gtm_validate_variable_config',
    description: 'Validate a variable create payload before write. Returns deterministic strict-validation output.',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace path' },
        variableConfig: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            parameter: { type: 'array', items: GTM_PARAMETER_SCHEMA },
            templateReference: TEMPLATE_REFERENCE_SCHEMA,
          },
          required: ['name'],
        },
      },
      required: ['workspacePath', 'variableConfig'],
    },
  },
  {
    name: 'gtm_validate_client_config',
    description: 'Validate a server client create payload before write. Returns deterministic strict-validation output.',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace path' },
        clientConfig: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            parameter: { type: 'array', items: GTM_PARAMETER_SCHEMA },
            templateReference: TEMPLATE_REFERENCE_SCHEMA,
          },
          required: ['name'],
        },
      },
      required: ['workspacePath', 'clientConfig'],
    },
  },
  {
    name: 'gtm_validate_transformation_config',
    description: 'Validate a server transformation create payload before write. Returns deterministic strict-validation output.',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace path' },
        transformationConfig: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            parameter: { type: 'array', items: GTM_PARAMETER_SCHEMA },
            templateReference: TEMPLATE_REFERENCE_SCHEMA,
          },
          required: ['name'],
        },
      },
      required: ['workspacePath', 'transformationConfig'],
    },
  },
  {
    name: 'gtm_get_trigger_template',
    description: `Get a template for common trigger configurations. Returns example configuration that you can modify.`,
    inputSchema: {
      type: 'object',
      properties: {
        templateType: {
          type: 'string',
          enum: [
            'pageview-all', 'pageview-filtered', 'click-download',
            'custom-event-purchase', 'custom-event-generic', 'form-submission-contact', 'link-click-external',
            'timer-30s', 'scroll-depth-50', 'element-visibility', 'server-always', 'server-custom'
          ],
          description: 'Template type',
        },
      },
      required: ['templateType'],
    },
  },

  // === TAG HELPERS ===
  {
    name: 'gtm_get_tag_parameters',
    description: `Get required and optional parameters for a specific tag type.

**Use this BEFORE creating tags** to understand parameter structure.

**Common Tag Types:**
- \`html\`: Custom HTML
- \`gaawe\`: GA4 Event
- \`googtag\`: Google tag (gtag.js)
- \`awct\`: Google Ads Conversion
- \`sp\`: Google Ads Remarketing
- \`ua\`: Universal Analytics (deprecated)`,
    inputSchema: {
      type: 'object',
      properties: {
        tagType: {
          type: 'string',
          description: 'Tag type (e.g., html, gaawe, awct, sp)',
        },
      },
      required: ['tagType'],
    },
  },
  {
    name: 'gtm_list_tag_types',
    description: `List all known tag types with their categories and descriptions. Optionally include workspace-scoped type hints.`,
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Optional workspace path to include observed/available tag types in this context.',
        },
      },
      required: [],
    },
  },

  // === VARIABLE HELPERS ===
  {
    name: 'gtm_get_variable_parameters',
    description: `Get required and optional parameters for a specific variable type.

**Common Variable Types:**
- \`k\`: Constant
- \`c\`: Cookie
- \`v\`: URL Variable
- \`f\`: Data Layer
- \`jsm\`: JavaScript Macro
- \`aev\`: Auto-Event Variable`,
    inputSchema: {
      type: 'object',
      properties: {
        variableType: {
          type: 'string',
          description: 'Variable type (e.g., k, c, v, f, jsm, aev)',
        },
      },
      required: ['variableType'],
    },
  },

  // === WORKFLOW GUIDES ===
  {
    name: 'gtm_list_workflows',
    description: `List all available workflow guides for common GTM setup tasks.

**Available Workflows:**
- \`setup_ga4\`: Complete GA4 setup with pageview tracking
- \`setup_conversion_tracking\`: Google Ads conversion tracking
- \`setup_form_tracking\`: Form submission tracking with GA4
- \`setup_scroll_tracking\`: Scroll depth tracking
- \`setup_link_click_tracking\`: Link click tracking
- \`setup_ecommerce_tracking\`: Complete e-commerce tracking with GA4`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'gtm_get_workflow',
    description: `Get detailed workflow guide with step-by-step instructions.

**Returns:**
- List of steps with tool calls and parameters
- Prerequisites
- Estimated time`,
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          enum: ['setup_ga4', 'setup_conversion_tracking', 'setup_form_tracking', 'setup_scroll_tracking', 'setup_link_click_tracking', 'setup_ecommerce_tracking'],
          description: 'Workflow ID',
        },
        measurementId: {
          type: 'string',
          description: 'GA4 Measurement ID (optional, for placeholder replacement)',
        },
      },
      required: ['workflowId'],
    },
  },

  // === SEARCH ===
  {
    name: 'gtm_search_entities',
    description: `Search for tags, triggers, or variables across a workspace.

**Query Examples:**
- \`analytics\` - Find entities containing "analytics"
- \`type:gaawe\` - Find all GA4 tags
- \`type:pageview\` - Find all pageview triggers
- Empty query - List all entities

**Filters:**
- \`type:xxx\` - Filter by type (e.g., type:gaawe, type:pageview)
- Regular text - Search in names`,
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        query: {
          type: 'string',
          description: 'Search query (e.g., "analytics" or "type:gaawe")',
        },
        entityType: {
          type: 'string',
          enum: ['all', 'tags', 'triggers', 'variables'],
          default: 'all',
          description: 'Entity type to search',
        },
      },
      required: ['workspacePath', 'query'],
    },
  },

  // === BEST PRACTICES ===
  {
    name: 'gtm_check_best_practices',
    description: `Analyze a workspace for GTM best practices and provide recommendations.

**Checks:**
- Tags without firing triggers
- Paused tags
- Duplicate names
- Variable naming conventions
- Missing GA4 configuration
- Deprecated Universal Analytics tags

**Returns:**
- Score (0-100)
- List of issues with severity (error/warning/info)
- Recommendations for improvement`,
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
      },
      required: ['workspacePath'],
    },
  },

  // === BUILT-IN VARIABLES ===
  {
    name: 'gtm_list_built_in_variables',
    description: 'List all enabled built-in variables in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'gtm_enable_built_in_variables',
    description: 'Enable built-in variables by type (e.g., PAGE_URL, CLICK_TEXT, EVENT)',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Built-in variable types to enable (e.g., PAGE_URL, CLICK_TEXT, EVENT, CONTAINER_ID)',
        },
      },
      required: ['workspacePath', 'types'],
    },
  },
  {
    name: 'gtm_disable_built_in_variables',
    description: 'Disable built-in variables by type',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Built-in variable types to disable',
        },
      },
      required: ['workspacePath', 'types'],
    },
  },
  {
    name: 'gtm_revert_built_in_variable',
    description: 'Revert built-in variable changes for a single type in the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: { type: 'string', description: 'Workspace path' },
        type: { type: 'string', description: 'Built-in variable type to revert (e.g., PAGE_URL, EVENT, DEBUG_MODE)' },
      },
      required: ['workspacePath', 'type'],
    },
  },

  // === CLIENTS (Server-Side GTM) ===
  {
    name: 'gtm_list_clients',
    description: `List all clients in a Server-Side GTM workspace.

**⚠️ SERVER-SIDE ONLY**
Clients are only available in Server containers (usageContext: 'server').
Use \`gtm_get_container_info\` to check your container type.

**Purpose:** Clients receive and process incoming HTTP requests in Server-Side GTM.`,
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path (must be a Server-Side container)',
        },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'gtm_get_client',
    description: `Get full details of a specific client.

**⚠️ SERVER-SIDE ONLY**`,
    inputSchema: {
      type: 'object',
      properties: {
        clientPath: {
          type: 'string',
          description: 'Client path',
        },
      },
      required: ['clientPath'],
    },
  },
  {
    name: 'gtm_create_client',
    description: `Create a new client in a Server-Side container.

**⚠️ SERVER-SIDE ONLY**
Clients are only available in Server containers.

**Common Client Types:**
- \`gaaw_client\`: GA4 Web Client - receives GA4 measurement protocol hits
- \`adwords_client\`: Google Ads Client
- \`facebook_client\`: Facebook Conversions API Client
- \`measurement_client\`: Generic measurement protocol client

You can also use custom client template IDs (for gallery/custom templates).`,
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        name: {
          type: 'string',
          description: 'Client name',
        },
        type: {
          type: 'string',
          description: 'Client type/template ID (e.g., gaaw_client). Optional if templateReference resolves it.',
        },
        templateReference: TEMPLATE_REFERENCE_SCHEMA,
        parameter: {
          type: 'array',
          description: 'Client parameters (GTM API v2 Parameter[])',
          items: GTM_PARAMETER_SCHEMA,
        },
        priority: {
          type: 'number',
          description: 'Client priority (lower runs first)',
        },
      },
      required: ['workspacePath', 'name'],
    },
  },

  {
    name: 'gtm_update_client',
    description: 'Update a client (SERVER-SIDE ONLY; requires fingerprint from gtm_get_client)',
    inputSchema: {
      type: 'object',
      properties: {
        clientPath: { type: 'string', description: 'Client path' },
        fingerprint: { type: 'string', description: 'Fingerprint from gtm_get_client' },
        clientConfig: {
          type: 'object',
          description: 'Partial client fields to update (name, parameter, priority, etc.)',
          additionalProperties: true,
        },
      },
      required: ['clientPath', 'fingerprint', 'clientConfig'],
    },
  },

  {
    name: 'gtm_delete_client',
    description: `Delete a client (DESTRUCTIVE).

**⚠️ SERVER-SIDE ONLY**`,
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        clientPath: {
          type: 'string',
          description: 'Client path to delete',
        },
      },
      required: ['clientPath', 'confirm'],
    },
  },

  // === TRANSFORMATIONS (Server-Side GTM) ===
  {
    name: 'gtm_list_transformations',
    description: `List all transformations in a Server-Side GTM workspace.

**⚠️ SERVER-SIDE ONLY**
Transformations are only available in Server containers (usageContext: 'server').
Use \`gtm_get_container_info\` to check your container type.

**Purpose:** Transformations modify or enrich data before tags fire.`,
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path (must be a Server-Side container)',
        },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'gtm_get_transformation',
    description: `Get full details of a specific transformation.

**⚠️ SERVER-SIDE ONLY**`,
    inputSchema: {
      type: 'object',
      properties: {
        transformationPath: {
          type: 'string',
          description: 'Transformation path',
        },
      },
      required: ['transformationPath'],
    },
  },
  {
    name: 'gtm_create_transformation',
    description: `Create a new transformation in a Server-Side container.

**⚠️ SERVER-SIDE ONLY**
Transformations are only available in Server containers.

**Purpose:** Modify or enrich event data before tags process it.
Use a valid transformation template/type available in your container.

**Use Cases:**
- PII redaction
- Data enrichment
- Event transformation`,
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        name: {
          type: 'string',
          description: 'Transformation name',
        },
        type: {
          type: 'string',
          description: 'Transformation type/template ID available in your server container. Optional if templateReference resolves it.',
        },
        templateReference: TEMPLATE_REFERENCE_SCHEMA,
        parameter: {
          type: 'array',
          description: 'Transformation parameters (GTM API v2 Parameter[])',
          items: GTM_PARAMETER_SCHEMA,
        },
      },
      required: ['workspacePath', 'name'],
    },
  },
  {
    name: 'gtm_update_transformation',
    description: 'Update a transformation (SERVER-SIDE ONLY; requires fingerprint from gtm_get_transformation)',
    inputSchema: {
      type: 'object',
      properties: {
        transformationPath: { type: 'string', description: 'Transformation path' },
        fingerprint: { type: 'string', description: 'Fingerprint from gtm_get_transformation' },
        transformationConfig: {
          type: 'object',
          description: 'Partial transformation fields to update',
          additionalProperties: true,
        },
      },
      required: ['transformationPath', 'fingerprint', 'transformationConfig'],
    },
  },
  {
    name: 'gtm_delete_transformation',
    description: `Delete a transformation (DESTRUCTIVE).

**⚠️ SERVER-SIDE ONLY**`,
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        transformationPath: {
          type: 'string',
          description: 'Transformation path to delete',
        },
      },
      required: ['transformationPath', 'confirm'],
    },
  },

  // === ZONES (Consent Management) ===
  {
    name: 'gtm_list_zones',
    description: 'List all zones in a workspace (for consent management)',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'gtm_get_zone',
    description: 'Get full details of a specific zone',
    inputSchema: {
      type: 'object',
      properties: {
        zonePath: {
          type: 'string',
          description: 'Zone path',
        },
      },
      required: ['zonePath'],
    },
  },
  {
    name: 'gtm_create_zone',
    description: `Create a new zone for consent management.

**Boundary Examples:**
- Conditions use the same GTM API v2 \`Condition\` format as triggers (\`parameter\` with \`arg0\`/\`arg1\`).

**Type Restriction Examples:**
- Restrict to GA4 Event tag type id: \`{ "enable": true, "whitelistedTypeId": ["gaawe"] }\``,
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        name: {
          type: 'string',
          description: 'Zone name',
        },
        boundary: {
          type: 'object',
          description: `Zone boundary conditions - determines when this zone is active.

**Example for URL-based zone (API v2 Condition format):**
\`\`\`json
{
  "condition": [
    {
      "type": "contains",
      "parameter": [
        { "key": "arg0", "type": "template", "value": "{{Page URL}}" },
        { "key": "arg1", "type": "template", "value": "/checkout" }
      ]
    }
  ]
}
\`\`\`
`,
        },
        childContainer: {
          type: 'array',
          description: 'Child containers in this zone (optional)',
          items: {
            type: 'object',
            properties: {
              publicId: { type: 'string', description: 'Child container public ID (e.g., GTM-XXXXX)' },
            },
          },
        },
        typeRestriction: {
          type: 'object',
          description: `Tag type restrictions for this zone (optional).

**Schema (API v2):**
\`{ "enable": true, "whitelistedTypeId": ["gaawe","html"] }\`

**Example - whitelist only GA4 Event tags:**
\`\`\`json
{
  "enable": true,
  "whitelistedTypeId": ["gaawe"]
}
\`\`\``,
        },
      },
      required: ['workspacePath', 'name'],
    },
  },
  {
    name: 'gtm_update_zone',
    description: 'Update a zone (requires fingerprint from gtm_get_zone)',
    inputSchema: {
      type: 'object',
      properties: {
        zonePath: { type: 'string', description: 'Zone path' },
        fingerprint: { type: 'string', description: 'Fingerprint from gtm_get_zone' },
        zoneConfig: {
          type: 'object',
          description: 'Partial zone fields to update (name, boundary, typeRestriction, childContainer, etc.)',
          additionalProperties: true,
        },
      },
      required: ['zonePath', 'fingerprint', 'zoneConfig'],
    },
  },
  {
    name: 'gtm_delete_zone',
    description: 'Delete a zone (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        zonePath: {
          type: 'string',
          description: 'Zone path to delete',
        },
      },
      required: ['zonePath', 'confirm'],
    },
  },

  // === ENVIRONMENTS ===
  {
    name: 'gtm_list_environments',
    description: 'List all environments for a container (preview, staging, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: {
          type: 'string',
          description: 'Container path',
        },
      },
      required: ['containerPath'],
    },
  },
  {
    name: 'gtm_get_environment',
    description: 'Get full details of a specific environment',
    inputSchema: {
      type: 'object',
      properties: {
        environmentPath: {
          type: 'string',
          description: 'Environment path',
        },
      },
      required: ['environmentPath'],
    },
  },
  {
    name: 'gtm_create_environment',
    description: 'Create a new environment for testing versions',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: {
          type: 'string',
          description: 'Container path',
        },
        name: {
          type: 'string',
          description: 'Environment name',
        },
        description: {
          type: 'string',
          description: 'Environment description (optional)',
        },
        enableDebug: {
          type: 'boolean',
          description: 'Enable debug mode (optional)',
        },
      },
      required: ['containerPath', 'name'],
    },
  },
  {
    name: 'gtm_update_environment',
    description: 'Update an environment (requires fingerprint from gtm_get_environment)',
    inputSchema: {
      type: 'object',
      properties: {
        environmentPath: { type: 'string', description: 'Environment path' },
        fingerprint: { type: 'string', description: 'Fingerprint from gtm_get_environment' },
        environmentConfig: {
          type: 'object',
          description: 'Partial environment fields to update (name, description, enableDebug, containerVersionId)',
          additionalProperties: true,
        },
      },
      required: ['environmentPath', 'fingerprint', 'environmentConfig'],
    },
  },
  {
    name: 'gtm_delete_environment',
    description: 'Delete an environment (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        environmentPath: {
          type: 'string',
          description: 'Environment path to delete',
        },
      },
      required: ['environmentPath', 'confirm'],
    },
  },
  {
    name: 'gtm_reauthorize_environment',
    description: 'Regenerate authorization code for an environment',
    inputSchema: {
      type: 'object',
      properties: {
        environmentPath: {
          type: 'string',
          description: 'Environment path',
        },
      },
      required: ['environmentPath'],
    },
  },

  // === DESTINATIONS ===
  {
    name: 'gtm_list_destinations',
    description: 'List all destinations linked to a container',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: {
          type: 'string',
          description: 'Container path',
        },
      },
      required: ['containerPath'],
    },
  },
  {
    name: 'gtm_get_destination',
    description: 'Get full details of a specific destination',
    inputSchema: {
      type: 'object',
      properties: {
        destinationPath: {
          type: 'string',
          description: 'Destination path',
        },
      },
      required: ['destinationPath'],
    },
  },
  {
    name: 'gtm_link_destination',
    description: 'Link a destination (e.g., GA4 property) to a container',
    inputSchema: {
      type: 'object',
      properties: {
        containerPath: {
          type: 'string',
          description: 'Container path',
        },
        destinationId: {
          type: 'string',
          description: 'Destination ID (e.g., GA4 property ID)',
        },
      },
      required: ['containerPath', 'destinationId'],
    },
  },

  // === USER PERMISSIONS ===
  {
    name: 'gtm_list_user_permissions',
    description: 'List all user permissions for an account',
    inputSchema: {
      type: 'object',
      properties: {
        accountPath: {
          type: 'string',
          description: 'Account path (e.g., accounts/123)',
        },
      },
      required: ['accountPath'],
    },
  },
  {
    name: 'gtm_get_user_permission',
    description: 'Get full details of a specific user permission',
    inputSchema: {
      type: 'object',
      properties: {
        permissionPath: {
          type: 'string',
          description: 'Permission path',
        },
      },
      required: ['permissionPath'],
    },
  },
  {
    name: 'gtm_create_user_permission',
    description: 'Create a new user permission (grant access)',
    inputSchema: {
      type: 'object',
      properties: {
        accountPath: {
          type: 'string',
          description: 'Account path',
        },
        emailAddress: {
          type: 'string',
          description: 'User email address',
        },
        accountAccess: {
          type: 'object',
          description: 'Account-level access (permission: noAccess|read|admin|user)',
        },
        containerAccess: {
          type: 'array',
          description: 'Container-level access array [{containerId, permission}]',
        },
      },
      required: ['accountPath', 'emailAddress'],
    },
  },
  {
    name: 'gtm_update_user_permission',
    description: 'Update a user permission',
    inputSchema: {
      type: 'object',
      properties: {
        permissionPath: { type: 'string', description: 'Permission path' },
        permissionConfig: {
          type: 'object',
          description: 'Partial permission fields to update (accountAccess, containerAccess)',
          additionalProperties: true,
        },
      },
      required: ['permissionPath', 'permissionConfig'],
    },
  },
  {
    name: 'gtm_delete_user_permission',
    description: 'Delete a user permission (revoke access) - DESTRUCTIVE',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        permissionPath: {
          type: 'string',
          description: 'Permission path to delete',
        },
      },
      required: ['permissionPath', 'confirm'],
    },
  },

  // === GTAG CONFIG ===
  {
    name: 'gtm_list_gtag_configs',
    description: 'List all gtag configs in a workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
      },
      required: ['workspacePath'],
    },
  },
  {
    name: 'gtm_get_gtag_config',
    description: 'Get full details of a specific gtag config',
    inputSchema: {
      type: 'object',
      properties: {
        gtagConfigPath: {
          type: 'string',
          description: 'Gtag config path',
        },
      },
      required: ['gtagConfigPath'],
    },
  },
  {
    name: 'gtm_create_gtag_config',
    description: 'Create a new gtag config',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        type: {
          type: 'string',
          description: 'Gtag config type',
        },
        parameter: {
          type: 'array',
          description: 'Gtag config parameters (GTM API v2 Parameter[])',
          items: GTM_PARAMETER_SCHEMA,
        },
      },
      required: ['workspacePath', 'type'],
    },
  },
  {
    name: 'gtm_update_gtag_config',
    description: 'Update a gtag config (requires fingerprint from gtm_get_gtag_config)',
    inputSchema: {
      type: 'object',
      properties: {
        gtagConfigPath: { type: 'string', description: 'Gtag config path' },
        fingerprint: { type: 'string', description: 'Fingerprint from gtm_get_gtag_config' },
        gtagConfigData: {
          type: 'object',
          description: 'Partial gtag config fields to update (parameter)',
          additionalProperties: true,
        },
      },
      required: ['gtagConfigPath', 'fingerprint', 'gtagConfigData'],
    },
  },
  {
    name: 'gtm_delete_gtag_config',
    description: 'Delete a gtag config (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Required. Must be true to perform the deletion.',
        },
        gtagConfigPath: {
          type: 'string',
          description: 'Gtag config path to delete',
        },
      },
      required: ['gtagConfigPath', 'confirm'],
    },
  },
];

const CONFIRM_REQUIRED: Record<string, { action: string; note?: string }> = {
  // Container-level changes
  gtm_create_container: { action: 'create_container' },
  gtm_delete_container: { action: 'delete_container' },

  // Deletes
  gtm_delete_tag: { action: 'delete_tag' },
  gtm_delete_trigger: { action: 'delete_trigger' },
  gtm_delete_variable: { action: 'delete_variable' },
  gtm_delete_folder: { action: 'delete_folder' },
  gtm_delete_template: { action: 'delete_template' },
  gtm_delete_client: { action: 'delete_client' },
  gtm_delete_transformation: { action: 'delete_transformation' },
  gtm_delete_zone: { action: 'delete_zone' },
  gtm_delete_environment: { action: 'delete_environment' },
  gtm_delete_user_permission: { action: 'delete_user_permission' },
  gtm_delete_gtag_config: { action: 'delete_gtag_config' },
  gtm_delete_workspace: { action: 'delete_workspace' },
  gtm_delete_version: { action: 'delete_version' },
  gtm_undelete_version: { action: 'undelete_version' },

  // Potentially destructive merges
  gtm_sync_workspace: { action: 'sync_workspace', note: 'This pulls latest container changes into the workspace.' },

  // Publishing is destructive in the sense it affects production
  gtm_publish_version: { action: 'publish_version', note: 'This makes the version live in the container.' },
};

// Create the server
const server = new Server(
  {
    name: 'gtm-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Flag for authentication status
let isAuthenticated = false;

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Check authentication for all tools except gtm_status
  if (name !== 'gtm_status' && !isAuthenticated) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Not authenticated',
            message: 'GTM API is not authenticated. Run "npm run auth" in the gtm-mcp-server directory to set up authentication.',
            credentialsPath: getCredentialsPath(),
          }, null, 2),
        },
      ],
    };
  }

  try {
    // Hard safety gate for destructive actions. Tool descriptions mention confirmation, so enforce it.
    const confirmMeta = CONFIRM_REQUIRED[name];
    if (confirmMeta) {
      const confirm = (args as any)?.confirm;
      if (confirm !== true) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Confirmation required',
                  errorType: 'CONFIRMATION_REQUIRED',
                  tool: name,
                  action: confirmMeta.action,
                  note: confirmMeta.note,
                  help: 'Re-run the tool call with {"confirm": true} to proceed.',
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }

    let result: unknown;

    switch (name) {
      // === STATUS ===
      case 'gtm_status': {
        const status = rateLimiter.getStatus();
        result = {
          authenticated: isAuthenticated,
          hasCredentials: hasCredentials(),
          hasValidTokens: hasValidTokens(),
          rateLimits: status,
          credentialsPath: getCredentialsPath(),
        };
        break;
      }

      // === ACCOUNTS ===
      case 'gtm_list_accounts': {
        result = await accounts.listAccounts();
        break;
      }
      case 'gtm_get_account': {
        const { accountId } = args as { accountId: string };
        result = await accounts.getAccount(accountId);
        break;
      }

      // === CONTAINERS ===
      case 'gtm_list_containers': {
        const { accountId } = args as { accountId: string };
        result = await containers.listContainers(accountId);
        break;
      }

      case 'gtm_lookup_container': {
        const { publicId } = args as { publicId: string };
        result = await containers.lookupContainer(publicId);
        break;
      }

      case 'gtm_get_container': {
        const { containerPath } = args as { containerPath: string };
        result = await containers.getContainer(containerPath);
        break;
      }

      case 'gtm_create_container': {
        const { accountId, name: containerName, usageContext } = args as {
          accountId: string;
          name: string;
          usageContext: 'web' | 'server' | 'amp' | 'ios' | 'android';
        };
        result = await containers.createContainer(accountId, containerName, usageContext);
        break;
      }
      case 'gtm_delete_container': {
        const { containerPath } = args as { containerPath: string };
        result = { deleted: await containers.deleteContainer(containerPath), path: containerPath };
        break;
      }

      // === WORKSPACES ===
      case 'gtm_list_workspaces': {
        const { containerPath } = args as { containerPath: string };
        result = await workspaces.listWorkspaces(containerPath);
        break;
      }

      case 'gtm_create_workspace': {
        const { containerPath, name: wsName, description } = args as {
          containerPath: string;
          name: string;
          description?: string;
        };
        result = await workspaces.createWorkspace(containerPath, wsName, description);
        break;
      }

      case 'gtm_get_workspace': {
        const { workspacePath } = args as { workspacePath: string };
        result = await workspaces.getWorkspace(workspacePath);
        break;
      }

      case 'gtm_delete_workspace': {
        const { workspacePath } = args as { workspacePath: string };
        const deleteResult = await workspaces.deleteWorkspace(workspacePath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: workspacePath };
        } else {
          result = deleteResult;
        }
        break;
      }

      case 'gtm_sync_workspace': {
        const { workspacePath } = args as { workspacePath: string };
        result = await workspaces.syncWorkspace(workspacePath);
        break;
      }

      case 'gtm_get_workspace_status': {
        const { workspacePath } = args as { workspacePath: string };
        result = await workspaces.getWorkspaceStatus(workspacePath);
        break;
      }

      // === TAGS ===
      case 'gtm_list_tags': {
        const { workspacePath } = args as { workspacePath: string };
        const tagList = await tags.listTags(workspacePath);
        const analysis = tags.analyzeTagList(tagList);
        result = {
          summary: analysis,
          tags: tagList,
        };
        break;
      }

      case 'gtm_get_tag': {
        const { tagPath } = args as { tagPath: string };
        result = await tags.getTag(tagPath);
        break;
      }

      case 'gtm_create_tag': {
        const { workspacePath, name: tagName, type, firingTriggerId, parameter, templateReference } = args as {
          workspacePath: string;
          name: string;
          type: string;
          firingTriggerId?: string[];
          parameter?: unknown[];
          templateReference?: TemplateReference;
        };
        const tagPreflight = await preflightTemplateBasedCreate({
          workspacePath,
          entityKind: 'tag',
          type,
          parameter: parameter as tagmanager_v2.Schema$Parameter[] | undefined,
          templateReference,
        });
        if (!tagPreflight.ok) {
          result = tagPreflight.error;
          break;
        }
        result = await tags.createTag(workspacePath, {
          name: tagName,
          type: tagPreflight.type,
          firingTriggerId,
          parameter: tagPreflight.parameter,
        });
        break;
      }

      case 'gtm_update_tag': {
        const { tagPath, fingerprint, tagConfig } = args as {
          tagPath: string;
          fingerprint: string;
          tagConfig: any;
        };
        // GTM API often requires immutable fields like `type` to be present in update calls.
        // Merge the current entity's `type` when the caller omits it (LLM-friendly).
        const existing = await tags.getTag(tagPath);
        if (!existing) {
          result = { code: 'NOT_FOUND', message: 'Tag not found', tagPath };
          break;
        }
        const merged = { ...tagConfig } as any;
        if (merged.type === undefined && existing.type) merged.type = existing.type;
        result = await tags.updateTag(tagPath, merged, fingerprint);
        break;
      }

      case 'gtm_revert_tag': {
        const { tagPath } = args as { tagPath: string };
        result = await tags.revertTag(tagPath);
        break;
      }

      case 'gtm_delete_tag': {
        const { tagPath } = args as { tagPath: string };
        const deleteResult = await tags.deleteTag(tagPath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: tagPath };
        } else {
          result = deleteResult;
        }
        break;
      }

      // === TRIGGERS ===
      case 'gtm_list_triggers': {
        const { workspacePath } = args as { workspacePath: string };
        const triggerList = await triggers.listTriggers(workspacePath);
        const analysis = triggers.analyzeTriggerList(triggerList);
        result = {
          summary: analysis,
          triggers: triggerList,
        };
        break;
      }

      case 'gtm_get_trigger': {
        const { triggerPath } = args as { triggerPath: string };
        result = await triggers.getTrigger(triggerPath);
        break;
      }

      case 'gtm_create_trigger': {
        const { workspacePath, name: triggerName, type, filter, customEventFilter, autoEventFilter } = args as {
          workspacePath: string;
          name: string;
          type: string;
          filter?: unknown[];
          customEventFilter?: unknown[];
          autoEventFilter?: unknown[];
        };
        result = await triggers.createTrigger(workspacePath, {
          name: triggerName,
          type,
          filter: filter as tagmanager_v2.Schema$Condition[] | undefined,
          customEventFilter: customEventFilter as tagmanager_v2.Schema$Condition[] | undefined,
          autoEventFilter: autoEventFilter as tagmanager_v2.Schema$Condition[] | undefined,
        });
        break;
      }

      case 'gtm_update_trigger': {
        const { triggerPath, fingerprint, triggerConfig } = args as {
          triggerPath: string;
          fingerprint: string;
          triggerConfig: any;
        };
        const existing = await triggers.getTrigger(triggerPath);
        if (!existing) {
          result = { code: 'NOT_FOUND', message: 'Trigger not found', triggerPath };
          break;
        }
        const merged = { ...triggerConfig } as any;
        if (merged.type === undefined && existing.type) merged.type = existing.type;
        result = await triggers.updateTrigger(triggerPath, merged, fingerprint);
        break;
      }

      case 'gtm_delete_trigger': {
        const { triggerPath } = args as { triggerPath: string };
        const deleteResult = await triggers.deleteTrigger(triggerPath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: triggerPath };
        } else {
          result = deleteResult;
        }
        break;
      }

      // === VARIABLES ===
      case 'gtm_list_variables': {
        const { workspacePath } = args as { workspacePath: string };
        const variableList = await variables.listVariables(workspacePath);
        const analysis = variables.analyzeVariableList(variableList);
        result = {
          summary: analysis,
          variables: variableList,
        };
        break;
      }

      case 'gtm_get_variable': {
        const { variablePath } = args as { variablePath: string };
        result = await variables.getVariable(variablePath);
        break;
      }

      case 'gtm_create_variable': {
        const { workspacePath, name: varName, type, parameter, templateReference } = args as {
          workspacePath: string;
          name: string;
          type: string;
          parameter?: unknown[];
          templateReference?: TemplateReference;
        };
        const variablePreflight = await preflightTemplateBasedCreate({
          workspacePath,
          entityKind: 'variable',
          type,
          parameter: parameter as tagmanager_v2.Schema$Parameter[] | undefined,
          templateReference,
        });
        if (!variablePreflight.ok) {
          result = variablePreflight.error;
          break;
        }
        result = await variables.createVariable(workspacePath, {
          name: varName,
          type: variablePreflight.type,
          parameter: variablePreflight.parameter,
        });
        break;
      }

      case 'gtm_update_variable': {
        const { variablePath, fingerprint, variableConfig } = args as {
          variablePath: string;
          fingerprint: string;
          variableConfig: any;
        };
        const existing = await variables.getVariable(variablePath);
        if (!existing) {
          result = { code: 'NOT_FOUND', message: 'Variable not found', variablePath };
          break;
        }
        const merged = { ...variableConfig } as any;
        if (merged.type === undefined && existing.type) merged.type = existing.type;
        result = await variables.updateVariable(variablePath, merged, fingerprint);
        break;
      }

      case 'gtm_delete_variable': {
        const { variablePath } = args as { variablePath: string };
        const deleteResult = await variables.deleteVariable(variablePath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: variablePath };
        } else {
          result = deleteResult;
        }
        break;
      }

      // === FOLDERS ===
      case 'gtm_list_folders': {
        const { workspacePath } = args as { workspacePath: string };
        result = await folders.listFolders(workspacePath);
        break;
      }

      case 'gtm_create_folder': {
        const { workspacePath, name: folderName } = args as {
          workspacePath: string;
          name: string;
        };
        result = await folders.createFolder(workspacePath, folderName);
        break;
      }

      case 'gtm_get_folder': {
        const { folderPath } = args as { folderPath: string };
        result = await folders.getFolder(folderPath);
        break;
      }

      case 'gtm_update_folder': {
        const { folderPath, name: newName, fingerprint } = args as {
          folderPath: string;
          name: string;
          fingerprint: string;
        };
        result = await folders.updateFolder(folderPath, newName, fingerprint);
        break;
      }

      case 'gtm_delete_folder': {
        const { folderPath } = args as { folderPath: string };
        const deleteResult = await folders.deleteFolder(folderPath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: folderPath };
        } else {
          result = deleteResult;
        }
        break;
      }

      case 'gtm_get_folder_entities': {
        const { folderPath } = args as { folderPath: string };
        result = await folders.getFolderEntities(folderPath);
        break;
      }

      case 'gtm_move_entities_to_folder': {
        const { folderPath, entityIds } = args as {
          folderPath: string;
          entityIds: { tagId?: string[]; triggerId?: string[]; variableId?: string[] };
        };
        result = await folders.moveEntitiesToFolder(folderPath, entityIds);
        break;
      }

      // === TEMPLATES ===
      case 'gtm_list_templates': {
        const { workspacePath } = args as { workspacePath: string };
        const templateList = await templates.listTemplates(workspacePath);
        result = {
          total: templateList.length,
          templates: templateList,
        };
        break;
      }

      case 'gtm_get_template': {
        const { templatePath } = args as { templatePath: string };
        result = await templates.getTemplate(templatePath);
        break;
      }

      case 'gtm_create_template': {
        const { workspacePath, name: templateName, templateData } = args as {
          workspacePath: string;
          name: string;
          templateData: string;
        };
        result = await templates.createTemplate(workspacePath, {
          name: templateName,
          templateData,
        });
        break;
      }

      case 'gtm_import_template_from_gallery': {
        const { workspacePath, host, owner, repository, version } = args as {
          workspacePath: string;
          host?: string;
          owner: string;
          repository: string;
          version?: string;
        };
        result = await templates.importTemplateFromGallery(workspacePath, {
          owner,
          repository,
          version,
        });
        break;
      }

      case 'gtm_update_template': {
        const { templatePath, fingerprint, templateConfig } = args as {
          templatePath: string;
          fingerprint: string;
          templateConfig: any;
        };
        result = await templates.updateTemplate(templatePath, templateConfig, fingerprint);
        break;
      }

      case 'gtm_revert_template': {
        const { templatePath } = args as { templatePath: string };
        result = await templates.revertTemplate(templatePath);
        break;
      }

      case 'gtm_delete_template': {
        const { templatePath } = args as { templatePath: string };
        const deleteResult = await templates.deleteTemplate(templatePath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: templatePath };
        } else {
          result = deleteResult;
        }
        break;
      }

      // === VERSIONS ===
      case 'gtm_list_versions': {
        const { containerPath } = args as { containerPath: string };
        result = await versions.listVersionHeaders(containerPath);
        break;
      }

      case 'gtm_get_latest_version_header': {
        const { containerPath } = args as { containerPath: string };
        result = await versions.getLatestVersionHeader(containerPath);
        break;
      }

      case 'gtm_get_live_version': {
        const { containerPath } = args as { containerPath: string };
        const version = await versions.getLiveVersion(containerPath);
        if (version) {
          result = versions.getVersionContentSummary(version);
        } else {
          result = { error: 'No live version found' };
        }
        break;
      }

      case 'gtm_get_version': {
        const { versionPath } = args as { versionPath: string };
        const version = await versions.getVersion(versionPath);
        if (version) {
          result = versions.getVersionContentSummary(version);
        } else {
          result = { error: 'Version not found' };
        }
        break;
      }

      case 'gtm_create_version': {
        const { workspacePath, name: versionName, notes } = args as {
          workspacePath: string;
          name: string;
          notes?: string;
        };
        result = await versions.createVersion(workspacePath, versionName, notes);
        break;
      }

      case 'gtm_delete_version': {
        const { versionPath } = args as { versionPath: string };
        const deleteResult = await versions.deleteVersion(versionPath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: versionPath };
        } else {
          result = deleteResult;
        }
        break;
      }

      case 'gtm_undelete_version': {
        const { versionPath } = args as { versionPath: string };
        result = await versions.undeleteVersion(versionPath);
        break;
      }

      case 'gtm_publish_version': {
        const { versionPath } = args as { versionPath: string };
        const publishResult = await versions.publishVersion(versionPath);
        if (publishResult && typeof publishResult === 'object' && 'published' in publishResult) {
          result = { ...(publishResult as { published: boolean }), path: versionPath };
        } else {
          result = publishResult;
        }
        break;
      }

      case 'gtm_export_version': {
        const { versionPath } = args as { versionPath: string };
        const version = await versions.getVersion(versionPath);
        if (version) {
          result = versions.exportVersionAsJson(version);
        } else {
          result = { error: 'Version not found' };
        }
        break;
      }

      // === ANALYSIS ===
      case 'gtm_analyze_container': {
        const { containerPath } = args as { containerPath: string };

        // Get live version
        const version = await versions.getLiveVersion(containerPath);
        if (!version) {
          result = { error: 'No live version found for container' };
          break;
        }

        // Analyze
        const tagAnalysis = tags.analyzeTagList(
          (version.tag || []).map((t) => ({
            tagId: t.tagId || '',
            name: t.name || '',
            type: t.type || '',
            path: t.path || '',
            firingTriggerId: t.firingTriggerId || undefined,
            paused: t.paused || undefined,
          }))
        );

        const triggerAnalysis = triggers.analyzeTriggerList(
          (version.trigger || []).map((t) => ({
            triggerId: t.triggerId || '',
            name: t.name || '',
            type: t.type || '',
            path: t.path || '',
          }))
        );

        const variableAnalysis = variables.analyzeVariableList(
          (version.variable || []).map((v) => ({
            variableId: v.variableId || '',
            name: v.name || '',
            type: v.type || '',
            path: v.path || '',
          }))
        );

        result = {
          container: version.container?.name,
          publicId: version.container?.publicId,
          usageContext: version.container?.usageContext,
          tags: tagAnalysis,
          triggers: triggerAnalysis,
          variables: variableAnalysis,
          folders: version.folder?.length || 0,
          clients: version.client?.length || 0,
        };
        break;
      }

      // === HELPER TOOLS ===
      case 'gtm_get_container_info': {
        const { containerPath } = args as { containerPath: string };
        result = await getContainerInfo(containerPath);
        break;
      }

      case 'gtm_validate_trigger_config': {
        const { triggerConfig, containerType } = args as {
          triggerConfig: any;
          containerType: string;
        };
        result = validateTriggerConfigFull(triggerConfig, containerType);
        break;
      }

      case 'gtm_validate_tag_config': {
        const { workspacePath, tagConfig } = args as {
          workspacePath: string;
          tagConfig: {
            name: string;
            type?: string;
            parameter?: tagmanager_v2.Schema$Parameter[];
            templateReference?: TemplateReference;
          };
        };
        result = await validateEntityConfigStrict({
          workspacePath,
          entityKind: 'tag',
          name: tagConfig.name,
          type: tagConfig.type,
          parameter: tagConfig.parameter,
          templateReference: tagConfig.templateReference,
        });
        break;
      }

      case 'gtm_validate_variable_config': {
        const { workspacePath, variableConfig } = args as {
          workspacePath: string;
          variableConfig: {
            name: string;
            type?: string;
            parameter?: tagmanager_v2.Schema$Parameter[];
            templateReference?: TemplateReference;
          };
        };
        result = await validateEntityConfigStrict({
          workspacePath,
          entityKind: 'variable',
          name: variableConfig.name,
          type: variableConfig.type,
          parameter: variableConfig.parameter,
          templateReference: variableConfig.templateReference,
        });
        break;
      }

      case 'gtm_validate_client_config': {
        const { workspacePath, clientConfig } = args as {
          workspacePath: string;
          clientConfig: {
            name: string;
            type?: string;
            parameter?: tagmanager_v2.Schema$Parameter[];
            templateReference?: TemplateReference;
          };
        };
        result = await validateEntityConfigStrict({
          workspacePath,
          entityKind: 'client',
          name: clientConfig.name,
          type: clientConfig.type,
          parameter: clientConfig.parameter,
          templateReference: clientConfig.templateReference,
        });
        break;
      }

      case 'gtm_validate_transformation_config': {
        const { workspacePath, transformationConfig } = args as {
          workspacePath: string;
          transformationConfig: {
            name: string;
            type?: string;
            parameter?: tagmanager_v2.Schema$Parameter[];
            templateReference?: TemplateReference;
          };
        };
        result = await validateEntityConfigStrict({
          workspacePath,
          entityKind: 'transformation',
          name: transformationConfig.name,
          type: transformationConfig.type,
          parameter: transformationConfig.parameter,
          templateReference: transformationConfig.templateReference,
        });
        break;
      }

      case 'gtm_get_trigger_template': {
        const { templateType } = args as { templateType: string };
        result = getTriggerTemplate(templateType);
        break;
      }

      // === BUILT-IN VARIABLES ===
      case 'gtm_list_built_in_variables': {
        const { workspacePath } = args as { workspacePath: string };
        result = await builtInVariables.listBuiltInVariables(workspacePath);
        break;
      }

      case 'gtm_enable_built_in_variables': {
        const { workspacePath, types } = args as { workspacePath: string; types: string[] };
        result = await builtInVariables.createBuiltInVariables(workspacePath, types);
        break;
      }

      case 'gtm_disable_built_in_variables': {
        const { workspacePath, types } = args as { workspacePath: string; types: string[] };
        result = { disabled: await builtInVariables.deleteBuiltInVariables(workspacePath, types), types };
        break;
      }

      case 'gtm_revert_built_in_variable': {
        const { workspacePath, type } = args as { workspacePath: string; type: string };
        result = { reverted: await builtInVariables.revertBuiltInVariable(workspacePath, type), type };
        break;
      }

      // === CLIENTS (Server-Side GTM) ===
      case 'gtm_list_clients': {
        const { workspacePath } = args as { workspacePath: string };
        const clientList = await clients.listClients(workspacePath);
        const analysis = clients.analyzeClientList(clientList);
        result = {
          summary: analysis,
          clients: clientList,
        };
        break;
      }

      case 'gtm_get_client': {
        const { clientPath } = args as { clientPath: string };
        result = await clients.getClient(clientPath);
        break;
      }

      case 'gtm_create_client': {
        const { workspacePath, name: clientName, type, parameter, priority, templateReference } = args as {
          workspacePath: string;
          name: string;
          type: string;
          parameter?: unknown[];
          priority?: number;
          templateReference?: TemplateReference;
        };
        const clientPreflight = await preflightTemplateBasedCreate({
          workspacePath,
          entityKind: 'client',
          type,
          parameter: parameter as tagmanager_v2.Schema$Parameter[] | undefined,
          templateReference,
        });
        if (!clientPreflight.ok) {
          result = clientPreflight.error;
          break;
        }
        result = await clients.createClient(workspacePath, {
          name: clientName,
          type: clientPreflight.type,
          parameter: clientPreflight.parameter,
          priority,
        });
        break;
      }

      case 'gtm_update_client': {
        const { clientPath, fingerprint, clientConfig } = args as {
          clientPath: string;
          fingerprint: string;
          clientConfig: any;
        };
        result = await clients.updateClient(clientPath, clientConfig, fingerprint);
        break;
      }

      case 'gtm_delete_client': {
        const { clientPath } = args as { clientPath: string };
        const deleteResult = await clients.deleteClient(clientPath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: clientPath };
        } else {
          result = deleteResult;
        }
        break;
      }

      // === TRANSFORMATIONS (Server-Side GTM) ===
      case 'gtm_list_transformations': {
        const { workspacePath } = args as { workspacePath: string };
        result = await transformations.listTransformations(workspacePath);
        break;
      }

      case 'gtm_get_transformation': {
        const { transformationPath } = args as { transformationPath: string };
        result = await transformations.getTransformation(transformationPath);
        break;
      }

      case 'gtm_create_transformation': {
        const { workspacePath, name: transformationName, type, parameter, templateReference } = args as {
          workspacePath: string;
          name: string;
          type: string;
          parameter?: unknown[];
          templateReference?: TemplateReference;
        };
        const transformationPreflight = await preflightTemplateBasedCreate({
          workspacePath,
          entityKind: 'transformation',
          type,
          parameter: parameter as tagmanager_v2.Schema$Parameter[] | undefined,
          templateReference,
        });
        if (!transformationPreflight.ok) {
          result = transformationPreflight.error;
          break;
        }
        result = await transformations.createTransformation(workspacePath, {
          name: transformationName,
          type: transformationPreflight.type,
          parameter: transformationPreflight.parameter,
        });
        break;
      }

      case 'gtm_update_transformation': {
        const { transformationPath, fingerprint, transformationConfig } = args as {
          transformationPath: string;
          fingerprint: string;
          transformationConfig: any;
        };
        result = await transformations.updateTransformation(transformationPath, transformationConfig, fingerprint);
        break;
      }

      case 'gtm_delete_transformation': {
        const { transformationPath } = args as { transformationPath: string };
        const deleteResult = await transformations.deleteTransformation(transformationPath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: transformationPath };
        } else {
          result = deleteResult;
        }
        break;
      }

      // === ZONES (Consent Management) ===
      case 'gtm_list_zones': {
        const { workspacePath } = args as { workspacePath: string };
        result = await zones.listZones(workspacePath);
        break;
      }

      case 'gtm_get_zone': {
        const { zonePath } = args as { zonePath: string };
        result = await zones.getZone(zonePath);
        break;
      }

      case 'gtm_create_zone': {
        const { workspacePath, name: zoneName, boundary, childContainer, typeRestriction } = args as {
          workspacePath: string;
          name: string;
          boundary?: tagmanager_v2.Schema$ZoneBoundary;
          childContainer?: tagmanager_v2.Schema$ZoneChildContainer[];
          typeRestriction?: tagmanager_v2.Schema$ZoneTypeRestriction;
        };
        result = await zones.createZone(workspacePath, {
          name: zoneName,
          boundary,
          childContainer,
          typeRestriction,
        });
        break;
      }

      case 'gtm_update_zone': {
        const { zonePath, fingerprint, zoneConfig } = args as {
          zonePath: string;
          fingerprint: string;
          zoneConfig: any;
        };
        result = await zones.updateZone(zonePath, zoneConfig, fingerprint);
        break;
      }

      case 'gtm_delete_zone': {
        const { zonePath } = args as { zonePath: string };
        const deleteResult = await zones.deleteZone(zonePath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: zonePath };
        } else {
          result = deleteResult;
        }
        break;
      }

      // === ENVIRONMENTS ===
      case 'gtm_list_environments': {
        const { containerPath } = args as { containerPath: string };
        result = await environments.listEnvironments(containerPath);
        break;
      }

      case 'gtm_get_environment': {
        const { environmentPath } = args as { environmentPath: string };
        result = await environments.getEnvironment(environmentPath);
        break;
      }

      case 'gtm_create_environment': {
        const { containerPath, name: envName, description, enableDebug } = args as {
          containerPath: string;
          name: string;
          description?: string;
          enableDebug?: boolean;
        };
        result = await environments.createEnvironment(containerPath, {
          name: envName,
          description,
          enableDebug,
        });
        break;
      }

      case 'gtm_update_environment': {
        const { environmentPath, fingerprint, environmentConfig } = args as {
          environmentPath: string;
          fingerprint: string;
          environmentConfig: any;
        };
        result = await environments.updateEnvironment(environmentPath, environmentConfig, fingerprint);
        break;
      }

      case 'gtm_delete_environment': {
        const { environmentPath } = args as { environmentPath: string };
        result = { deleted: await environments.deleteEnvironment(environmentPath), path: environmentPath };
        break;
      }

      case 'gtm_reauthorize_environment': {
        const { environmentPath } = args as { environmentPath: string };
        result = await environments.reauthorizeEnvironment(environmentPath);
        break;
      }

      // === DESTINATIONS ===
      case 'gtm_list_destinations': {
        const { containerPath } = args as { containerPath: string };
        result = await destinations.listDestinations(containerPath);
        break;
      }

      case 'gtm_get_destination': {
        const { destinationPath } = args as { destinationPath: string };
        result = await destinations.getDestination(destinationPath);
        break;
      }

      case 'gtm_link_destination': {
        const { containerPath, destinationId } = args as { containerPath: string; destinationId: string };
        result = await destinations.linkDestination(containerPath, destinationId);
        break;
      }

      // === USER PERMISSIONS ===
      case 'gtm_list_user_permissions': {
        const { accountPath } = args as { accountPath: string };
        result = await userPermissions.listUserPermissions(accountPath);
        break;
      }

      case 'gtm_get_user_permission': {
        const { permissionPath } = args as { permissionPath: string };
        result = await userPermissions.getUserPermission(permissionPath);
        break;
      }

      case 'gtm_create_user_permission': {
        const { accountPath, emailAddress, accountAccess, containerAccess } = args as {
          accountPath: string;
          emailAddress: string;
          accountAccess?: tagmanager_v2.Schema$AccountAccess;
          containerAccess?: tagmanager_v2.Schema$ContainerAccess[];
        };
        result = await userPermissions.createUserPermission(accountPath, {
          emailAddress,
          accountAccess,
          containerAccess,
        });
        break;
      }

      case 'gtm_update_user_permission': {
        const { permissionPath, permissionConfig } = args as {
          permissionPath: string;
          permissionConfig: any;
        };
        result = await userPermissions.updateUserPermission(permissionPath, permissionConfig);
        break;
      }

      case 'gtm_delete_user_permission': {
        const { permissionPath } = args as { permissionPath: string };
        const deleteResult = await userPermissions.deleteUserPermission(permissionPath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: permissionPath };
        } else {
          result = deleteResult;
        }
        break;
      }

      // === GTAG CONFIG ===
      case 'gtm_list_gtag_configs': {
        const { workspacePath } = args as { workspacePath: string };
        result = await gtagConfig.listGtagConfigs(workspacePath);
        break;
      }

      case 'gtm_get_gtag_config': {
        const { gtagConfigPath } = args as { gtagConfigPath: string };
        result = await gtagConfig.getGtagConfig(gtagConfigPath);
        break;
      }

      case 'gtm_create_gtag_config': {
        const { workspacePath, type, parameter } = args as {
          workspacePath: string;
          type: string;
          parameter?: unknown[];
        };
        result = await gtagConfig.createGtagConfig(workspacePath, {
          type,
          parameter: parameter as tagmanager_v2.Schema$Parameter[] | undefined,
        });
        break;
      }

      case 'gtm_update_gtag_config': {
        const { gtagConfigPath, fingerprint, gtagConfigData } = args as {
          gtagConfigPath: string;
          fingerprint: string;
          gtagConfigData: any;
        };
        result = await gtagConfig.updateGtagConfig(gtagConfigPath, gtagConfigData, fingerprint);
        break;
      }

      case 'gtm_delete_gtag_config': {
        const { gtagConfigPath } = args as { gtagConfigPath: string };
        const deleteResult = await gtagConfig.deleteGtagConfig(gtagConfigPath);
        if (deleteResult && typeof deleteResult === 'object' && 'deleted' in deleteResult) {
          result = { ...(deleteResult as { deleted: boolean }), path: gtagConfigPath };
        } else {
          result = deleteResult;
        }
        break;
      }

      // === TAG HELPERS ===
      case 'gtm_get_tag_parameters': {
        const { tagType } = args as { tagType: string };
        result = getTagTypeInfo(tagType);
        if (!result) {
          result = {
            error: 'Unknown tag type',
            availableTypes: getAllTagTypes()
          };
        }
        break;
      }

      case 'gtm_list_tag_types': {
        const { workspacePath } = (args || {}) as { workspacePath?: string };
        const known = getAllTagTypes();
        if (!workspacePath) {
          result = known;
          break;
        }
        result = {
          known,
          availableInWorkspace: await getAvailableEntityTypes(workspacePath, 'tag'),
          workspacePath,
        };
        break;
      }

      // === VARIABLE HELPERS ===
      case 'gtm_get_variable_parameters': {
        const { variableType } = args as { variableType: string };
        result = getVariableParameters(variableType);
        break;
      }

      // === WORKFLOW GUIDES ===
      case 'gtm_list_workflows': {
        result = getAllWorkflows();
        break;
      }

      case 'gtm_get_workflow': {
        const { workflowId, measurementId } = args as { workflowId: string; measurementId?: string };
        result = customizeWorkflow(workflowId, measurementId);
        if (!result) {
          result = { error: 'Unknown workflow', availableWorkflows: getAllWorkflows() };
        }
        break;
      }

      // === SEARCH ===
      case 'gtm_search_entities': {
        const { workspacePath: wsPath, query, entityType } = args as {
          workspacePath: string;
          query: string;
          entityType?: 'all' | 'tags' | 'triggers' | 'variables';
        };
        result = await searchEntities(wsPath, { query, entityType: entityType || 'all', caseSensitive: false });
        break;
      }

      // === BEST PRACTICES ===
      case 'gtm_check_best_practices': {
        const { workspacePath: wsPath } = args as { workspacePath: string };
        result = await checkBestPractices(wsPath);
        break;
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Unknown tool: ${name}` }),
            },
          ],
        };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: errorMessage }),
        },
      ],
      isError: true,
    };
  }
});

// Import for type reference
import { tagmanager_v2 } from 'googleapis';

// Main entry point
async function main() {
  // Try to authenticate
  const authClient = await getAuthenticatedClient();

  if (authClient) {
    initTagManagerClient(authClient);
    isAuthenticated = true;
    console.error('GTM MCP Server started (authenticated)');
  } else {
    console.error('GTM MCP Server started (not authenticated - run "npm run auth" to authenticate)');
  }

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
