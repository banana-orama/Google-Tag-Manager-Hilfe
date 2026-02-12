import { tagmanager_v2 } from 'googleapis';
import { preflightTemplateBasedCreate, TemplateReference, resolveEntityType } from './template-registry.js';
import { getContainerInfo } from './container-validator.js';

export interface EntityValidationResponse {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestedFixes: string[];
  resolvedContext: {
    containerType?: string;
    workspacePath?: string;
    resolvedType?: string;
    source?: string;
    availableTypeHints: string[];
    registryHit?: {
      owner: string;
      repository: string;
      status: string;
      type?: string;
    };
  };
}

function baseResponse(workspacePath: string): EntityValidationResponse {
  return {
    valid: true,
    errors: [],
    warnings: [],
    suggestedFixes: [],
    resolvedContext: {
      workspacePath,
      availableTypeHints: [],
    },
  };
}

async function decorateContainerContext(workspacePath: string, out: EntityValidationResponse): Promise<void> {
  try {
    const containerPath = workspacePath.replace(/\/workspaces\/[^/]+$/, '');
    const info = await getContainerInfo(containerPath);
    out.resolvedContext.containerType = info.capabilities.containerType;
  } catch {
    out.warnings.push('Container context could not be resolved.');
  }
}

export async function validateEntityConfigStrict(input: {
  workspacePath: string;
  entityKind: 'tag' | 'variable' | 'client' | 'transformation';
  name: string;
  type?: string;
  parameter?: tagmanager_v2.Schema$Parameter[];
  templateReference?: TemplateReference;
}): Promise<EntityValidationResponse> {
  const out = baseResponse(input.workspacePath);
  await decorateContainerContext(input.workspacePath, out);

  if (!input.name || input.name.trim() === '') {
    out.valid = false;
    out.errors.push('Name is required.');
  }

  const resolved = await resolveEntityType({
    workspacePath: input.workspacePath,
    entityKind: input.entityKind,
    requestedType: input.type,
    templateReference: input.templateReference,
  });
  if (!resolved.ok) {
    out.valid = false;
    out.errors.push(resolved.error.message);
    out.suggestedFixes.push(...(resolved.error.suggestions || []));
    out.resolvedContext.availableTypeHints = resolved.error.details?.availableTypeHints || [];
    return out;
  }

  out.resolvedContext.resolvedType = resolved.result.resolvedType;
  out.resolvedContext.source = resolved.result.source;
  out.resolvedContext.availableTypeHints = resolved.result.availableTypeHints;
  if (resolved.result.registryEntry) {
    out.resolvedContext.registryHit = {
      owner: resolved.result.registryEntry.owner,
      repository: resolved.result.registryEntry.repository,
      status: resolved.result.registryEntry.status,
      type: resolved.result.registryEntry.type,
    };
  }

  const preflight = await preflightTemplateBasedCreate({
    workspacePath: input.workspacePath,
    entityKind: input.entityKind,
    type: resolved.result.resolvedType,
    parameter: input.parameter,
    templateReference: input.templateReference,
  });
  if (!preflight.ok) {
    out.valid = false;
    out.errors.push(preflight.error.message);
    out.suggestedFixes.push(...(preflight.error.suggestions || []));
  }

  if (input.entityKind === 'variable' && input.name.includes('{{')) {
    out.valid = false;
    out.errors.push('Variable name must not include {{ }}.');
    out.suggestedFixes.push('Use plain variable name, e.g. "GA4 Measurement ID".');
  }

  return out;
}
