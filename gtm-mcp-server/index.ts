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

// Compact schemas - details in skill file
const GTM_PARAMETER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    type: { type: 'string', enum: ['template', 'boolean', 'integer', 'list', 'map', 'triggerReference', 'tagReference'] },
    value: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
    list: { type: 'array', items: { type: 'object' } },
    map: { type: 'array', items: { type: 'object' } },
  },
  required: ['key', 'type'],
  additionalProperties: true,
};

const TEMPLATE_REFERENCE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    owner: { type: 'string' },
    repository: { type: 'string' },
    version: { type: 'string' },
  },
  required: ['owner', 'repository'],
  additionalProperties: false,
};

const CONDITION_SCHEMA: Record<string, unknown> = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      type: { type: 'string' },
      parameter: { type: 'array', items: { type: 'object' } },
    },
    required: ['type'],
  },
};

// Define all available tools (compact - details in skill file)
const TOOLS: Tool[] = [
  // STATUS
  { name: 'gtm_status', description: 'Check API connection status', inputSchema: { type: 'object', properties: {} } },

  // ACCOUNTS
  { name: 'gtm_list_accounts', description: 'List all GTM accounts', inputSchema: { type: 'object', properties: {} } },
  { name: 'gtm_get_account', description: 'Get account details', inputSchema: { type: 'object', properties: { accountId: { type: 'string' } }, required: ['accountId'] } },

  // CONTAINERS
  { name: 'gtm_list_containers', description: 'List containers in account', inputSchema: { type: 'object', properties: { accountId: { type: 'string' } }, required: ['accountId'] } },
  { name: 'gtm_lookup_container', description: 'Find container by public ID', inputSchema: { type: 'object', properties: { publicId: { type: 'string' } }, required: ['publicId'] } },
  { name: 'gtm_get_container', description: 'Get container details', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' } }, required: ['containerPath'] } },
  { name: 'gtm_get_container_info', description: 'Get container type and supported features', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' } }, required: ['containerPath'] } },
  { name: 'gtm_create_container', description: 'Create new container (confirm required)', inputSchema: { type: 'object', properties: { accountId: { type: 'string' }, name: { type: 'string' }, usageContext: { type: 'string', enum: ['web', 'server', 'amp', 'ios', 'android'] }, confirm: { type: 'boolean' } }, required: ['accountId', 'name', 'usageContext', 'confirm'] } },
  { name: 'gtm_delete_container', description: 'Delete container (confirm required)', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['containerPath', 'confirm'] } },

  // WORKSPACES
  { name: 'gtm_list_workspaces', description: 'List workspaces in container', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' } }, required: ['containerPath'] } },
  { name: 'gtm_get_workspace', description: 'Get workspace details', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_get_workspace_status', description: 'Get pending changes and conflicts', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_create_workspace', description: 'Create workspace', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' } }, required: ['containerPath', 'name'] } },
  { name: 'gtm_sync_workspace', description: 'Sync workspace with latest version (confirm required)', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['workspacePath', 'confirm'] } },
  { name: 'gtm_delete_workspace', description: 'Delete workspace (confirm required)', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['workspacePath', 'confirm'] } },

  // TAGS
  { name: 'gtm_list_tags', description: 'List tags in workspace', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_get_tag', description: 'Get tag details', inputSchema: { type: 'object', properties: { tagPath: { type: 'string' } }, required: ['tagPath'] } },
  { name: 'gtm_create_tag', description: 'Create tag. See gtm_get_tag_parameters for types.', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, templateReference: TEMPLATE_REFERENCE_SCHEMA, firingTriggerId: { type: 'array', items: { type: 'string' } }, parameter: { type: 'array', items: GTM_PARAMETER_SCHEMA } }, required: ['workspacePath', 'name'] } },
  { name: 'gtm_update_tag', description: 'Update tag (needs fingerprint)', inputSchema: { type: 'object', properties: { tagPath: { type: 'string' }, fingerprint: { type: 'string' }, tagConfig: { type: 'object', additionalProperties: true } }, required: ['tagPath', 'fingerprint', 'tagConfig'] } },
  { name: 'gtm_revert_tag', description: 'Revert tag changes', inputSchema: { type: 'object', properties: { tagPath: { type: 'string' } }, required: ['tagPath'] } },
  { name: 'gtm_delete_tag', description: 'Delete tag (confirm required)', inputSchema: { type: 'object', properties: { tagPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['tagPath', 'confirm'] } },

  // TRIGGERS
  { name: 'gtm_list_triggers', description: 'List triggers in workspace', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_get_trigger', description: 'Get trigger details', inputSchema: { type: 'object', properties: { triggerPath: { type: 'string' } }, required: ['triggerPath'] } },
  { name: 'gtm_create_trigger', description: 'Create trigger. See gtm_get_trigger_template for examples.', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, filter: CONDITION_SCHEMA, customEventFilter: CONDITION_SCHEMA, autoEventFilter: CONDITION_SCHEMA, parentFolderId: { type: 'string' } }, required: ['workspacePath', 'name', 'type'] } },
  { name: 'gtm_update_trigger', description: 'Update trigger (needs fingerprint)', inputSchema: { type: 'object', properties: { triggerPath: { type: 'string' }, fingerprint: { type: 'string' }, triggerConfig: { type: 'object', additionalProperties: true } }, required: ['triggerPath', 'fingerprint', 'triggerConfig'] } },
  { name: 'gtm_delete_trigger', description: 'Delete trigger (confirm required)', inputSchema: { type: 'object', properties: { triggerPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['triggerPath', 'confirm'] } },

  // VARIABLES
  { name: 'gtm_list_variables', description: 'List variables in workspace', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_get_variable', description: 'Get variable details', inputSchema: { type: 'object', properties: { variablePath: { type: 'string' } }, required: ['variablePath'] } },
  { name: 'gtm_create_variable', description: 'Create variable. See gtm_get_variable_parameters for types.', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, templateReference: TEMPLATE_REFERENCE_SCHEMA, parameter: { type: 'array', items: GTM_PARAMETER_SCHEMA } }, required: ['workspacePath', 'name'] } },
  { name: 'gtm_update_variable', description: 'Update variable (needs fingerprint)', inputSchema: { type: 'object', properties: { variablePath: { type: 'string' }, fingerprint: { type: 'string' }, variableConfig: { type: 'object', additionalProperties: true } }, required: ['variablePath', 'fingerprint', 'variableConfig'] } },
  { name: 'gtm_delete_variable', description: 'Delete variable (confirm required)', inputSchema: { type: 'object', properties: { variablePath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['variablePath', 'confirm'] } },

  // FOLDERS
  { name: 'gtm_list_folders', description: 'List folders in workspace', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_get_folder', description: 'Get folder details', inputSchema: { type: 'object', properties: { folderPath: { type: 'string' } }, required: ['folderPath'] } },
  { name: 'gtm_get_folder_entities', description: 'Get entities in folder', inputSchema: { type: 'object', properties: { folderPath: { type: 'string' } }, required: ['folderPath'] } },
  { name: 'gtm_create_folder', description: 'Create folder', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, name: { type: 'string' } }, required: ['workspacePath', 'name'] } },
  { name: 'gtm_update_folder', description: 'Update folder name (needs fingerprint)', inputSchema: { type: 'object', properties: { folderPath: { type: 'string' }, fingerprint: { type: 'string' }, name: { type: 'string' } }, required: ['folderPath', 'fingerprint', 'name'] } },
  { name: 'gtm_delete_folder', description: 'Delete folder (confirm required)', inputSchema: { type: 'object', properties: { folderPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['folderPath', 'confirm'] } },
  { name: 'gtm_move_entities_to_folder', description: 'Move entities to folder', inputSchema: { type: 'object', properties: { folderPath: { type: 'string' }, entityIds: { type: 'object', properties: { tagId: { type: 'array', items: { type: 'string' } }, triggerId: { type: 'array', items: { type: 'string' } }, variableId: { type: 'array', items: { type: 'string' } } } } }, required: ['folderPath', 'entityIds'] } },

  // TEMPLATES
  { name: 'gtm_list_templates', description: 'List custom templates', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_get_template', description: 'Get template details', inputSchema: { type: 'object', properties: { templatePath: { type: 'string' } }, required: ['templatePath'] } },
  { name: 'gtm_create_template', description: 'Create custom template', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, name: { type: 'string' }, templateData: { type: 'string' } }, required: ['workspacePath', 'name', 'templateData'] } },
  { name: 'gtm_import_template_from_gallery', description: 'Import template from Community Gallery', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, owner: { type: 'string' }, repository: { type: 'string' }, version: { type: 'string' } }, required: ['workspacePath', 'owner', 'repository'] } },
  { name: 'gtm_update_template', description: 'Update template (needs fingerprint)', inputSchema: { type: 'object', properties: { templatePath: { type: 'string' }, fingerprint: { type: 'string' }, templateConfig: { type: 'object', additionalProperties: true } }, required: ['templatePath', 'fingerprint', 'templateConfig'] } },
  { name: 'gtm_revert_template', description: 'Revert template changes', inputSchema: { type: 'object', properties: { templatePath: { type: 'string' } }, required: ['templatePath'] } },
  { name: 'gtm_delete_template', description: 'Delete template (confirm required)', inputSchema: { type: 'object', properties: { templatePath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['templatePath', 'confirm'] } },

  // VERSIONS
  { name: 'gtm_list_versions', description: 'List container versions', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' } }, required: ['containerPath'] } },
  { name: 'gtm_get_version', description: 'Get version details', inputSchema: { type: 'object', properties: { versionPath: { type: 'string' } }, required: ['versionPath'] } },
  { name: 'gtm_get_latest_version_header', description: 'Get latest version metadata', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' } }, required: ['containerPath'] } },
  { name: 'gtm_get_live_version', description: 'Get currently published version', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' } }, required: ['containerPath'] } },
  { name: 'gtm_create_version', description: 'Create version from workspace', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' } }, required: ['workspacePath', 'name'] } },
  { name: 'gtm_publish_version', description: 'Publish version (confirm required)', inputSchema: { type: 'object', properties: { versionPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['versionPath', 'confirm'] } },
  { name: 'gtm_delete_version', description: 'Delete version (confirm required)', inputSchema: { type: 'object', properties: { versionPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['versionPath', 'confirm'] } },
  { name: 'gtm_undelete_version', description: 'Undelete version (confirm required)', inputSchema: { type: 'object', properties: { versionPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['versionPath', 'confirm'] } },
  { name: 'gtm_export_version', description: 'Export version as JSON', inputSchema: { type: 'object', properties: { versionPath: { type: 'string' } }, required: ['versionPath'] } },

  // BUILT-IN VARIABLES
  { name: 'gtm_list_built_in_variables', description: 'List enabled built-in variables', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_enable_built_in_variables', description: 'Enable built-in variables', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, types: { type: 'array', items: { type: 'string' } } }, required: ['workspacePath', 'types'] } },
  { name: 'gtm_disable_built_in_variables', description: 'Disable built-in variables (confirm required)', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, types: { type: 'array', items: { type: 'string' } }, confirm: { type: 'boolean' } }, required: ['workspacePath', 'types'] } },
  { name: 'gtm_revert_built_in_variable', description: 'Revert built-in variable changes', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, type: { type: 'string' } }, required: ['workspacePath', 'type'] } },

  // SERVER-SIDE: CLIENTS
  { name: 'gtm_list_clients', description: 'List clients (server-side only)', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_get_client', description: 'Get client details', inputSchema: { type: 'object', properties: { clientPath: { type: 'string' } }, required: ['clientPath'] } },
  { name: 'gtm_create_client', description: 'Create client (server-side only)', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, templateReference: TEMPLATE_REFERENCE_SCHEMA, parameter: { type: 'array', items: GTM_PARAMETER_SCHEMA }, priority: { type: 'number' } }, required: ['workspacePath', 'name'] } },
  { name: 'gtm_update_client', description: 'Update client (needs fingerprint)', inputSchema: { type: 'object', properties: { clientPath: { type: 'string' }, fingerprint: { type: 'string' }, clientConfig: { type: 'object', additionalProperties: true } }, required: ['clientPath', 'fingerprint', 'clientConfig'] } },
  { name: 'gtm_delete_client', description: 'Delete client (confirm required)', inputSchema: { type: 'object', properties: { clientPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['clientPath', 'confirm'] } },

  // SERVER-SIDE: TRANSFORMATIONS
  { name: 'gtm_list_transformations', description: 'List transformations (server-side only)', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_get_transformation', description: 'Get transformation details', inputSchema: { type: 'object', properties: { transformationPath: { type: 'string' } }, required: ['transformationPath'] } },
  { name: 'gtm_create_transformation', description: 'Create transformation (server-side only)', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, templateReference: TEMPLATE_REFERENCE_SCHEMA, parameter: { type: 'array', items: GTM_PARAMETER_SCHEMA } }, required: ['workspacePath', 'name'] } },
  { name: 'gtm_update_transformation', description: 'Update transformation (needs fingerprint)', inputSchema: { type: 'object', properties: { transformationPath: { type: 'string' }, fingerprint: { type: 'string' }, transformationConfig: { type: 'object', additionalProperties: true } }, required: ['transformationPath', 'fingerprint', 'transformationConfig'] } },
  { name: 'gtm_delete_transformation', description: 'Delete transformation (confirm required)', inputSchema: { type: 'object', properties: { transformationPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['transformationPath', 'confirm'] } },

  // ZONES
  { name: 'gtm_list_zones', description: 'List zones (consent management)', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_get_zone', description: 'Get zone details', inputSchema: { type: 'object', properties: { zonePath: { type: 'string' } }, required: ['zonePath'] } },
  { name: 'gtm_create_zone', description: 'Create zone for consent management', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, name: { type: 'string' }, boundary: { type: 'object' }, typeRestriction: { type: 'object' }, childContainer: { type: 'array', items: { type: 'object', properties: { publicId: { type: 'string' } } } } }, required: ['workspacePath', 'name'] } },
  { name: 'gtm_update_zone', description: 'Update zone (needs fingerprint)', inputSchema: { type: 'object', properties: { zonePath: { type: 'string' }, fingerprint: { type: 'string' }, zoneConfig: { type: 'object', additionalProperties: true } }, required: ['zonePath', 'fingerprint', 'zoneConfig'] } },
  { name: 'gtm_delete_zone', description: 'Delete zone (confirm required)', inputSchema: { type: 'object', properties: { zonePath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['zonePath', 'confirm'] } },

  // ENVIRONMENTS
  { name: 'gtm_list_environments', description: 'List environments', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' } }, required: ['containerPath'] } },
  { name: 'gtm_get_environment', description: 'Get environment details', inputSchema: { type: 'object', properties: { environmentPath: { type: 'string' } }, required: ['environmentPath'] } },
  { name: 'gtm_create_environment', description: 'Create environment', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, enableDebug: { type: 'boolean' } }, required: ['containerPath', 'name'] } },
  { name: 'gtm_update_environment', description: 'Update environment (needs fingerprint)', inputSchema: { type: 'object', properties: { environmentPath: { type: 'string' }, fingerprint: { type: 'string' }, environmentConfig: { type: 'object', additionalProperties: true } }, required: ['environmentPath', 'fingerprint', 'environmentConfig'] } },
  { name: 'gtm_delete_environment', description: 'Delete environment (confirm required)', inputSchema: { type: 'object', properties: { environmentPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['environmentPath', 'confirm'] } },
  { name: 'gtm_reauthorize_environment', description: 'Regenerate environment authorization', inputSchema: { type: 'object', properties: { environmentPath: { type: 'string' } }, required: ['environmentPath'] } },

  // DESTINATIONS
  { name: 'gtm_list_destinations', description: 'List linked destinations', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' } }, required: ['containerPath'] } },
  { name: 'gtm_get_destination', description: 'Get destination details', inputSchema: { type: 'object', properties: { destinationPath: { type: 'string' } }, required: ['destinationPath'] } },
  { name: 'gtm_link_destination', description: 'Link destination to container', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' }, destinationId: { type: 'string' } }, required: ['containerPath', 'destinationId'] } },

  // USER PERMISSIONS
  { name: 'gtm_list_user_permissions', description: 'List user permissions', inputSchema: { type: 'object', properties: { accountPath: { type: 'string' } }, required: ['accountPath'] } },
  { name: 'gtm_get_user_permission', description: 'Get user permission details', inputSchema: { type: 'object', properties: { permissionPath: { type: 'string' } }, required: ['permissionPath'] } },
  { name: 'gtm_create_user_permission', description: 'Grant user access', inputSchema: { type: 'object', properties: { accountPath: { type: 'string' }, emailAddress: { type: 'string' }, accountAccess: { type: 'object' }, containerAccess: { type: 'array' } }, required: ['accountPath', 'emailAddress'] } },
  { name: 'gtm_update_user_permission', description: 'Update user permission', inputSchema: { type: 'object', properties: { permissionPath: { type: 'string' }, permissionConfig: { type: 'object', additionalProperties: true } }, required: ['permissionPath', 'permissionConfig'] } },
  { name: 'gtm_delete_user_permission', description: 'Revoke user access (confirm required)', inputSchema: { type: 'object', properties: { permissionPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['permissionPath', 'confirm'] } },

  // GTAG CONFIG
  { name: 'gtm_list_gtag_configs', description: 'List gtag configs', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_get_gtag_config', description: 'Get gtag config details', inputSchema: { type: 'object', properties: { gtagConfigPath: { type: 'string' } }, required: ['gtagConfigPath'] } },
  { name: 'gtm_create_gtag_config', description: 'Create gtag config', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, type: { type: 'string' }, parameter: { type: 'array', items: GTM_PARAMETER_SCHEMA } }, required: ['workspacePath', 'type'] } },
  { name: 'gtm_update_gtag_config', description: 'Update gtag config (needs fingerprint)', inputSchema: { type: 'object', properties: { gtagConfigPath: { type: 'string' }, fingerprint: { type: 'string' }, gtagConfigData: { type: 'object', additionalProperties: true } }, required: ['gtagConfigPath', 'fingerprint', 'gtagConfigData'] } },
  { name: 'gtm_delete_gtag_config', description: 'Delete gtag config (confirm required)', inputSchema: { type: 'object', properties: { gtagConfigPath: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['gtagConfigPath', 'confirm'] } },

  // ANALYSIS & HELPERS
  { name: 'gtm_analyze_container', description: 'Analyze container summary', inputSchema: { type: 'object', properties: { containerPath: { type: 'string' } }, required: ['containerPath'] } },
  { name: 'gtm_check_best_practices', description: 'Check GTM best practices', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } }, required: ['workspacePath'] } },
  { name: 'gtm_search_entities', description: 'Search tags/triggers/variables', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, query: { type: 'string' }, entityType: { type: 'string', enum: ['all', 'tags', 'triggers', 'variables'], default: 'all' } }, required: ['workspacePath', 'query'] } },

  // VALIDATION
  { name: 'gtm_validate_tag_config', description: 'Validate tag config before create', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, tagConfig: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, parameter: { type: 'array' }, templateReference: TEMPLATE_REFERENCE_SCHEMA }, required: ['name'] } }, required: ['workspacePath', 'tagConfig'] } },
  { name: 'gtm_validate_trigger_config', description: 'Validate trigger config before create', inputSchema: { type: 'object', properties: { triggerConfig: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, filter: { type: 'array' }, customEventFilter: { type: 'array' }, autoEventFilter: { type: 'array' } } }, containerType: { type: 'string', enum: ['web', 'server', 'amp', 'ios', 'android'] } }, required: ['triggerConfig', 'containerType'] } },
  { name: 'gtm_validate_variable_config', description: 'Validate variable config before create', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, variableConfig: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, parameter: { type: 'array' }, templateReference: TEMPLATE_REFERENCE_SCHEMA }, required: ['name'] } }, required: ['workspacePath', 'variableConfig'] } },
  { name: 'gtm_validate_client_config', description: 'Validate client config (server-side)', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, clientConfig: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, parameter: { type: 'array' }, templateReference: TEMPLATE_REFERENCE_SCHEMA }, required: ['name'] } }, required: ['workspacePath', 'clientConfig'] } },
  { name: 'gtm_validate_transformation_config', description: 'Validate transformation config (server-side)', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' }, transformationConfig: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, parameter: { type: 'array' }, templateReference: TEMPLATE_REFERENCE_SCHEMA }, required: ['name'] } }, required: ['workspacePath', 'transformationConfig'] } },

  // TEMPLATES & WORKFLOWS
  { name: 'gtm_get_tag_parameters', description: 'Get parameters for tag type', inputSchema: { type: 'object', properties: { tagType: { type: 'string' } }, required: ['tagType'] } },
  { name: 'gtm_list_tag_types', description: 'List all tag types', inputSchema: { type: 'object', properties: { workspacePath: { type: 'string' } } } },
  { name: 'gtm_get_variable_parameters', description: 'Get parameters for variable type', inputSchema: { type: 'object', properties: { variableType: { type: 'string' } }, required: ['variableType'] } },
  { name: 'gtm_get_trigger_template', description: 'Get trigger configuration template', inputSchema: { type: 'object', properties: { templateType: { type: 'string', enum: ['pageview-all', 'pageview-filtered', 'click-download', 'custom-event-purchase', 'custom-event-generic', 'form-submission-contact', 'link-click-external', 'timer-30s', 'scroll-depth-50', 'element-visibility', 'server-always', 'server-custom'] } }, required: ['templateType'] } },
  { name: 'gtm_list_workflows', description: 'List available workflow guides', inputSchema: { type: 'object', properties: {} } },
  { name: 'gtm_get_workflow', description: 'Get workflow guide', inputSchema: { type: 'object', properties: { workflowId: { type: 'string', enum: ['setup_ga4', 'setup_conversion_tracking', 'setup_form_tracking', 'setup_scroll_tracking', 'setup_link_click_tracking', 'setup_ecommerce_tracking'] }, measurementId: { type: 'string' } }, required: ['workflowId'] } },
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
