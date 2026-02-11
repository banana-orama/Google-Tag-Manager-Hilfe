import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tagmanager_v2 } from 'googleapis';
import { ApiError } from './error-handler.js';
import { getContainerInfo } from './container-validator.js';

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

  if (!input.templateReference) {
    if (!input.type) {
      return {
        ok: false,
        error: {
          code: 'TYPE_REQUIRED',
          message: 'Type is required when templateReference is not provided.',
          errorType: 'TYPE_REQUIRED',
        },
      };
    }
    if (context === 'SERVER') {
      if (input.entityKind === 'tag' && WEB_ONLY_TAG_TYPES.has(input.type)) {
        return {
          ok: false,
          error: {
            code: 'SERVER_TYPE_BLOCKED',
            message: `Type "${input.type}" is web-only and cannot be used in server container.`,
            errorType: 'SERVER_TYPE_BLOCKED',
            suggestions: [
              'Use a server-compatible type from an imported template',
              'Pass templateReference { owner, repository } to resolve type from registry',
            ],
          },
        };
      }
      if (input.entityKind === 'variable' && WEB_ONLY_VARIABLE_TYPES.has(input.type)) {
        return {
          ok: false,
          error: {
            code: 'SERVER_TYPE_BLOCKED',
            message: `Variable type "${input.type}" is web-only and cannot be used in server container.`,
            errorType: 'SERVER_TYPE_BLOCKED',
            suggestions: [
              'Use server-compatible variable/template type',
              'Pass templateReference { owner, repository } to resolve type from registry',
            ],
          },
        };
      }
    }
    return { ok: true, type: input.type, parameter: input.parameter };
  }

  const registry = await loadTemplateRegistry();
  const entry = findRegistryEntry(registry, input.templateReference);
  if (!entry) {
    return {
      ok: false,
      error: buildRegistryMissError(input.templateReference),
    };
  }

  if (entry.status !== 'verified') {
    return {
      ok: false,
      error: {
        code: 'TEMPLATE_NOT_VERIFIED',
        message: `Registry entry ${entry.owner}/${entry.repository} is "${entry.status}" and not usable for create flows.`,
        errorType: 'TEMPLATE_NOT_VERIFIED',
        details: {
          status: entry.status,
          verificationNote: entry.verificationNote,
          lastVerifiedAt: entry.lastVerifiedAt,
        },
        suggestions: [
          'Re-run template registry seed/sync with verification',
          'Use gtm_import_template_from_gallery and verify success',
        ],
      },
    };
  }

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

  const resolvedType = input.type || entry.type;
  if (!resolvedType) {
    return {
      ok: false,
      error: {
        code: 'TEMPLATE_TYPE_UNRESOLVED',
        message: `Template ${entry.owner}/${entry.repository} has no resolved GTM type in registry.`,
        errorType: 'TEMPLATE_TYPE_UNRESOLVED',
      },
    };
  }
  if (input.type && entry.type && input.type !== entry.type) {
    return {
      ok: false,
      error: {
        code: 'TEMPLATE_TYPE_CONFLICT',
        message: `Provided type "${input.type}" conflicts with registry type "${entry.type}" for ${entry.owner}/${entry.repository}.`,
        errorType: 'TEMPLATE_TYPE_CONFLICT',
      },
    };
  }

  const mergedParams = appendDefaultParameters(input.parameter, entry.defaults);
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

  return {
    ok: true,
    type: resolvedType,
    parameter: mergedParams,
    registryEntry: entry,
  };
}
