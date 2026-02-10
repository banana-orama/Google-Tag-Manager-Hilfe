/**
 * Search utilities for GTM entities
 */

import { listTags } from '../tools/tags.js';
import { listTriggers } from '../tools/triggers.js';
import { listVariables } from '../tools/variables.js';
import { listFolders } from '../tools/folders.js';

export interface SearchResult {
  type: 'tag' | 'trigger' | 'variable' | 'folder';
  id: string;
  name: string;
  path: string;
  additionalInfo?: Record<string, any>;
  matchReason: string;
}

export interface SearchOptions {
  query: string;
  entityType: 'all' | 'tags' | 'triggers' | 'variables' | 'folders';
  caseSensitive?: boolean;
}

export async function searchEntities(
  workspacePath: string, 
  options: SearchOptions
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const caseSensitive = options.caseSensitive || false;
  const query = caseSensitive ? options.query : options.query.toLowerCase();

  // Parse query for special filters
  const typeMatch = query.match(/type:(\w+)/);
  const typeFilter = typeMatch ? typeMatch[1].toLowerCase() : null;
  const searchTerm = query.replace(/type:\w+\s*/g, '').trim();

  // Search tags
  if (options.entityType === 'all' || options.entityType === 'tags') {
    try {
      const tags = await listTags(workspacePath);
      for (const tag of tags) {
        const nameMatch = caseSensitive
          ? tag.name.includes(searchTerm) || searchTerm === ''
          : tag.name.toLowerCase().includes(searchTerm) || searchTerm === '';
        
        const typeMatches = !typeFilter || tag.type.toLowerCase().includes(typeFilter);
        
        if (nameMatch && typeMatches) {
          results.push({
            type: 'tag',
            id: tag.tagId,
            name: tag.name,
            path: tag.path,
            additionalInfo: {
              type: tag.type,
              paused: tag.paused,
              hasTriggers: tag.firingTriggerId && tag.firingTriggerId.length > 0,
            },
            matchReason: typeFilter 
              ? `Type: ${tag.type}` 
              : searchTerm 
                ? `Name contains: "${searchTerm}"`
                : 'All tags',
          });
        }
      }
    } catch (error) {
      console.error('Error searching tags:', error);
    }
  }

  // Search triggers
  if (options.entityType === 'all' || options.entityType === 'triggers') {
    try {
      const triggers = await listTriggers(workspacePath);
      for (const trigger of triggers) {
        const nameMatch = caseSensitive
          ? trigger.name.includes(searchTerm) || searchTerm === ''
          : trigger.name.toLowerCase().includes(searchTerm) || searchTerm === '';
        
        const typeMatches = !typeFilter || trigger.type.toLowerCase().includes(typeFilter);
        
        if (nameMatch && typeMatches) {
          results.push({
            type: 'trigger',
            id: trigger.triggerId,
            name: trigger.name,
            path: trigger.path,
            additionalInfo: {
              type: trigger.type,
            },
            matchReason: typeFilter 
              ? `Type: ${trigger.type}` 
              : searchTerm 
                ? `Name contains: "${searchTerm}"`
                : 'All triggers',
          });
        }
      }
    } catch (error) {
      console.error('Error searching triggers:', error);
    }
  }

  // Search variables
  if (options.entityType === 'all' || options.entityType === 'variables') {
    try {
      const variables = await listVariables(workspacePath);
      for (const variable of variables) {
        const nameMatch = caseSensitive
          ? variable.name.includes(searchTerm) || searchTerm === ''
          : variable.name.toLowerCase().includes(searchTerm) || searchTerm === '';
        
        const typeMatches = !typeFilter || variable.type.toLowerCase().includes(typeFilter);
        
        if (nameMatch && typeMatches) {
          results.push({
            type: 'variable',
            id: variable.variableId,
            name: variable.name,
            path: variable.path,
            additionalInfo: {
              type: variable.type,
            },
            matchReason: typeFilter 
              ? `Type: ${variable.type}` 
              : searchTerm 
                ? `Name contains: "${searchTerm}"`
                : 'All variables',
          });
        }
      }
    } catch (error) {
      console.error('Error searching variables:', error);
    }
  }

  // Search folders
  if (options.entityType === 'all' || options.entityType === 'folders') {
    try {
      const folders = await listFolders(workspacePath);
      for (const folder of folders) {
        const nameMatch = caseSensitive
          ? folder.name.includes(searchTerm) || searchTerm === ''
          : folder.name.toLowerCase().includes(searchTerm) || searchTerm === '';
        
        if (nameMatch) {
          results.push({
            type: 'folder',
            id: folder.folderId,
            name: folder.name,
            path: folder.path,
            matchReason: searchTerm 
              ? `Name contains: "${searchTerm}"`
              : 'All folders',
          });
        }
      }
    } catch (error) {
      console.error('Error searching folders:', error);
    }
  }

  return results;
}

export function parseSearchQuery(query: string): {
  searchTerm: string;
  typeFilter: string | null;
  filters: Record<string, string>;
} {
  const filters: Record<string, string> = {};
  let searchTerm = query;

  // Extract type:filter
  const typeMatch = query.match(/type:(\w+)/);
  if (typeMatch) {
    filters.type = typeMatch[1];
    searchTerm = searchTerm.replace(/type:\w+\s*/g, '');
  }

  // Extract other potential filters (future expansion)
  // e.g., paused:true, hasTriggers:false, etc.

  return {
    searchTerm: searchTerm.trim(),
    typeFilter: filters.type || null,
    filters,
  };
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  const grouped: Record<string, SearchResult[]> = {
    tag: [],
    trigger: [],
    variable: [],
    folder: [],
  };

  for (const result of results) {
    grouped[result.type].push(result);
  }

  let output = `Found ${results.length} results:\n\n`;

  for (const [type, items] of Object.entries(grouped)) {
    if (items.length > 0) {
      output += `## ${type.charAt(0).toUpperCase() + type.slice(1)}s (${items.length})\n`;
      for (const item of items) {
        output += `- **${item.name}** (ID: ${item.id})\n`;
        output += `  Path: ${item.path}\n`;
        if (item.additionalInfo?.type) {
          output += `  Type: ${item.additionalInfo.type}\n`;
        }
        output += `  Match: ${item.matchReason}\n`;
      }
      output += '\n';
    }
  }

  return output;
}
