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
      required: ['accountId', 'name', 'usageContext'],
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
    description: 'Create a new tag',
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
          description: 'Tag type (e.g., gaawe, html, awct)',
        },
        firingTriggerId: {
          type: 'array',
          items: { type: 'string' },
          description: 'Trigger IDs that fire this tag',
        },
        parameter: {
          type: 'array',
          description: 'Tag parameters',
        },
      },
      required: ['workspacePath', 'name', 'type'],
    },
  },
  {
    name: 'gtm_delete_tag',
    description: 'Delete a tag (DESTRUCTIVE - requires confirmation)',
    inputSchema: {
      type: 'object',
      properties: {
        tagPath: {
          type: 'string',
          description: 'Tag path to delete',
        },
      },
      required: ['tagPath'],
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

**⚠️ IMPORTANT: Condition Format (API v2)**
All conditions use \`parameter\` array with \`arg0\`/\`arg1\` keys:
\`\`\`json
{
  "type": "contains",
  "parameter": [
    { "key": "arg0", "type": "template", "value": "{{Page URL}}" },
    { "key": "arg1", "type: "template", "value": "/checkout" }
  ]
}
\`\`\`

**Condition Types:** equals, contains, startsWith, endsWith, matchRegex, greater, greaterOrEquals, less, lessOrEquals, cssSelector, urlMatches

**When to use which filter:**
- \`filter\`: Trigger activation conditions (e.g., only on certain pages)
- \`customEventFilter\`: ONLY for customEvent type triggers (matches data layer event name)
- \`autoEventFilter\`: For auto-event triggers (element visibility, etc.)

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

**CRITICAL: Use parameter array with arg0/arg1 (API v2 format)**
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
            },
            required: ['type', 'parameter'],
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
    { "key": "arg0", "type": "template", "value": "{{Event}}" },
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
            },
            required: ['type', 'parameter'],
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
            },
            required: ['type', 'parameter'],
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
    name: 'gtm_delete_trigger',
    description: 'Delete a trigger (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        triggerPath: {
          type: 'string',
          description: 'Trigger path to delete',
        },
      },
      required: ['triggerPath'],
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
          description: 'Variable name (with {{}})',
        },
        type: {
          type: 'string',
          description: 'Variable type (e.g., c, jsm, v, aev, k, f, r, smm)',
        },
        parameter: {
          type: 'array',
          description: `Variable parameters as key-value pairs.

**Example format:**
\`\`\`json
[
  { "key": "cookieName", "value": "_ga" }
]
\`\`\`

**Type-specific parameters:**
- Constant (k): key="value", value="your fixed value"
- Cookie (c): key="cookieName", value="cookie name"
- URL Variable (v): key="urlComponent" (path/query/fragment), key="queryKey" for query params
- Data Layer (f): key="dataLayerName", value="variable name"
- JavaScript Macro (jsm): key="javascript", value="function body"
`,
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Parameter key' },
              value: { type: 'string', description: 'Parameter value' },
              type: { type: 'string', description: 'Parameter type (optional)' },
              list: { type: 'boolean', description: 'Is this a list parameter (optional)' },
            },
            required: ['key', 'value'],
          },
        },
      },
      required: ['workspacePath', 'name', 'type'],
    },
  },
  {
    name: 'gtm_delete_variable',
    description: 'Delete a variable (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        variablePath: {
          type: 'string',
          description: 'Variable path to delete',
        },
      },
      required: ['variablePath'],
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
    description: 'Import a template from the Community Template Gallery',
    inputSchema: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: 'Workspace path',
        },
        host: {
          type: 'string',
          description: 'Gallery host (usually "github.com")',
        },
        owner: {
          type: 'string',
          description: 'Repository owner/organization',
        },
        repository: {
          type: 'string',
          description: 'Repository name',
        },
        version: {
          type: 'string',
          description: 'Template version/tag',
        },
      },
      required: ['workspacePath', 'host', 'owner', 'repository', 'version'],
    },
  },
  {
    name: 'gtm_delete_template',
    description: 'Delete a template (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        templatePath: {
          type: 'string',
          description: 'Template path to delete',
        },
      },
      required: ['templatePath'],
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
    name: 'gtm_publish_version',
    description: 'Publish a version (make it live) - IMPORTANT ACTION requires confirmation',
    inputSchema: {
      type: 'object',
      properties: {
        versionPath: {
          type: 'string',
          description: 'Version path to publish',
        },
      },
      required: ['versionPath'],
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
    description: `List all known tag types with their categories and descriptions.`,
    inputSchema: {
      type: 'object',
      properties: {},
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
- \`custom\`: Custom client for specific needs

**Priority:** Lower numbers run first (e.g., priority 1 runs before priority 10)`,
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
          description: 'Client type (e.g., gaaw_client for GA4)',
        },
        parameter: {
          type: 'array',
          description: 'Client parameters',
        },
        priority: {
          type: 'number',
          description: 'Client priority (lower runs first)',
        },
      },
      required: ['workspacePath', 'name', 'type'],
    },
  },
  {
    name: 'gtm_delete_client',
    description: `Delete a client (DESTRUCTIVE).

**⚠️ SERVER-SIDE ONLY**`,
    inputSchema: {
      type: 'object',
      properties: {
        clientPath: {
          type: 'string',
          description: 'Client path to delete',
        },
      },
      required: ['clientPath'],
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
          description: 'Transformation type',
        },
        parameter: {
          type: 'array',
          description: 'Transformation parameters',
        },
      },
      required: ['workspacePath', 'name', 'type'],
    },
  },
  {
    name: 'gtm_delete_transformation',
    description: `Delete a transformation (DESTRUCTIVE).

**⚠️ SERVER-SIDE ONLY**`,
    inputSchema: {
      type: 'object',
      properties: {
        transformationPath: {
          type: 'string',
          description: 'Transformation path to delete',
        },
      },
      required: ['transformationPath'],
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
- By URL: \`{ "condition": [{ "type": "contains", "arg1": "{{Page URL}}", "arg2": "/checkout" }] }\`
- By Event: \`{ "condition": [{ "type": "equals", "arg1": "{{Event}}", "arg2": "consent_granted" }] }\`
- By Data Layer: \`{ "condition": [{ "type": "equals", "arg1": "{{consent}}", "arg2": "true" }] }\`

**Type Restriction Examples:**
- Restrict to GA4: \`{ "whitelist": [{ "type": "contains", "arg1": "{{_Type}}", "arg2": "gaawe" }] }\`
- Restrict to marketing tags: \`{ "whitelist": [{ "type": "contains", "arg1": "{{Tag Name}}", "arg2": "marketing" }] }\``,
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

**Example for URL-based zone:**
\`\`\`json
{
  "condition": [
    {
      "type": "contains",
      "arg1": "{{Page URL}}",
      "arg2": "/checkout"
    }
  ]
}
\`\`\`

**Example for event-based zone:**
\`\`\`json
{
  "condition": [
    {
      "type": "equals",
      "arg1": "{{Event}}",
      "arg2": "consent_granted"
    }
  ]
}
\`\`\``,
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

**Example - whitelist only GA4 tags:**
\`\`\`json
{
  "whitelist": [
    {
      "type": "contains",
      "arg1": "{{_Type}}",
      "arg2": "gaawe"
    }
  ]
}
\`\`\`

**Example - blacklist marketing tags:**
\`\`\`json
{
  "blacklist": [
    {
      "type": "contains",
      "arg1": "{{Tag Name}}",
      "arg2": "marketing"
    }
  ]
}
\`\`\``,
        },
      },
      required: ['workspacePath', 'name'],
    },
  },
  {
    name: 'gtm_delete_zone',
    description: 'Delete a zone (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        zonePath: {
          type: 'string',
          description: 'Zone path to delete',
        },
      },
      required: ['zonePath'],
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
    name: 'gtm_delete_environment',
    description: 'Delete an environment (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        environmentPath: {
          type: 'string',
          description: 'Environment path to delete',
        },
      },
      required: ['environmentPath'],
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
    name: 'gtm_delete_user_permission',
    description: 'Delete a user permission (revoke access) - DESTRUCTIVE',
    inputSchema: {
      type: 'object',
      properties: {
        permissionPath: {
          type: 'string',
          description: 'Permission path to delete',
        },
      },
      required: ['permissionPath'],
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
          description: 'Gtag config parameters',
        },
      },
      required: ['workspacePath', 'type'],
    },
  },
  {
    name: 'gtm_delete_gtag_config',
    description: 'Delete a gtag config (DESTRUCTIVE)',
    inputSchema: {
      type: 'object',
      properties: {
        gtagConfigPath: {
          type: 'string',
          description: 'Gtag config path to delete',
        },
      },
      required: ['gtagConfigPath'],
    },
  },
];

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
        const { workspacePath, name: tagName, type, firingTriggerId, parameter } = args as {
          workspacePath: string;
          name: string;
          type: string;
          firingTriggerId?: string[];
          parameter?: unknown[];
        };
        result = await tags.createTag(workspacePath, {
          name: tagName,
          type,
          firingTriggerId,
          parameter: parameter as tagmanager_v2.Schema$Parameter[] | undefined,
        });
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
        const { workspacePath, name: varName, type, parameter } = args as {
          workspacePath: string;
          name: string;
          type: string;
          parameter?: unknown[];
        };
        result = await variables.createVariable(workspacePath, {
          name: varName,
          type,
          parameter: parameter as tagmanager_v2.Schema$Parameter[] | undefined,
        });
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
          host: string;
          owner: string;
          repository: string;
          version: string;
        };
        result = await templates.importTemplateFromGallery(workspacePath, {
          host,
          owner,
          repository,
          version,
        });
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
        const { workspacePath, name: clientName, type, parameter, priority } = args as {
          workspacePath: string;
          name: string;
          type: string;
          parameter?: unknown[];
          priority?: number;
        };
        result = await clients.createClient(workspacePath, {
          name: clientName,
          type,
          parameter: parameter as tagmanager_v2.Schema$Parameter[] | undefined,
          priority,
        });
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
        const { workspacePath, name: transformationName, type, parameter } = args as {
          workspacePath: string;
          name: string;
          type: string;
          parameter?: unknown[];
        };
        result = await transformations.createTransformation(workspacePath, {
          name: transformationName,
          type,
          parameter: parameter as tagmanager_v2.Schema$Parameter[] | undefined,
        });
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
        result = getAllTagTypes();
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
