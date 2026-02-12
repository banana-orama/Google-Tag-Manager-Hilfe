#!/usr/bin/env node

import {
  loadTemplateRegistry,
  saveTemplateRegistry,
  upsertRegistryEntry,
  TemplateRegistryEntry,
  RegistryParameterDefinition,
} from '../utils/template-registry.js';
import { getAuthenticatedClient } from '../auth/oauth.js';
import { initTagManagerClient } from '../utils/gtm-client.js';
import { getTagManagerClient, gtmApiCall } from '../utils/gtm-client.js';
import { tagmanager_v2 } from 'googleapis';
import { getContainerInfo } from '../utils/container-validator.js';

interface Args {
  owner: string;
  webWorkspacePath?: string;
  serverWorkspacePath?: string;
  verify: boolean;
}

type VerifyErrorType =
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_CONTEXT_MISMATCH'
  | 'TEMPLATE_PERMISSION_DENIED'
  | 'WORKSPACE_STATE_INVALID'
  | 'UNKNOWN';

function parseArgs(argv: string[]): Args {
  const args: Args = {
    owner: 'stape-io',
    verify: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--owner' && next) {
      args.owner = next;
      i += 1;
      continue;
    }
    if (token === '--web-workspace' && next) {
      args.webWorkspacePath = next;
      i += 1;
      continue;
    }
    if (token === '--server-workspace' && next) {
      args.serverWorkspacePath = next;
      i += 1;
      continue;
    }
    if (token === '--no-verify') {
      args.verify = false;
      continue;
    }
  }
  return args;
}

async function listOwnerRepositories(owner: string): Promise<string[]> {
  const repos: string[] = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/users/${encodeURIComponent(owner)}/repos?type=public&per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'gtm-mcp-server-template-registry-seed',
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API error ${response.status} for ${url}`);
    }
    const data = (await response.json()) as Array<{ name: string }>;
    if (data.length === 0) break;
    repos.push(...data.map((repo) => repo.name));
    page += 1;
  }
  repos.sort((a, b) => a.localeCompare(b));
  return repos;
}

async function inferContextFromWorkspace(workspacePath: string): Promise<'WEB' | 'SERVER' | 'UNKNOWN'> {
  const containerPath = workspacePath.replace(/\/workspaces\/[^/]+$/, '');
  const info = await getContainerInfo(containerPath);
  const uc = (info.usageContext || []).map((u) => String(u).toLowerCase());
  if (uc.includes('server')) return 'SERVER';
  if (uc.includes('web')) return 'WEB';
  return 'UNKNOWN';
}

function baseEntry(owner: string, repository: string): TemplateRegistryEntry {
  return {
    owner,
    repository,
    containerContext: 'UNKNOWN',
    entityKind: 'unknown',
    requiredParameters: [],
    optionalParameters: [],
    defaults: {},
    examplePayload: {},
    status: 'candidate',
    lastVerifiedAt: '',
    verificationNote: 'Discovered via GitHub owner repository listing',
  };
}

function inferEntityKind(repository: string): TemplateRegistryEntry['entityKind'] {
  const name = repository.toLowerCase();
  if (name.includes('transformation')) return 'transformation';
  if (name.includes('client')) return 'client';
  if (name.includes('variable')) return 'variable';
  if (name.includes('tag')) return 'tag';
  return 'unknown';
}

function parseInfoSection(templateData?: string): any | null {
  if (!templateData) return null;
  const marker = '___INFO___';
  const idx = templateData.indexOf(marker);
  if (idx === -1) return null;
  const rest = templateData.slice(idx + marker.length);
  const nextMarkers = ['___SANDBOXED_JS___', '___WEB_PERMISSIONS___', '___SERVER_PERMISSIONS___', '___TESTS___'];
  let end = rest.length;
  for (const m of nextMarkers) {
    const i = rest.indexOf(m);
    if (i !== -1 && i < end) end = i;
  }
  const jsonText = rest.slice(0, end).trim();
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function buildParameterDefs(info: any): {
  requiredParameters: RegistryParameterDefinition[];
  optionalParameters: RegistryParameterDefinition[];
  defaults: Record<string, string | number | boolean>;
} {
  const requiredParameters: RegistryParameterDefinition[] = [];
  const optionalParameters: RegistryParameterDefinition[] = [];
  const defaults: Record<string, string | number | boolean> = {};

  const params = Array.isArray(info?.parameters) ? info.parameters : [];
  for (const param of params) {
    const key = typeof param?.name === 'string' && param.name ? param.name : param?.key;
    if (!key || typeof key !== 'string') continue;
    const type = typeof param?.type === 'string' ? String(param.type).toLowerCase() : undefined;
    const normalizedType: RegistryParameterDefinition['type'] =
      type === 'boolean' || type === 'checkbox'
        ? 'boolean'
        : type === 'integer' || type === 'number'
          ? 'integer'
          : type === 'group' || type === 'simpletable'
            ? 'list'
            : 'template';
    const def: RegistryParameterDefinition = {
      key,
      type: normalizedType,
      description: typeof param?.help === 'string' ? param.help : typeof param?.displayName === 'string' ? param.displayName : undefined,
    };

    const isRequired = Boolean(param?.isRequired) || Boolean(param?.alwaysInSummary);
    if (isRequired) requiredParameters.push(def);
    else optionalParameters.push(def);

    if (param?.defaultValue !== undefined && param.defaultValue !== null) {
      const value = param.defaultValue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        defaults[key] = value;
      }
    }
  }

  return { requiredParameters, optionalParameters, defaults };
}

function inferContainerContext(info: any, fallback: 'WEB' | 'SERVER' | 'UNKNOWN'): TemplateRegistryEntry['containerContext'] {
  const contexts = Array.isArray(info?.containerContexts) ? info.containerContexts.map((v: any) => String(v).toUpperCase()) : [];
  if (contexts.includes('SERVER')) return 'SERVER';
  if (contexts.includes('WEB')) return 'WEB';
  return fallback;
}

function buildExamplePayload(entityKind: TemplateRegistryEntry['entityKind'], entry: TemplateRegistryEntry): Record<string, unknown> {
  const parameter = [
    ...entry.requiredParameters.map((p) => ({
      key: p.key,
      type: p.type || 'template',
      value: entry.defaults[p.key] !== undefined ? String(entry.defaults[p.key]) : `PLACEHOLDER_${p.key.toUpperCase()}`,
    })),
  ];
  if (entityKind === 'tag') {
    return { name: `Template - ${entry.repository}`, type: entry.type, parameter };
  }
  if (entityKind === 'variable') {
    return { name: `Template Variable - ${entry.repository}`, type: entry.type, parameter };
  }
  if (entityKind === 'client') {
    return { name: `Template Client - ${entry.repository}`, type: entry.type, parameter };
  }
  if (entityKind === 'transformation') {
    return { name: `Template Transformation - ${entry.repository}`, type: entry.type, parameter };
  }
  return { type: entry.type, parameter };
}

async function tryVerifyImport(
  owner: string,
  repository: string,
  workspacePath: string,
  context: 'WEB' | 'SERVER' | 'UNKNOWN'
): Promise<TemplateRegistryEntry> {
  const entry = baseEntry(owner, repository);
  entry.containerContext = context;
  entry.entityKind = inferEntityKind(repository);
  const tagmanager = getTagManagerClient();
  let response: tagmanager_v2.Schema$CustomTemplate | null = null;
  let failureMessage = '';
  let failureType: VerifyErrorType = 'UNKNOWN';
  let failureCode = '';

  try {
    const wsStatus = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.getStatus({ path: workspacePath })
    );
    if (wsStatus.mergeConflict?.length || wsStatus.workspaceChange?.length) {
      entry.status = 'broken';
      entry.lastVerifiedAt = new Date().toISOString();
      entry.verificationCode = 'WORKSPACE_STATE_INVALID';
      entry.lastErrorType = 'WORKSPACE_STATE_INVALID';
      entry.lastErrorMessage = 'Workspace has conflict/sync state; verification skipped.';
      entry.verificationNote = `Import preflight failed in ${context}: workspace state invalid`;
      return entry;
    }
  } catch {
    // Non-fatal preflight issue; continue with import attempt.
  }

  try {
    response = await gtmApiCall(() =>
      tagmanager.accounts.containers.workspaces.templates.import_from_gallery({
        parent: workspacePath,
        acknowledgePermissions: true,
        galleryOwner: owner,
        galleryRepository: repository,
      })
    );
  } catch (error) {
    const msg = String((error as any)?.message || '');
    failureMessage = msg;
    const lower = msg.toLowerCase();
    const code = Number((error as any)?.response?.data?.error?.code || (error as any)?.code || 0);
    failureCode = String(code || '');
    if (lower.includes('not found') || code === 404) failureType = 'TEMPLATE_NOT_FOUND';
    else if (lower.includes('context') || lower.includes('unsupported in this container')) failureType = 'TEMPLATE_CONTEXT_MISMATCH';
    else if (lower.includes('permission') || lower.includes('denied') || code === 403) failureType = 'TEMPLATE_PERMISSION_DENIED';
    else if (lower.includes('workspace') && (lower.includes('state') || lower.includes('submitted') || lower.includes('conflict'))) {
      failureType = 'WORKSPACE_STATE_INVALID';
    }
    if (msg.toLowerCase().includes('duplicate name')) {
      try {
        const listed = await gtmApiCall(() =>
          tagmanager.accounts.containers.workspaces.templates.list({
            parent: workspacePath,
          })
        );
        const candidates = listed.template || [];
        for (const item of candidates) {
          if (
            item.galleryReference?.owner?.toLowerCase() === owner.toLowerCase() &&
            item.galleryReference?.repository?.toLowerCase() === repository.toLowerCase()
          ) {
            if (!item.path) continue;
            response = await gtmApiCall(() =>
              tagmanager.accounts.containers.workspaces.templates.get({
                path: item.path!,
              })
            );
            break;
          }
        }
      } catch (nested) {
        failureMessage = `${failureMessage} | duplicate-lookup failed: ${String((nested as any)?.message || nested)}`;
      }
    }
  }

  if (!response) {
    entry.status = 'broken';
    entry.lastVerifiedAt = new Date().toISOString();
    entry.verificationCode = failureCode || failureType;
    entry.lastErrorType = failureType;
    entry.lastErrorMessage = failureMessage || 'unknown error';
    entry.verificationNote = `Import failed in ${context} (${failureType}): ${failureMessage || 'unknown error'}`;
    return entry;
  }
  const info = parseInfoSection(response.templateData || undefined);
  const parsed = buildParameterDefs(info);
  const inferredContext = inferContainerContext(info, context);
  const inferredEntityKind = entry.entityKind === 'unknown' ? inferEntityKind(repository) : entry.entityKind;
  entry.status = 'verified';
  entry.entityKind = inferredEntityKind;
  entry.containerContext = inferredContext;
  entry.type = response.templateId || undefined;
  entry.sha = response.galleryReference?.version || undefined;
  entry.requiredParameters = parsed.requiredParameters;
  entry.optionalParameters = parsed.optionalParameters;
  entry.defaults = parsed.defaults;
  entry.examplePayload = buildExamplePayload(entry.entityKind, entry);
  entry.lastVerifiedAt = new Date().toISOString();
  entry.verificationNote = `Imported successfully in ${context} workspace`;
  entry.verificationCode = 'IMPORT_OK';
  entry.lastErrorType = undefined;
  entry.lastErrorMessage = undefined;
  return entry;
}

function orderContextsForRepo(
  repository: string,
  contexts: Array<{ workspacePath: string; context: 'WEB' | 'SERVER' | 'UNKNOWN' }>
): Array<{ workspacePath: string; context: 'WEB' | 'SERVER' | 'UNKNOWN' }> {
  const name = repository.toLowerCase();
  const preferWeb = name.includes('web') && !name.includes('server');
  const preferServer = name.includes('server') || name.includes('client') || name.includes('capi');
  const score = (ctx: 'WEB' | 'SERVER' | 'UNKNOWN'): number => {
    if (preferWeb) return ctx === 'WEB' ? 0 : ctx === 'SERVER' ? 1 : 2;
    if (preferServer) return ctx === 'SERVER' ? 0 : ctx === 'WEB' ? 1 : 2;
    return ctx === 'SERVER' ? 0 : ctx === 'WEB' ? 1 : 2;
  };
  return [...contexts].sort((a, b) => score(a.context) - score(b.context));
}

async function main() {
  const args = parseArgs(process.argv);
  const registry = await loadTemplateRegistry();
  const repos = await listOwnerRepositories(args.owner);

  let canVerify = false;
  if (args.verify) {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      throw new Error('Not authenticated. Run `npm run auth` first.');
    }
    initTagManagerClient(auth);
    canVerify = true;
  }

  const contexts: Array<{ workspacePath: string; context: 'WEB' | 'SERVER' | 'UNKNOWN' }> = [];
  if (canVerify && args.webWorkspacePath) {
    contexts.push({
      workspacePath: args.webWorkspacePath,
      context: await inferContextFromWorkspace(args.webWorkspacePath),
    });
  }
  if (canVerify && args.serverWorkspacePath) {
    contexts.push({
      workspacePath: args.serverWorkspacePath,
      context: await inferContextFromWorkspace(args.serverWorkspacePath),
    });
  }

  console.log(`Seeding template registry for owner=${args.owner} repos=${repos.length}`);
  if (canVerify) {
    console.log(`Verification workspaces configured: ${contexts.map((c) => c.context).join(', ') || 'none'}`);
  } else {
    console.log('Verification disabled');
  }

  for (const repository of repos) {
    let entry = baseEntry(args.owner, repository);

    if (canVerify && contexts.length > 0) {
      let verified: TemplateRegistryEntry | null = null;
      const notes: string[] = [];
      for (const context of orderContextsForRepo(repository, contexts)) {
        const result = await tryVerifyImport(args.owner, repository, context.workspacePath, context.context);
        if (result.status === 'verified') {
          verified = result;
          break;
        }
        notes.push(result.verificationNote);
      }
      if (verified) {
        entry = verified;
      } else {
        entry.status = 'broken';
        entry.lastVerifiedAt = new Date().toISOString();
        entry.verificationCode = 'VERIFY_FAILED';
        entry.lastErrorType = 'UNKNOWN';
        entry.lastErrorMessage = notes.join(' | ').slice(0, 1000);
        entry.verificationNote = notes.join(' | ').slice(0, 1000);
      }
    }

    upsertRegistryEntry(registry, entry);
    console.log(`${entry.owner}/${entry.repository} -> ${entry.status}`);
  }

  await saveTemplateRegistry(registry);
  console.log(`Registry updated: ${repos.length} entries processed`);
}

main().catch((error) => {
  console.error('Failed to seed template registry:', error);
  process.exit(1);
});
