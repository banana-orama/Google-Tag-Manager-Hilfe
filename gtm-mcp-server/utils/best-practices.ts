/**
 * Best practices checker for GTM workspaces
 */

import { listTags } from '../tools/tags.js';
import { listTriggers } from '../tools/triggers.js';
import { listVariables } from '../tools/variables.js';
import { listFolders } from '../tools/folders.js';

export interface BestPracticeIssue {
  severity: 'error' | 'warning' | 'info';
  type: string;
  message: string;
  entityId?: string;
  entityName?: string;
  entityType?: 'tag' | 'trigger' | 'variable' | 'folder';
  recommendation: string;
}

export interface BestPracticeResult {
  score: number;
  issues: BestPracticeIssue[];
  recommendations: string[];
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    info: number;
  };
  stats: {
    tags: { total: number; paused: number; withoutTriggers: number };
    triggers: { total: number };
    variables: { total: number };
    folders: { total: number };
  };
}

export async function checkBestPractices(workspacePath: string): Promise<BestPracticeResult> {
  const issues: BestPracticeIssue[] = [];
  const recommendations: string[] = [];

  // Fetch all entities
  const [tags, triggers, variables, folders] = await Promise.all([
    listTags(workspacePath).catch(() => []),
    listTriggers(workspacePath).catch(() => []),
    listVariables(workspacePath).catch(() => []),
    listFolders(workspacePath).catch(() => []),
  ]);

  // Stats
  const stats = {
    tags: {
      total: tags.length,
      paused: tags.filter(t => t.paused).length,
      withoutTriggers: tags.filter(t => !t.firingTriggerId || t.firingTriggerId.length === 0).length,
    },
    triggers: { total: triggers.length },
    variables: { total: variables.length },
    folders: { total: folders.length },
  };

  // Check tags
  for (const tag of tags) {
    // Tags without triggers
    if (!tag.firingTriggerId || tag.firingTriggerId.length === 0) {
      issues.push({
        severity: 'warning',
        type: 'tag_without_trigger',
        message: `Tag "${tag.name}" has no firing triggers`,
        entityId: tag.tagId,
        entityName: tag.name,
        entityType: 'tag',
        recommendation: 'Add a firing trigger or delete the tag if unused',
      });
    }

    // Paused tags
    if (tag.paused) {
      issues.push({
        severity: 'info',
        type: 'paused_tag',
        message: `Tag "${tag.name}" is paused`,
        entityId: tag.tagId,
        entityName: tag.name,
        entityType: 'tag',
        recommendation: 'Unpause if needed or delete if no longer required',
      });
    }

    // Naming convention check
    if (tag.name.match(/^[a-z]/)) {
      issues.push({
        severity: 'info',
        type: 'naming_convention',
        message: `Tag "${tag.name}" may not follow naming conventions`,
        entityId: tag.tagId,
        entityName: tag.name,
        entityType: 'tag',
        recommendation: 'Consider using consistent naming like "GA4 - Event Name" or "Google Ads - Conversion"',
      });
    }
  }

  // Check for duplicate trigger names
  const triggerNames = triggers.map(t => t.name);
  const duplicateTriggers = triggerNames.filter((name, index) => 
    triggerNames.indexOf(name) !== index
  );
  
  if (duplicateTriggers.length > 0) {
    issues.push({
      severity: 'warning',
      type: 'duplicate_trigger_names',
      message: `Duplicate trigger names found: ${[...new Set(duplicateTriggers)].join(', ')}`,
      recommendation: 'Rename triggers to have unique names for better organization',
    });
  }

  // Check for duplicate tag names
  const tagNames = tags.map(t => t.name);
  const duplicateTags = tagNames.filter((name, index) => 
    tagNames.indexOf(name) !== index
  );
  
  if (duplicateTags.length > 0) {
    issues.push({
      severity: 'warning',
      type: 'duplicate_tag_names',
      message: `Duplicate tag names found: ${[...new Set(duplicateTags)].join(', ')}`,
      recommendation: 'Rename tags to have unique names',
    });
  }

  // Check variables
  for (const variable of variables) {
    // Check naming with {{ }}
    if (variable.name.includes('{{') || variable.name.includes('}}')) {
      issues.push({
        severity: 'warning',
        type: 'variable_naming',
        message: `Variable "${variable.name}" contains {{ }} in name`,
        entityId: variable.variableId,
        entityName: variable.name,
        entityType: 'variable',
        recommendation: 'Variable names should be plain text without {{ }}. Use {{ }} only when referencing variables.',
      });
    }
  }

  // Check for GA4 configuration
  const hasGA4Tag = tags.some(t => t.type === 'gaawe' || t.type === 'googtag');
  const hasUATag = tags.some(t => t.type === 'ua');
  
  if (!hasGA4Tag && !hasUATag) {
    issues.push({
      severity: 'info',
      type: 'missing_analytics',
      message: 'No analytics configuration found',
      recommendation: 'Consider adding GA4 tracking for analytics insights',
    });
    recommendations.push('Add GA4 configuration tag for analytics tracking');
  }

  // Check for UA tags (deprecated)
  if (hasUATag) {
    issues.push({
      severity: 'warning',
      type: 'deprecated_ua',
      message: 'Universal Analytics tags found (deprecated)',
      recommendation: 'Migrate to GA4 as Universal Analytics has been deprecated',
    });
    recommendations.push('Migrate Universal Analytics tags to GA4');
  }

  // Check folder organization
  if (folders.length === 0 && tags.length > 10) {
    issues.push({
      severity: 'info',
      type: 'folder_organization',
      message: 'No folders found with many tags',
      recommendation: 'Consider organizing tags, triggers, and variables into folders for better management',
    });
    recommendations.push('Create folders to organize tags and triggers');
  }

  // Calculate score
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;
  
  let score = 100;
  score -= errorCount * 15;
  score -= warningCount * 5;
  score -= infoCount * 2;
  score = Math.max(0, Math.min(100, score));

  // Add general recommendations
  if (issues.length === 0) {
    recommendations.push('Workspace follows best practices!');
  } else {
    if (stats.tags.withoutTriggers > 0) {
      recommendations.push('Clean up tags without triggers');
    }
    if (warningCount > 0) {
      recommendations.push('Address warnings to improve workspace quality');
    }
    if (!hasGA4Tag && !hasUATag) {
      recommendations.push('Add analytics tracking for better insights');
    }
  }

  // Recommendations for optimization
  if (tags.length > 50) {
    recommendations.push('Consider auditing tags - large numbers of tags can impact performance');
  }

  return {
    score,
    issues,
    recommendations: [...new Set(recommendations)], // Remove duplicates
    summary: {
      totalIssues: issues.length,
      errors: errorCount,
      warnings: warningCount,
      info: infoCount,
    },
    stats,
  };
}

export function formatBestPracticesResult(result: BestPracticeResult): string {
  let output = `## Best Practices Score: ${result.score}/100\n\n`;
  
  output += `### Summary\n`;
  output += `- Total Issues: ${result.summary.totalIssues}\n`;
  output += `- Errors: ${result.summary.errors}\n`;
  output += `- Warnings: ${result.summary.warnings}\n`;
  output += `- Info: ${result.summary.info}\n\n`;

  output += `### Stats\n`;
  output += `- Tags: ${result.stats.tags.total} (${result.stats.tags.paused} paused, ${result.stats.tags.withoutTriggers} without triggers)\n`;
  output += `- Triggers: ${result.stats.triggers.total}\n`;
  output += `- Variables: ${result.stats.variables.total}\n`;
  output += `- Folders: ${result.stats.folders.total}\n\n`;

  if (result.issues.length > 0) {
    output += `### Issues\n\n`;
    
    const errors = result.issues.filter(i => i.severity === 'error');
    const warnings = result.issues.filter(i => i.severity === 'warning');
    const infos = result.issues.filter(i => i.severity === 'info');

    if (errors.length > 0) {
      output += `**Errors:**\n`;
      for (const issue of errors) {
        output += `- ${issue.message}\n`;
        output += `  → ${issue.recommendation}\n`;
      }
      output += '\n';
    }

    if (warnings.length > 0) {
      output += `**Warnings:**\n`;
      for (const issue of warnings) {
        output += `- ${issue.message}\n`;
        output += `  → ${issue.recommendation}\n`;
      }
      output += '\n';
    }

    if (infos.length > 0) {
      output += `**Info:**\n`;
      for (const issue of infos) {
        output += `- ${issue.message}\n`;
        output += `  → ${issue.recommendation}\n`;
      }
      output += '\n';
    }
  }

  if (result.recommendations.length > 0) {
    output += `### Recommendations\n`;
    for (const rec of result.recommendations) {
      output += `- ${rec}\n`;
    }
  }

  return output;
}
