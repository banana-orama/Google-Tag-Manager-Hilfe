/**
 * Template-related GTM API tools
 */

import { tagmanager_v2 } from 'googleapis';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { handleApiError, ApiError } from '../utils/error-handler.js';
import {
  loadTemplateRegistry,
  saveTemplateRegistry,
  upsertRegistryEntry,
  TemplateRegistryEntry,
} from '../utils/template-registry.js';
import { getContainerInfo } from '../utils/container-validator.js';

type TemplateImportErrorType =
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_CONTEXT_MISMATCH'
  | 'TEMPLATE_PERMISSION_DENIED'
  | 'WORKSPACE_STATE_INVALID'
  | 'UNKNOWN';

function classifyTemplateImportError(error: unknown): { errorType: TemplateImportErrorType; code: string; message: string } {
  const raw = error as any;
  const message = String(raw?.response?.data?.error?.message || raw?.message || 'Unknown template import error');
  const lower = message.toLowerCase();
  const code = String(raw?.response?.data?.error?.code || raw?.code || 'UNKNOWN');

  if (lower.includes('not found') || code === '404') {
    return { errorType: 'TEMPLATE_NOT_FOUND', code, message };
  }
  if (lower.includes('context') || lower.includes('unsupported in this container') || lower.includes('usage context')) {
    return { errorType: 'TEMPLATE_CONTEXT_MISMATCH', code, message };
  }
  if (lower.includes('permission') || lower.includes('denied') || code === '403') {
    return { errorType: 'TEMPLATE_PERMISSION_DENIED', code, message };
  }
  if (lower.includes('workspace') && (lower.includes('state') || lower.includes('submitted') || lower.includes('conflict'))) {
    return { errorType: 'WORKSPACE_STATE_INVALID', code, message };
  }
  return { errorType: 'UNKNOWN', code, message };
}

export interface TemplateSummary {
  templateId: string;
  name: string;
  path: string;
}

export interface TemplateDetails extends TemplateSummary {
  fingerprint?: string;
  templateData?: string;
  revertedDeletedInBase?: boolean;
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
        requestBody: {
          name: templateConfig.name,
          templateData: templateConfig.templateData,
        },
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
    owner: string;
    repository: string;
    version?: string;
    signature?: string;
  }
): Promise<TemplateDetails | ApiError> {
  const tagmanager = getTagManagerClient();
  const containerPath = workspacePath.replace(/\/workspaces\/[^/]+$/, '');
  const registry = await loadTemplateRegistry();

  try {
    const wsStatus = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.getStatus({
        path: workspacePath,
      })
    );
    if (wsStatus.mergeConflict?.length || wsStatus.workspaceChange?.length) {
      return {
        code: 'WORKSPACE_STATE_INVALID',
        errorType: 'WORKSPACE_STATE_INVALID',
        message: 'Workspace has conflicts or pending sync status; template import aborted in strict mode.',
        details: wsStatus,
        suggestions: ['Run gtm_get_workspace_status and resolve conflicts', 'Retry in a fresh workspace'],
      };
    }
  } catch {
    // Non-fatal preflight failure; GTM import may still succeed.
  }

  try {
    const response = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.templates.import_from_gallery({
        parent: workspacePath,
        acknowledgePermissions: true,
        galleryOwner: galleryReference.owner,
        galleryRepository: galleryReference.repository,
        gallerySha: galleryReference.version || undefined,
      })
    );

    // Keep template registry in sync with successful imports for deterministic LLM usage.
    try {
      const containerInfo = await getContainerInfo(containerPath);
      const usage = (containerInfo.usageContext || []).map((v) => String(v).toLowerCase());
      const containerContext = usage.includes('server') ? 'SERVER' : usage.includes('web') ? 'WEB' : 'UNKNOWN';
      const entry: TemplateRegistryEntry = {
        owner: galleryReference.owner,
        repository: galleryReference.repository,
        sha: galleryReference.version || undefined,
        containerContext: containerContext as TemplateRegistryEntry['containerContext'],
        entityKind: 'unknown',
        type: response.templateId || undefined,
        requiredParameters: [],
        optionalParameters: [],
        defaults: {},
        examplePayload: {},
        status: 'verified',
        lastVerifiedAt: new Date().toISOString(),
        verificationNote: `Imported successfully via GTM API v2 into ${workspacePath}`,
        verificationCode: 'IMPORT_OK',
        lastErrorType: undefined,
        lastErrorMessage: undefined,
      };
      upsertRegistryEntry(registry, entry);
      await saveTemplateRegistry(registry);
    } catch {
      // Registry update failure should not fail template import.
    }

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
    const classified = classifyTemplateImportError(error);
    try {
      const entry: TemplateRegistryEntry = {
        owner: galleryReference.owner,
        repository: galleryReference.repository,
        sha: galleryReference.version || undefined,
        containerContext: 'UNKNOWN',
        entityKind: 'unknown',
        requiredParameters: [],
        optionalParameters: [],
        defaults: {},
        examplePayload: {},
        status: 'broken',
        lastVerifiedAt: new Date().toISOString(),
        verificationNote: `Import failed (${classified.errorType}): ${classified.message}`,
        verificationCode: classified.code,
        lastErrorType: classified.errorType,
        lastErrorMessage: classified.message,
      };
      upsertRegistryEntry(registry, entry);
      await saveTemplateRegistry(registry);
    } catch {
      // Registry write errors are non-fatal for tool response.
    }

    const msg = String((error as any)?.message ?? '').toLowerCase();
    if (msg.includes('duplicate name')) {
      try {
        const templates = await gtmApiCall(() =>
          tagmanager.accounts.containers.workspaces.templates.list({
            parent: workspacePath,
          })
        );
        for (const item of templates.template || []) {
          if (!item.path) continue;
          const details = await getTemplate(item.path);
          const gr = details?.galleryReference;
          if (!gr) continue;
          const ownerMatch = gr.owner === galleryReference.owner;
          const repoMatch = gr.repository === galleryReference.repository;
          const versionMatch = !galleryReference.version || gr.version === galleryReference.version;
          if (ownerMatch && repoMatch && versionMatch) {
            return details as TemplateDetails;
          }
        }
      } catch {
        // Fall through to default error handling below.
      }
    }
    const fallback = handleApiError(error, 'importTemplateFromGallery', { galleryReference });
    return {
      ...fallback,
      errorType: classified.errorType,
      code: classified.code || fallback.code,
      message: classified.message || fallback.message,
    };
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
    // GTM template update behaves like replace for required fields.
    // Merge against current template to avoid dropping templateData.
    const current = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.templates.get({
        path: templatePath,
      })
    );

    const requestBody: tagmanager_v2.Schema$CustomTemplate = {
      name: templateConfig.name ?? current.name ?? undefined,
      templateData: templateConfig.templateData ?? current.templateData ?? undefined,
      galleryReference: current.galleryReference ?? undefined,
    };

    const template = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.templates.update({
        path: templatePath,
        fingerprint,
        requestBody,
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
      // GTM v2 semantics: no template in response means it was deleted in base version.
      return {
        templateId: '',
        name: '',
        path: templatePath,
        revertedDeletedInBase: true,
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
