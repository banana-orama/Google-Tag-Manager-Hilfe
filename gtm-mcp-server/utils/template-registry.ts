import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tagmanager_v2 } from 'googleapis';
import { ApiError } from './error-handler.js';
import { getContainerInfo } from './container-validator.js';
import { getTagManagerClient, gtmApiCall } from './gtm-client.js';

export type RegistryStatus = 'verified' | 'candidate' | 'broken' | 'unknown';
export type ContainerContext = 'WEB' | 'SERVER' | 'AMP' | 'IOS' | 'ANDROID' | 'UNKNOWN';
export type EntityKind = 'tag' | 'variable' | 'client' | 'transformation' | 'unknown';

export interface RegistryParameterDefinition {
  key: string;
  type?: 'template' | 'boolean' | 'integer' | 'list' | 'map' | 'triggerReference' | 'tagReference';
  description?: string;
}

export interface TemplateRegistryEntry {
  owner: string;
  repository: string;
  sha?: string;
  containerContext: ContainerContext;
  entityKind: EntityKind;
  type?: string;
  requiredParameters: RegistryParameterDefinition[];
  optionalParameters: RegistryParameterDefinition[];
  defaults: Record<string, string | number | boolean>;
  examplePayload: Record<string, unknown>;
  status: RegistryStatus;
  lastVerifiedAt: string;
  verificationNote: string;
  verificationCode?: string;
  lastErrorType?: string;
  lastErrorMessage?: string;
}

export interface TemplateRegistryDocument {
  version: number;
  updatedAt: string;
  entries: TemplateRegistryEntry[];
}

export interface TemplateReference {
  owner: string;
  repository: string;
  version?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH_CANDIDATES = [
  path.resolve(__dirname, '../config/template-registry.json'),
  path.resolve(__dirname, '../../config/template-registry.json'),
  path.resolve(process.cwd(), 'config/template-registry.json'),
];
function resolveRegistryPath(): string {
  for (const candidate of REGISTRY_PATH_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return REGISTRY_PATH_CANDIDATES[0];
}
const REGISTRY_PATH = resolveRegistryPath();
const WEB_ONLY_TAG_TYPES = new Set(['html', 'awct', 'sp', 'ua', 'googtag', 'flc', 'gclidw']);
const WEB_ONLY_VARIABLE_TYPES = new Set(['k', 'jsm', 'c', 'v', 'f', 'aev', 'r', 'smm']);
const KNOWN_SERVER_CLIENT_TYPES = new Set(['gaaw_client', 'adwords_client', 'facebook_client']);
const KNOWN_SERVER_TAG_TYPES = new Set(['gaawe', 'sgtm_ga4', 'sgtm_facebook', 'gtag_config']);

export interface ResolvedEntityType {
  resolvedType: string;
  source: 'registry' | 'workspace' | 'known-default';
  availableTypeHints: string[];
  registryEntry?: TemplateRegistryEntry;
}

function normalizeOwner(owner: string): string {
  return owner.trim().toLowerCase();
}

function normalizeRepo(repository: string): string {
  return repository.trim().toLowerCase();
}

function nowIso(): string {
  return new Date().toISOString();
}

function inferContainerContext(usageContext: string[] | undefined): ContainerContext {
  const contexts = (usageContext || []).map((v) => String(v).toLowerCase());
  if (contexts.includes('server')) return 'SERVER';
  if (contexts.includes('web')) return 'WEB';
  if (contexts.includes('amp')) return 'AMP';
  if (contexts.includes('ios')) return 'IOS';
  if (contexts.includes('android')) return 'ANDROID';
  return 'UNKNOWN';
}

export function buildRegistryMissError(ref: TemplateReference): ApiError {
  return {
    code: 'TEMPLATE_REGISTRY_MISS',
    message: `Template registry entry not found for ${ref.owner}/${ref.repository}`,
    errorType: 'TEMPLATE_REGISTRY_MISS',
    help: 'Run the template registry seed/sync flow and retry.',
    suggestions: [
      'Run: npm run template-registry:seed -- --owner stape-io',
      'If this is a custom template, add an entry manually to config/template-registry.json',
    ],
  };
}

export async function loadTemplateRegistry(): Promise<TemplateRegistryDocument> {
  try {
    const content = await fs.readFile(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(content) as TemplateRegistryDocument;
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid registry JSON');
    if (!Array.isArray(parsed.entries)) parsed.entries = [];
    if (typeof parsed.version !== 'number') parsed.version = 1;
    if (typeof parsed.updatedAt !== 'string') parsed.updatedAt = nowIso();
    return parsed;
  } catch {
    return {
      version: 1,
      updatedAt: nowIso(),
      entries: [],
    };
  }
}

export async function saveTemplateRegistry(doc: TemplateRegistryDocument): Promise<void> {
  const sorted = {
    ...doc,
    updatedAt: nowIso(),
    entries: [...doc.entries].sort((a, b) => {
      const oa = normalizeOwner(a.owner);
      const ob = normalizeOwner(b.owner);
      if (oa !== ob) return oa.localeCompare(ob);
      return normalizeRepo(a.repository).localeCompare(normalizeRepo(b.repository));
    }),
  };
  await fs.mkdir(path.dirname(REGISTRY_PATH), { recursive: true });
  await fs.writeFile(REGISTRY_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

export function findRegistryEntry(
  doc: TemplateRegistryDocument,
  ref: TemplateReference
): TemplateRegistryEntry | null {
  const owner = normalizeOwner(ref.owner);
  const repository = normalizeRepo(ref.repository);
  const candidates = doc.entries.filter(
    (entry) => normalizeOwner(entry.owner) === owner && normalizeRepo(entry.repository) === repository
  );
  if (candidates.length === 0) return null;
  if (!ref.version) return candidates[0];
  return candidates.find((entry) => entry.sha === ref.version) || candidates[0];
}

export function upsertRegistryEntry(
  doc: TemplateRegistryDocument,
  entry: TemplateRegistryEntry
): TemplateRegistryDocument {
  const owner = normalizeOwner(entry.owner);
  const repository = normalizeRepo(entry.repository);
  const idx = doc.entries.findIndex(
    (item) =>
      normalizeOwner(item.owner) === owner &&
      normalizeRepo(item.repository) === repository
  );
  if (idx === -1) {
    doc.entries.push(entry);
  } else {
    doc.entries[idx] = {
      ...doc.entries[idx],
      ...entry,
      lastVerifiedAt: entry.lastVerifiedAt || nowIso(),
    };
  }
  doc.updatedAt = nowIso();
  return doc;
}

async function listEntityTypesFromWorkspace(
  workspacePath: string,
  entityKind: Exclude<EntityKind, 'unknown'>
): Promise<string[]> {
  const tagmanager = getTagManagerClient();

  const collect = (arr: Array<{ type?: string }> | undefined): string[] =>
    [...new Set((arr || []).map((x) => String(x.type || '').trim()).filter(Boolean))];

  try {
    if (entityKind === 'tag') {
      const res = await gtmApiCall(() =>
        tagmanager.accounts.containers.workspaces.tags.list({ parent: workspacePath })
      );
      return collect(res.tag as Array<{ type?: string }> | undefined);
    }
    if (entityKind === 'variable') {
      const res = await gtmApiCall(() =>
        tagmanager.accounts.containers.workspaces.variables.list({ parent: workspacePath })
      );
      return collect(res.variable as Array<{ type?: string }> | undefined);
    }
    if (entityKind === 'client') {
      const res = await gtmApiCall(() =>
        tagmanager.accounts.containers.workspaces.clients.list({ parent: workspacePath })
      );
      return collect(res.client as Array<{ type?: string }> | undefined);
    }
    if (entityKind === 'transformation') {
      const res = await gtmApiCall(() =>
        tagmanager.accounts.containers.workspaces.transformations.list({ parent: workspacePath })
      );
      return collect(res.transformation as Array<{ type?: string }> | undefined);
    }
    return [];
  } catch {
    return [];
  }
}

export async function getAvailableEntityTypes(
  workspacePath: string,
  entityKind: Exclude<EntityKind, 'unknown'>
): Promise<string[]> {
  const workspaceTypes = await listEntityTypesFromWorkspace(workspacePath, entityKind);
  const registry = await loadTemplateRegistry();
  const registryTypes = registry.entries
    .filter((entry) => entry.status === 'verified' && entry.entityKind === entityKind && entry.type)
    .map((entry) => String(entry.type))
    .filter(Boolean);

  const containerPath = workspacePath.replace(/\/workspaces\/[^/]+$/, '');
  const containerInfo = await getContainerInfo(containerPath);
  const isServer = containerInfo.capabilities.containerType === 'server';

  const defaults: string[] = (() => {
    if (!isServer) return [];
    if (entityKind === 'client') return [...KNOWN_SERVER_CLIENT_TYPES];
    if (entityKind === 'tag') return [...KNOWN_SERVER_TAG_TYPES];
    return [];
  })();

  return [...new Set([...workspaceTypes, ...registryTypes, ...defaults])].sort();
}

export async function resolveEntityType(input: {
  workspacePath: string;
  entityKind: Exclude<EntityKind, 'unknown'>;
  requestedType?: string;
  templateReference?: TemplateReference;
}): Promise<{ ok: true; result: ResolvedEntityType } | { ok: false; error: ApiError }> {
  const hints = await getAvailableEntityTypes(input.workspacePath, input.entityKind);
  const requested = input.requestedType?.trim();

  if (input.templateReference) {
    const registry = await loadTemplateRegistry();
    const entry = findRegistryEntry(registry, input.templateReference);
    if (!entry) return { ok: false, error: buildRegistryMissError(input.templateReference) };
    if (entry.status !== 'verified') {
      return {
        ok: false,
        error: {
          code: 'TEMPLATE_NOT_VERIFIED',
          message: `Registry entry ${entry.owner}/${entry.repository} is "${entry.status}" and cannot resolve entity type.`,
          errorType: 'TEMPLATE_NOT_VERIFIED',
          details: {
            status: entry.status,
            verificationNote: entry.verificationNote,
            lastErrorType: entry.lastErrorType,
            lastErrorMessage: entry.lastErrorMessage,
          },
        },
      };
    }
    const registryType = entry.type?.trim();
    if (!registryType) {
      return {
        ok: false,
        error: {
          code: 'TEMPLATE_TYPE_UNRESOLVED',
          message: `Template ${entry.owner}/${entry.repository} has no registered type.`,
          errorType: 'TEMPLATE_TYPE_UNRESOLVED',
        },
      };
    }
    if (requested && requested !== registryType) {
      return {
        ok: false,
        error: {
          code: 'TEMPLATE_TYPE_CONFLICT',
          message: `Provided type "${requested}" conflicts with registry type "${registryType}" for ${entry.owner}/${entry.repository}.`,
          errorType: 'TEMPLATE_TYPE_CONFLICT',
          details: {
            providedType: requested,
            registryType,
            availableTypeHints: hints,
          },
        },
      };
    }
    return {
      ok: true,
      result: {
        resolvedType: registryType,
        source: 'registry',
        availableTypeHints: hints,
        registryEntry: entry,
      },
    };
  }

  if (!requested) {
    return {
      ok: false,
      error: {
        code: 'TYPE_REQUIRED',
        message: 'Type is required when templateReference is not provided.',
        errorType: 'TYPE_REQUIRED',
        details: { availableTypeHints: hints },
      },
    };
  }

  if (hints.length > 0 && !hints.includes(requested) && input.entityKind !== 'variable') {
    return {
      ok: false,
      error: {
        code: 'ENTITY_TYPE_UNAVAILABLE',
        message: `Type "${requested}" is not available for ${input.entityKind} in this workspace context.`,
        errorType: 'ENTITY_TYPE_UNAVAILABLE',
        details: {
          providedType: requested,
          availableTypeHints: hints,
        },
        suggestions: [
          'Use one of availableTypeHints',
          'Import or verify the required template first',
          'Use templateReference for deterministic type resolution',
        ],
      },
    };
  }

  return {
    ok: true,
    result: {
      resolvedType: requested,
      source: hints.includes(requested) ? 'workspace' : 'known-default',
      availableTypeHints: hints,
    },
  };
}

function hasParameterKey(params: tagmanager_v2.Schema$Parameter[] | undefined, key: string): boolean {
  if (!params) return false;
  return params.some((param) => param?.key === key);
}

function appendDefaultParameters(
  provided: tagmanager_v2.Schema$Parameter[] | undefined,
  defaults: Record<string, string | number | boolean>
): tagmanager_v2.Schema$Parameter[] | undefined {
  const next = [...(provided || [])];
  for (const [key, value] of Object.entries(defaults || {})) {
    if (hasParameterKey(next, key)) continue;
    next.push({
      key,
      type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'integer' : 'template',
      value: String(value),
    });
  }
  return next.length > 0 ? next : undefined;
}

function validateRequiredParameters(
  required: RegistryParameterDefinition[],
  provided: tagmanager_v2.Schema$Parameter[] | undefined
): string[] {
  const missing: string[] = [];
  for (const def of required) {
    if (!def.key) continue;
    if (!hasParameterKey(provided, def.key)) missing.push(def.key);
  }
  return missing;
}

export async function preflightTemplateBasedCreate(input: {
  workspacePath: string;
  entityKind: Exclude<EntityKind, 'unknown'>;
  type?: string;
  parameter?: tagmanager_v2.Schema$Parameter[];
  templateReference?: TemplateReference;
}): Promise<
  | { ok: true; type: string; parameter?: tagmanager_v2.Schema$Parameter[]; registryEntry?: TemplateRegistryEntry }
  | { ok: false; error: ApiError }
> {
  const containerPath = input.workspacePath.replace(/\/workspaces\/[^/]+$/, '');
  const containerInfo = await getContainerInfo(containerPath);
  const context = inferContainerContext(containerInfo.usageContext);

  const resolved = await resolveEntityType({
    workspacePath: input.workspacePath,
    entityKind: input.entityKind,
    requestedType: input.type,
    templateReference: input.templateReference,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const resolvedType = resolved.result.resolvedType;
  const entry = resolved.result.registryEntry;

  if (context === 'SERVER' && input.entityKind === 'tag' && WEB_ONLY_TAG_TYPES.has(resolvedType)) {
    return {
      ok: false,
      error: {
        code: 'SERVER_TYPE_BLOCKED',
        message: `Type "${resolvedType}" is web-only and cannot be used in server container.`,
        errorType: 'SERVER_TYPE_BLOCKED',
        details: { availableTypeHints: resolved.result.availableTypeHints },
      },
    };
  }
  if (
    context === 'SERVER' &&
    input.entityKind === 'variable' &&
    input.templateReference &&
    WEB_ONLY_VARIABLE_TYPES.has(resolvedType)
  ) {
    return {
      ok: false,
      error: {
        code: 'SERVER_TYPE_BLOCKED',
        message: `Variable type "${resolvedType}" is web-only and cannot be used in server container.`,
        errorType: 'SERVER_TYPE_BLOCKED',
        details: { availableTypeHints: resolved.result.availableTypeHints },
      },
    };
  }

  if (entry) {
    if (entry.containerContext !== 'UNKNOWN' && entry.containerContext !== context) {
      return {
        ok: false,
        error: {
          code: 'TEMPLATE_CONTEXT_MISMATCH',
          message: `Template ${entry.owner}/${entry.repository} is registered for ${entry.containerContext}, but workspace is ${context}.`,
          errorType: 'TEMPLATE_CONTEXT_MISMATCH',
        },
      };
    }

    if (entry.entityKind !== input.entityKind) {
      return {
        ok: false,
        error: {
          code: 'TEMPLATE_ENTITY_MISMATCH',
          message: `Template ${entry.owner}/${entry.repository} is registered for entityKind=${entry.entityKind}, expected ${input.entityKind}.`,
          errorType: 'TEMPLATE_ENTITY_MISMATCH',
        },
      };
    }
  }

  const mergedParams = appendDefaultParameters(input.parameter, entry?.defaults || {});
  if (entry) {
    const missing = validateRequiredParameters(entry.requiredParameters, mergedParams);
    if (missing.length > 0) {
      return {
        ok: false,
        error: {
          code: 'TEMPLATE_REQUIRED_PARAMETERS_MISSING',
          message: `Missing required parameters for ${entry.owner}/${entry.repository}: ${missing.join(', ')}`,
          errorType: 'TEMPLATE_REQUIRED_PARAMETERS_MISSING',
          details: {
            missingKeys: missing,
            requiredParameters: entry.requiredParameters,
          },
        },
      };
    }
  }

  return {
    ok: true,
    type: resolvedType,
    parameter: mergedParams,
    registryEntry: entry ?? undefined,
  };
}
