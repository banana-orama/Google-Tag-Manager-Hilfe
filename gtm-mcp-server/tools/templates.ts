/**
 * Template-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';

export interface TemplateSummary {
  templateId: string;
  name: string;
  path: string;
}

export interface TemplateDetails extends TemplateSummary {
  fingerprint?: string;
  templateData?: string;
  galleryReference?: {
    host?: string;
    owner?: string;
    repository?: string;
    version?: string;
    signature?: string;
  };
}

/**
 * List all templates in a workspace
 */
export async function listTemplates(workspacePath: string): Promise<TemplateSummary[]> {
  const tagmanager = getTagManagerClient();

  const templates = await gtmApiCall(() =>
    tagmanager.accounts.containers.workspaces.templates.list({
      parent: workspacePath,
    })
  );

  if (!templates.template) {
    return [];
  }

  return templates.template.map((template) => ({
    templateId: template.templateId || '',
    name: template.name || '',
    path: template.path || '',
  }));
}

/**
 * Get a single template with full details
 */
export async function getTemplate(templatePath: string): Promise<TemplateDetails | null> {
  const tagmanager = getTagManagerClient();

  try {
    const template = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.templates.get({
        path: templatePath,
      })
    );

    return {
      templateId: template.templateId || '',
      name: template.name || '',
      path: template.path || '',
      fingerprint: template.fingerprint || undefined,
      templateData: template.templateData || undefined,
      galleryReference: template.galleryReference ? {
        host: template.galleryReference.host || undefined,
        owner: template.galleryReference.owner || undefined,
        repository: template.galleryReference.repository || undefined,
        version: template.galleryReference.version || undefined,
        signature: template.galleryReference.signature || undefined,
      } : undefined,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Create a new custom template
 */
export async function createTemplate(
  workspacePath: string,
  templateConfig: {
    name: string;
    templateData: string;
  }
): Promise<TemplateDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const template = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.templates.create({
        parent: workspacePath,
        requestBody: templateConfig,
      })
    );

    return {
      templateId: template.templateId || '',
      name: template.name || '',
      path: template.path || '',
      fingerprint: template.fingerprint || undefined,
      templateData: template.templateData || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'createTemplate', templateConfig);
  }
}

/**
 * Import a template from the Community Template Gallery
 */
export async function importTemplateFromGallery(
  workspacePath: string,
  galleryReference: {
    host: string;
    owner: string;
    repository: string;
    version: string;
    signature?: string;
  }
): Promise<TemplateDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const response = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.templates.create({
        parent: workspacePath,
        requestBody: {
          galleryReference,
        },
      })
    );

    return {
      templateId: response.templateId || '',
      name: response.name || '',
      path: response.path || '',
      fingerprint: response.fingerprint || undefined,
      templateData: response.templateData || undefined,
      galleryReference: response.galleryReference ? {
        host: response.galleryReference.host || undefined,
        owner: response.galleryReference.owner || undefined,
        repository: response.galleryReference.repository || undefined,
        version: response.galleryReference.version || undefined,
        signature: response.galleryReference.signature || undefined,
      } : undefined,
    };
  } catch (error) {
    return handleApiError(error, 'importTemplateFromGallery', { galleryReference });
  }
}

/**
 * Update an existing template
 */
export async function updateTemplate(
  templatePath: string,
  templateConfig: Partial<{
    name: string;
    templateData: string;
  }>,
  fingerprint: string
): Promise<TemplateDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const template = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.templates.update({
        path: templatePath,
        fingerprint,
        requestBody: templateConfig,
      })
    );

    return {
      templateId: template.templateId || '',
      name: template.name || '',
      path: template.path || '',
      fingerprint: template.fingerprint || undefined,
      templateData: template.templateData || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'updateTemplate', { templateConfig, fingerprint });
  }
}

/**
 * Delete a template (DESTRUCTIVE!)
 */
export async function deleteTemplate(templatePath: string): Promise<{ deleted: boolean } | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.templates.delete({
        path: templatePath,
      })
    );
    return { deleted: true };
  } catch (error) {
    return handleApiError(error, 'deleteTemplate', { templatePath });
  }
}

/**
 * Revert template changes in workspace
 */
export async function revertTemplate(templatePath: string): Promise<TemplateDetails | ApiError> {
  const tagmanager = getTagManagerClient();

  try {
    const result = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.templates.revert({
        path: templatePath,
      })
    );

    const template = result.template as tagmanager_v2.Schema$CustomTemplate | undefined;
    if (!template) {
      return {
        code: 'NO_TEMPLATE',
        message: 'Revert succeeded but no template data returned',
        suggestions: ['Try reverting the template again', 'Check if template exists in workspace'],
      };
    }

    return {
      templateId: template.templateId || '',
      name: template.name || '',
      path: template.path || '',
      fingerprint: template.fingerprint || undefined,
      templateData: template.templateData || undefined,
    };
  } catch (error) {
    return handleApiError(error, 'revertTemplate', { templatePath });
  }
}

/**
 * Analyze templates and return summary
 */
export function analyzeTemplateList(templates: TemplateSummary[]): {
  total: number;
} {
  return {
    total: templates.length,
  };
}
