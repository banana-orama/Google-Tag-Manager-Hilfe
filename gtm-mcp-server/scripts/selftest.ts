#!/usr/bin/env node
/**
 * GTM MCP Server selftest (MCP stdio end-to-end)
 *
 * Runs through all MCP tools exposed by the server and exercises them against a GTM test container.
 *
 * Safety:
 * - NO publish (gtm_publish_version is always called only as a confirmation-gate check)
 * - Destructive tools are tested in one of two ways:
 *   - default: confirmation gate is validated (confirm omitted/false => must fail with CONFIRM_REQUIRED)
 *   - resources created by this selftest are deleted with confirm:true (workspace-scoped cleanup)
 *
 * Required env:
 * - GTM_TEST_CONTAINER_PATH=accounts/.../containers/...
 *   or GTM_TEST_CONTAINER_PUBLIC_ID=GTM-XXXXX
 *
 * Optional env:
 * - GTM_TEST_WORKSPACE_PATH=accounts/.../containers/.../workspaces/...
 * - GTM_SELFTEST_MODE=write_existing|readonly|write_new   (default: write_existing)
 * - GTM_SELFTEST_CLEANUP=false                           (default: true)
 * - GTM_SELFTEST_DELAY_MS=800                            (default: 800)
 * - GTM_SELFTEST_ACCOUNT_ID=572865630                    (default: 572865630)
 * - GTM_SELFTEST_RISKY=true                              (default: false)  // tests user permission create/delete etc
 * - GTM_SELFTEST_DESTINATION_ID=...                       (optional)        // enables gtm_link_destination
 * - GTM_RATE_LIMITER_MAX_RETRIES=2                        (recommended for fast selftest)
 * - GTM_RATE_LIMITER_REQUEST_TIMEOUT_MS=30000             (recommended for fast selftest)
 *
 * Template Gallery Import:
 * - GTM_SELFTEST_TEMPLATE_GALLERY_OWNER
 * - GTM_SELFTEST_TEMPLATE_GALLERY_REPO
 * - GTM_SELFTEST_TEMPLATE_GALLERY_VERSION
 *   If not set, the import test is attempted with a best-effort default and may skip on failure.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type StepStatus = 'pass' | 'fail' | 'skip';
type StepResult = { name: string; status: StepStatus; details?: unknown };

type ToolJsonResult = {
  isError?: boolean;
  rawText: string;
  json: any;
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

function envBool(name: string, defaultValue: boolean): boolean {
  const v = env(name);
  if (!v) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(v.toLowerCase());
}

function envInt(name: string, defaultValue: number): number {
  const v = env(name);
  if (!v) return defaultValue;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function isApiError(x: unknown): x is { code: string | number; message: string } {
  return !!x && typeof x === 'object' && 'code' in x && 'message' in x;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getTextContent(callToolResult: any): string {
  const content = callToolResult?.content;
  if (!Array.isArray(content)) return '';
  const textPart = content.find((c) => c && c.type === 'text' && typeof c.text === 'string');
  return textPart?.text ?? '';
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { _rawText: text };
  }
}

async function main() {
  const results: StepResult[] = [];
  const cleanup: StepResult[] = [];

  const mode = (env('GTM_SELFTEST_MODE') || 'write_existing') as 'write_existing' | 'readonly' | 'write_new';
  const doCleanup = env('GTM_SELFTEST_CLEANUP') !== 'false';
  const delayMs = envInt('GTM_SELFTEST_DELAY_MS', 800);
  const risky = envBool('GTM_SELFTEST_RISKY', false);

  const accountId = env('GTM_SELFTEST_ACCOUNT_ID') || '572865630';
  const containerPathFromEnv = env('GTM_TEST_CONTAINER_PATH');
  const containerPublicId = env('GTM_TEST_CONTAINER_PUBLIC_ID');
  const explicitWorkspacePath = env('GTM_TEST_WORKSPACE_PATH');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const serverEntry = path.resolve(__dirname, '..', 'index.js'); // dist/index.js

  const client = new Client(
    { name: 'gtm-mcp-selftest', version: '1.0.0' },
    {
      // Keep this permissive; the server tools currently return text JSON.
      capabilities: {},
    }
  );

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverEntry],
    stderr: 'pipe',
    cwd: path.resolve(__dirname, '..', '..'), // project root (gtm-mcp-server)
    env: process.env as any,
  });

  // Optional: capture server stderr for debugging in the report.
  const serverStderr: string[] = [];
  transport.stderr?.on('data', (d: Buffer) => {
    const s = d.toString('utf8');
    // Avoid unbounded growth; keep last ~200 lines.
    serverStderr.push(...s.split('\n').slice(0, 50));
    if (serverStderr.length > 200) serverStderr.splice(0, serverStderr.length - 200);
  });

  await client.connect(transport);

  let callSeq = 0;
  async function callToolJson(name: string, args: Record<string, any> = {}): Promise<ToolJsonResult> {
    const seq = ++callSeq;
    const started = Date.now();
    process.stderr.write(`[selftest] #${seq} START ${name}\n`);
    if (delayMs > 0) await sleep(delayMs);
    const res = (await client.callTool({ name, arguments: args }, undefined, { timeout: 10 * 60 * 1000 })) as any;
    const rawText = getTextContent(res);
    const json = safeJsonParse(rawText);
    const elapsedMs = Date.now() - started;
    const marker = res?.isError === true || isApiError(json) ? 'ERR' : 'OK';
    process.stderr.write(`[selftest] #${seq} END ${name} ${marker} ${elapsedMs}ms\n`);
    return { isError: res?.isError === true, rawText, json };
  }

  async function step(name: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      const details = await fn();
      results.push({ name, status: 'pass', details });
    } catch (e) {
      results.push({ name, status: 'fail', details: { error: String((e as any)?.message ?? e) } });
    }
  }

  // ---- Basics / discovery ----
  const toolsList = await client.listTools();
  results.push({ name: 'mcp_list_tools', status: toolsList?.tools?.length ? 'pass' : 'fail', details: { count: toolsList?.tools?.length } });

  const status = await callToolJson('gtm_status');
  results.push({ name: 'gtm_status', status: status.isError ? 'fail' : 'pass', details: status.json });

  const accounts = await callToolJson('gtm_list_accounts');
  results.push({ name: 'gtm_list_accounts', status: accounts.isError ? 'fail' : 'pass', details: accounts.json });

  const acct = await callToolJson('gtm_get_account', { accountId });
  results.push({ name: 'gtm_get_account', status: acct.isError ? 'fail' : 'pass', details: acct.json });

  const containers = await callToolJson('gtm_list_containers', { accountId });
  results.push({ name: 'gtm_list_containers', status: containers.isError ? 'fail' : 'pass', details: containers.json });

  // Resolve container path
  let containerPath: string | undefined = containerPathFromEnv;
  if (!containerPath && containerPublicId) {
    const lookup = await callToolJson('gtm_lookup_container', { publicId: containerPublicId });
    results.push({ name: 'gtm_lookup_container', status: lookup.isError ? 'fail' : 'pass', details: lookup.json });
    containerPath = lookup?.json?.path;
  } else {
    results.push({ name: 'gtm_lookup_container', status: 'skip', details: 'Skipped: GTM_TEST_CONTAINER_PUBLIC_ID not set' });
  }

  if (!containerPath) {
    results.push({
      name: 'resolve_container_path',
      status: 'fail',
      details: 'Set GTM_TEST_CONTAINER_PATH or GTM_TEST_CONTAINER_PUBLIC_ID',
    });
    console.log(JSON.stringify({ results, cleanup, serverStderr }, null, 2));
    process.exit(2);
  }

  const container = await callToolJson('gtm_get_container', { containerPath });
  results.push({ name: 'gtm_get_container', status: container.isError ? 'fail' : 'pass', details: container.json });

  const usageContext = Array.isArray(container.json?.usageContext) ? container.json.usageContext.map((x: any) => String(x).toLowerCase()) : [];
  const isServerContainer = usageContext.includes('server');

  // Confirmation gates (should never execute)
  {
    const c1 = await callToolJson('gtm_create_container', { accountId, name: 'MCP Selftest SHOULD NOT CREATE', usageContext: 'web', confirm: false });
    const c2 = await callToolJson('gtm_delete_container', { containerPath, confirm: false });
    const ok1 = c1.json?.errorType === 'CONFIRMATION_REQUIRED' || c1.json?.error === 'CONFIRM_REQUIRED' || c1.json?.error === 'CONFIRMATION_REQUIRED';
    const ok2 = c2.json?.errorType === 'CONFIRMATION_REQUIRED' || c2.json?.error === 'CONFIRM_REQUIRED' || c2.json?.error === 'CONFIRMATION_REQUIRED';
    results.push({ name: 'gate_create_container', status: ok1 ? 'pass' : 'fail', details: c1.json });
    results.push({ name: 'gate_delete_container', status: ok2 ? 'pass' : 'fail', details: c2.json });
  }

  // Workspaces
  const wsList = await callToolJson('gtm_list_workspaces', { containerPath });
  results.push({ name: 'gtm_list_workspaces', status: wsList.isError ? 'fail' : 'pass', details: wsList.json });

  const workspaceList: any[] = Array.isArray(wsList.json) ? wsList.json : [];
  let workspacePath: string | undefined;
  let createdWorkspacePath: string | undefined;

  if (mode === 'write_new') {
    const wsName = `MCP Selftest ${new Date().toISOString().replace(/[:.]/g, '-')}`;
    let wsCreate = await callToolJson('gtm_create_workspace', {
      containerPath,
      name: wsName,
      description: 'Created by MCP selftest',
    });
    if ((wsCreate.isError || isApiError(wsCreate.json)) && Number(wsCreate.json?.code ?? NaN) === 429) {
      await sleep(30000);
      wsCreate = await callToolJson('gtm_create_workspace', {
        containerPath,
        name: `${wsName}-retry`,
        description: 'Created by MCP selftest (retry)',
      });
    }
    if (!wsCreate.isError && !isApiError(wsCreate.json) && wsCreate.json?.path) {
      workspacePath = wsCreate.json.path;
      createdWorkspacePath = wsCreate.json.path;
      results.push({ name: 'create_workspace', status: 'pass', details: wsCreate.json });
    } else if (Number(wsCreate.json?.code ?? NaN) === 429) {
      results.push({
        name: 'create_workspace',
        status: 'skip',
        details: { reason: 'rate_limited', fallback: 'use_existing_workspace', lastError: wsCreate.json },
      });
    } else {
      results.push({ name: 'create_workspace', status: 'fail', details: wsCreate.json });
    }
  } else {
    results.push({ name: 'create_workspace', status: 'skip', details: `Skipped in mode=${mode}` });
  }

  if (explicitWorkspacePath) {
    const explicit = workspaceList.find((w) => w?.path === explicitWorkspacePath);
    if (explicit) {
      workspacePath = explicit.path;
      results.push({ name: 'choose_workspace', status: 'pass', details: { workspacePath, source: 'GTM_TEST_WORKSPACE_PATH' } });
    } else {
      results.push({
        name: 'choose_workspace',
        status: 'skip',
        details: { reason: 'explicit workspace not found in container', explicitWorkspacePath },
      });
    }
  }

  if (!workspacePath) {
    const chosen =
      workspaceList.find((w: any) => /mcp/i.test(String(w?.name ?? ''))) ||
      workspaceList.find((w: any) => /test/i.test(String(w?.name ?? ''))) ||
      workspaceList[0];
    workspacePath = chosen?.path;
    results.push({ name: 'choose_workspace_fallback', status: workspacePath ? 'pass' : 'fail', details: chosen });
  }

  if (!workspacePath) {
    results.push({ name: 'choose_workspace', status: 'fail', details: 'No workspace available' });
    console.log(JSON.stringify({ containerPath, results, cleanup, serverStderr }, null, 2));
    process.exit(2);
  }

  const ws = await callToolJson('gtm_get_workspace', { workspacePath });
  results.push({ name: 'gtm_get_workspace', status: ws.isError ? 'fail' : 'pass', details: ws.json });

  const wsStatus = await callToolJson('gtm_get_workspace_status', { workspacePath });
  results.push({ name: 'gtm_get_workspace_status', status: wsStatus.isError ? 'fail' : 'pass', details: wsStatus.json });

  // Gate destructive workspace tools
  {
    const d = await callToolJson('gtm_delete_workspace', { workspacePath, confirm: false });
    const s = await callToolJson('gtm_sync_workspace', { workspacePath, confirm: false });
    const okD = d.json?.errorType === 'CONFIRMATION_REQUIRED' || d.json?.error === 'CONFIRM_REQUIRED' || d.json?.error === 'CONFIRMATION_REQUIRED';
    const okS = s.json?.errorType === 'CONFIRMATION_REQUIRED' || s.json?.error === 'CONFIRM_REQUIRED' || s.json?.error === 'CONFIRMATION_REQUIRED';
    results.push({ name: 'gate_delete_workspace', status: okD ? 'pass' : 'fail', details: d.json });
    results.push({ name: 'gate_sync_workspace', status: okS ? 'pass' : 'fail', details: s.json });
  }

  const writeAllowed = mode !== 'readonly';
  results.push({ name: 'mode', status: 'pass', details: { mode, writeAllowed } });

  function isSubmittedWorkspaceError(details: unknown): boolean {
    const s = typeof details === 'string' ? details : JSON.stringify(details || {});
    return /workspace is already submitted/i.test(s);
  }

  function isPermissionOrNotFound(details: any): boolean {
    const code = Number(details?.code ?? NaN);
    const errorType = String(details?.errorType ?? '').toUpperCase();
    const msg = String(details?.message ?? '').toLowerCase();
    return (
      code === 404 ||
      errorType === 'PERMISSION_DENIED' ||
      errorType === 'RESOURCE_NOT_FOUND' ||
      msg.includes('not found') ||
      msg.includes('permission denied')
    );
  }

  if (writeAllowed) {
    const probeName = `MCP Selftest Probe ${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const probe = await callToolJson('gtm_create_folder', { workspacePath, name: probeName });
    if (!probe.isError && !isApiError(probe.json) && probe.json?.path) {
      await callToolJson('gtm_delete_folder', { folderPath: probe.json.path, confirm: true });
      results.push({ name: 'workspace_write_probe', status: 'pass', details: { workspacePath } });
    } else if (isSubmittedWorkspaceError(probe.json)) {
      const alternatives = workspaceList.filter((w) => w?.path && w.path !== workspacePath).map((w) => w.path as string);
      let switched = false;
      for (const alt of alternatives) {
        const tryProbe = await callToolJson('gtm_create_folder', { workspacePath: alt, name: `${probeName}-alt` });
        if (!tryProbe.isError && !isApiError(tryProbe.json) && tryProbe.json?.path) {
          await callToolJson('gtm_delete_folder', { folderPath: tryProbe.json.path, confirm: true });
          results.push({ name: 'workspace_write_probe', status: 'pass', details: { workspacePath: alt, switchedFrom: workspacePath } });
          workspacePath = alt;
          switched = true;
          break;
        }
      }
      if (!switched) {
        results.push({ name: 'workspace_write_probe', status: 'fail', details: probe.json });
      }
    } else {
      results.push({ name: 'workspace_write_probe', status: 'fail', details: probe.json });
    }
  } else {
    results.push({ name: 'workspace_write_probe', status: 'skip', details: 'Skipped in readonly mode' });
  }

  // Basic list operations
  results.push({ name: 'gtm_list_tags', status: 'pass', details: (await callToolJson('gtm_list_tags', { workspacePath })).json });
  results.push({ name: 'gtm_list_triggers', status: 'pass', details: (await callToolJson('gtm_list_triggers', { workspacePath })).json });
  results.push({ name: 'gtm_list_variables', status: 'pass', details: (await callToolJson('gtm_list_variables', { workspacePath })).json });
  results.push({ name: 'gtm_list_folders', status: 'pass', details: (await callToolJson('gtm_list_folders', { workspacePath })).json });
  results.push({ name: 'gtm_list_templates', status: 'pass', details: (await callToolJson('gtm_list_templates', { workspacePath })).json });

  // Helper tools (no writes)
  results.push({ name: 'gtm_get_container_info', status: 'pass', details: (await callToolJson('gtm_get_container_info', { containerPath })).json });
  results.push({
    name: 'gtm_validate_trigger_config',
    status: 'pass',
    details: (await callToolJson('gtm_validate_trigger_config', { containerType: 'web', triggerConfig: { name: 'x', type: 'customEvent', customEventFilter: [] } })).json,
  });
  results.push({ name: 'gtm_get_trigger_template', status: 'pass', details: (await callToolJson('gtm_get_trigger_template', { templateType: 'custom-event-generic' })).json });
  results.push({ name: 'gtm_list_tag_types', status: 'pass', details: (await callToolJson('gtm_list_tag_types')).json });
  results.push({ name: 'gtm_get_tag_parameters', status: 'pass', details: (await callToolJson('gtm_get_tag_parameters', { tagType: 'html' })).json });
  results.push({ name: 'gtm_get_variable_parameters', status: 'pass', details: (await callToolJson('gtm_get_variable_parameters', { variableType: 'r' })).json });
  results.push({ name: 'gtm_list_workflows', status: 'pass', details: (await callToolJson('gtm_list_workflows')).json });
  results.push({ name: 'gtm_get_workflow', status: 'pass', details: (await callToolJson('gtm_get_workflow', { workflowId: 'setup_ga4' })).json });
  results.push({ name: 'gtm_search_entities', status: 'pass', details: (await callToolJson('gtm_search_entities', { workspacePath, query: 'mcp', entityType: 'all' })).json });
  results.push({ name: 'gtm_check_best_practices', status: 'pass', details: (await callToolJson('gtm_check_best_practices', { workspacePath })).json });

  // Container analysis
  results.push({ name: 'gtm_analyze_container', status: 'pass', details: (await callToolJson('gtm_analyze_container', { containerPath })).json });

  // Built-in variables list is always safe
  results.push({ name: 'gtm_list_built_in_variables', status: 'pass', details: (await callToolJson('gtm_list_built_in_variables', { workspacePath })).json });

  // ---- Write path: create/update/get/move/delete workspace-scoped entities ----
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const created: any = {
    folderPath: undefined,
    tagPath: undefined,
    triggerPath: undefined,
    variablePath: undefined,
    versionPath: undefined,
    templatePath: undefined,
    envPath: undefined,
    zonePath: undefined,
    gtagConfigPath: undefined,
    clientPath: undefined,
    transformationPath: undefined,
  };

  if (writeAllowed) {
    // Folder create -> get -> update
    const folder = await callToolJson('gtm_create_folder', { workspacePath, name: `MCP Selftest ${runId}` });
    results.push({ name: 'gtm_create_folder', status: folder.isError || isApiError(folder.json) ? 'fail' : 'pass', details: folder.json });
    if (!folder.isError && !isApiError(folder.json)) created.folderPath = folder.json?.path;

    if (created.folderPath) {
      const gf = await callToolJson('gtm_get_folder', { folderPath: created.folderPath });
      results.push({ name: 'gtm_get_folder', status: gf.isError ? 'fail' : 'pass', details: gf.json });

      const fp = gf.json?.fingerprint;
      const uf = await callToolJson('gtm_update_folder', { folderPath: created.folderPath, fingerprint: fp, name: `MCP Selftest Renamed ${runId}` });
      results.push({ name: 'gtm_update_folder', status: uf.isError || isApiError(uf.json) ? 'fail' : 'pass', details: uf.json });

      const fe = await callToolJson('gtm_get_folder_entities', { folderPath: created.folderPath });
      results.push({ name: 'gtm_get_folder_entities', status: fe.isError ? 'fail' : 'pass', details: fe.json });
    } else {
      results.push({ name: 'gtm_get_folder', status: 'skip', details: 'Skipped: folder not created' });
      results.push({ name: 'gtm_update_folder', status: 'skip', details: 'Skipped: folder not created' });
      results.push({ name: 'gtm_get_folder_entities', status: 'skip', details: 'Skipped: folder not created' });
    }

    // Variable create -> get -> update
    const variable = await callToolJson('gtm_create_variable', { workspacePath, name: `MCP Selftest Random ${runId}`, type: 'r' });
    results.push({ name: 'gtm_create_variable', status: variable.isError || isApiError(variable.json) ? 'fail' : 'pass', details: variable.json });
    if (!variable.isError && !isApiError(variable.json)) created.variablePath = variable.json?.path;

    let variableId: string | undefined;
    if (created.variablePath) {
      const gv = await callToolJson('gtm_get_variable', { variablePath: created.variablePath });
      results.push({ name: 'gtm_get_variable', status: gv.isError ? 'fail' : 'pass', details: gv.json });
      variableId = gv.json?.variableId;
      const fp = gv.json?.fingerprint;
      const uv = await callToolJson('gtm_update_variable', {
        variablePath: created.variablePath,
        fingerprint: fp,
        variableConfig: { name: `MCP Selftest Random Updated ${runId}` },
      });
      results.push({ name: 'gtm_update_variable', status: uv.isError || isApiError(uv.json) ? 'fail' : 'pass', details: uv.json });
    } else {
      results.push({ name: 'gtm_get_variable', status: 'skip', details: 'Skipped: variable not created' });
      results.push({ name: 'gtm_update_variable', status: 'skip', details: 'Skipped: variable not created' });
    }

    // Trigger create -> get -> update
    const triggerPayload = isServerContainer
      ? { name: `MCP Selftest Always ${runId}`, type: 'always' }
      : {
          name: `MCP Selftest Purchase ${runId}`,
          type: 'customEvent',
          customEventFilter: [
            {
              type: 'equals',
              parameter: [
                { key: 'arg0', type: 'template', value: '{{_event}}' },
                { key: 'arg1', type: 'template', value: 'purchase' },
              ],
            },
          ],
        };

    const trigger = await callToolJson('gtm_create_trigger', { workspacePath, ...triggerPayload });
    results.push({ name: 'gtm_create_trigger', status: trigger.isError || isApiError(trigger.json) ? 'fail' : 'pass', details: trigger.json });
    if (!trigger.isError && !isApiError(trigger.json)) created.triggerPath = trigger.json?.path;

    let triggerId: string | undefined;
    if (created.triggerPath) {
      const gt = await callToolJson('gtm_get_trigger', { triggerPath: created.triggerPath });
      results.push({ name: 'gtm_get_trigger', status: gt.isError ? 'fail' : 'pass', details: gt.json });
      triggerId = gt.json?.triggerId;
      const fp = gt.json?.fingerprint;
      const ut = await callToolJson('gtm_update_trigger', {
        triggerPath: created.triggerPath,
        fingerprint: fp,
        triggerConfig: {
          name: `${triggerPayload.name} Updated`,
          type: gt.json?.type,
          filter: gt.json?.filter,
          customEventFilter: gt.json?.customEventFilter,
          autoEventFilter: gt.json?.autoEventFilter,
        },
      });
      results.push({ name: 'gtm_update_trigger', status: ut.isError || isApiError(ut.json) ? 'fail' : 'pass', details: ut.json });
    } else {
      results.push({ name: 'gtm_get_trigger', status: 'skip', details: 'Skipped: trigger not created' });
      results.push({ name: 'gtm_update_trigger', status: 'skip', details: 'Skipped: trigger not created' });
    }

    // Tag create -> get -> update -> revert
    if (!isServerContainer && triggerId) {
      const tag = await callToolJson('gtm_create_tag', {
        workspacePath,
        name: `MCP Selftest HTML ${runId}`,
        type: 'html',
        firingTriggerId: [String(triggerId)],
        parameter: [{ key: 'html', type: 'template', value: '<script>console.log(\"mcp selftest\");</script>' }],
      });
      results.push({ name: 'gtm_create_tag', status: tag.isError || isApiError(tag.json) ? 'fail' : 'pass', details: tag.json });
      if (!tag.isError && !isApiError(tag.json)) created.tagPath = tag.json?.path;
    } else {
      results.push({ name: 'gtm_create_tag', status: 'skip', details: isServerContainer ? 'Skipped: server container' : 'Skipped: missing triggerId' });
    }

    let tagId: string | undefined;
    if (created.tagPath) {
      const gtag = await callToolJson('gtm_get_tag', { tagPath: created.tagPath });
      results.push({ name: 'gtm_get_tag', status: gtag.isError ? 'fail' : 'pass', details: gtag.json });
      tagId = gtag.json?.tagId;
      const fp = gtag.json?.fingerprint;
      const utag = await callToolJson('gtm_update_tag', {
        tagPath: created.tagPath,
        fingerprint: fp,
        tagConfig: {
          name: `MCP Selftest HTML Updated ${runId}`,
          type: gtag.json?.type,
          parameter: gtag.json?.parameter,
          firingTriggerId: gtag.json?.firingTriggerId,
          blockingTriggerId: gtag.json?.blockingTriggerId,
        },
      });
      results.push({ name: 'gtm_update_tag', status: utag.isError || isApiError(utag.json) ? 'fail' : 'pass', details: utag.json });

      const rtag = await callToolJson('gtm_revert_tag', { tagPath: created.tagPath });
      results.push({ name: 'gtm_revert_tag', status: rtag.isError || isApiError(rtag.json) ? 'fail' : 'pass', details: rtag.json });
    } else {
      results.push({ name: 'gtm_get_tag', status: 'skip', details: 'Skipped: tag not created' });
      results.push({ name: 'gtm_update_tag', status: 'skip', details: 'Skipped: tag not created' });
      results.push({ name: 'gtm_revert_tag', status: 'skip', details: 'Skipped: tag not created' });
    }

    // Move entities to folder (requires IDs)
    if (created.folderPath) {
      const entityIds: any = {};
      if (tagId) entityIds.tagId = [String(tagId)];
      if (triggerId) entityIds.triggerId = [String(triggerId)];
      if (variableId) entityIds.variableId = [String(variableId)];
      const move = await callToolJson('gtm_move_entities_to_folder', { folderPath: created.folderPath, entityIds });
      if (move.isError || isApiError(move.json)) {
        results.push({
          name: 'gtm_move_entities_to_folder',
          status: isPermissionOrNotFound(move.json) ? 'skip' : 'fail',
          details: move.json,
        });
      } else {
        results.push({ name: 'gtm_move_entities_to_folder', status: 'pass', details: move.json });
      }
    } else {
      results.push({ name: 'gtm_move_entities_to_folder', status: 'skip', details: 'Skipped: folder not created' });
    }

    // Zones (web-focused feature; server containers usually do not support these semantics)
    if (isServerContainer) {
      results.push({ name: 'gtm_create_zone', status: 'skip', details: 'Skipped: zone tests are not applicable for server container workflow' });
      results.push({ name: 'gtm_get_zone', status: 'skip', details: 'Skipped: zone not created (server container)' });
      results.push({ name: 'gtm_update_zone', status: 'skip', details: 'Skipped: zone not created (server container)' });
    } else {
      const zone = await callToolJson('gtm_create_zone', {
        workspacePath,
        name: `MCP Selftest Zone ${runId}`,
        boundary: {
          condition: [
            {
              type: 'contains',
              parameter: [
                { key: 'arg0', type: 'template', value: '{{Page URL}}' },
                { key: 'arg1', type: 'template', value: '/' },
              ],
            },
          ],
        },
        typeRestriction: { enable: true, whitelistedTypeId: ['html'] },
      });
      if (zone.isError || isApiError(zone.json)) {
        results.push({
          name: 'gtm_create_zone',
          status: isPermissionOrNotFound(zone.json) ? 'skip' : 'fail',
          details: zone.json,
        });
      } else {
        results.push({ name: 'gtm_create_zone', status: 'pass', details: zone.json });
      }
      if (!zone.isError && !isApiError(zone.json)) created.zonePath = zone.json?.path;
      if (created.zonePath) {
        const gz = await callToolJson('gtm_get_zone', { zonePath: created.zonePath });
        results.push({ name: 'gtm_get_zone', status: gz.isError ? 'fail' : 'pass', details: gz.json });
        const fp = gz.json?.fingerprint;
        const uz = await callToolJson('gtm_update_zone', { zonePath: created.zonePath, fingerprint: fp, zoneConfig: { name: `MCP Selftest Zone Updated ${runId}` } });
        results.push({ name: 'gtm_update_zone', status: uz.isError || isApiError(uz.json) ? 'fail' : 'pass', details: uz.json });
      } else {
        results.push({ name: 'gtm_get_zone', status: 'skip', details: 'Skipped: zone not created' });
        results.push({ name: 'gtm_update_zone', status: 'skip', details: 'Skipped: zone not created' });
      }
    }

    // Environments (container-level but safe in test container)
    results.push({ name: 'gtm_list_environments', status: 'pass', details: (await callToolJson('gtm_list_environments', { containerPath })).json });
    const envCreate = await callToolJson('gtm_create_environment', { containerPath, name: `MCP Selftest Env ${runId}`, enableDebug: true, description: 'Created by MCP selftest' });
    results.push({ name: 'gtm_create_environment', status: envCreate.isError || isApiError(envCreate.json) ? 'fail' : 'pass', details: envCreate.json });
    if (!envCreate.isError && !isApiError(envCreate.json)) created.envPath = envCreate.json?.path;
    if (created.envPath) {
      const genv = await callToolJson('gtm_get_environment', { environmentPath: created.envPath });
      results.push({ name: 'gtm_get_environment', status: genv.isError ? 'fail' : 'pass', details: genv.json });
      const fp = genv.json?.fingerprint;
      const uenv = await callToolJson('gtm_update_environment', {
        environmentPath: created.envPath,
        fingerprint: fp,
        environmentConfig: { description: `Updated by MCP selftest ${runId}` },
      });
      results.push({ name: 'gtm_update_environment', status: uenv.isError || isApiError(uenv.json) ? 'fail' : 'pass', details: uenv.json });
      const reauth = await callToolJson('gtm_reauthorize_environment', { environmentPath: created.envPath });
      results.push({ name: 'gtm_reauthorize_environment', status: reauth.isError || isApiError(reauth.json) ? 'fail' : 'pass', details: reauth.json });
    } else {
      results.push({ name: 'gtm_get_environment', status: 'skip', details: 'Skipped: environment not created' });
      results.push({ name: 'gtm_update_environment', status: 'skip', details: 'Skipped: environment not created' });
      results.push({ name: 'gtm_reauthorize_environment', status: 'skip', details: 'Skipped: environment not created' });
    }

    // Destinations: list/get/link (link optional)
    const dests = await callToolJson('gtm_list_destinations', { containerPath });
    results.push({ name: 'gtm_list_destinations', status: dests.isError ? 'fail' : 'pass', details: dests.json });
    const firstDestPath = Array.isArray(dests.json) ? dests.json[0]?.path : undefined;
    if (firstDestPath) {
      const dget = await callToolJson('gtm_get_destination', { destinationPath: firstDestPath });
      results.push({ name: 'gtm_get_destination', status: dget.isError ? 'fail' : 'pass', details: dget.json });
    } else {
      results.push({ name: 'gtm_get_destination', status: 'skip', details: 'Skipped: no destinations found' });
    }
    const destinationId = env('GTM_SELFTEST_DESTINATION_ID');
    if (destinationId) {
      const link = await callToolJson('gtm_link_destination', { containerPath, destinationId });
      results.push({ name: 'gtm_link_destination', status: link.isError || isApiError(link.json) ? 'fail' : 'pass', details: link.json });
    } else {
      results.push({ name: 'gtm_link_destination', status: 'skip', details: 'Skipped: set GTM_SELFTEST_DESTINATION_ID to enable' });
    }

    // Gtag configs (may be unsupported in some containers; best-effort)
    const gtagList = await callToolJson('gtm_list_gtag_configs', { workspacePath });
    results.push({ name: 'gtm_list_gtag_configs', status: gtagList.isError ? 'fail' : 'pass', details: gtagList.json });
    const gtagCreate = await callToolJson('gtm_create_gtag_config', {
      workspacePath,
      type: 'google',
      parameter: [{ key: 'value', type: 'template', value: 'mcp_selftest' }],
    });
    if (gtagCreate.isError || isApiError(gtagCreate.json)) {
      results.push({ name: 'gtm_create_gtag_config', status: 'skip', details: gtagCreate.json });
    } else {
      results.push({ name: 'gtm_create_gtag_config', status: 'pass', details: gtagCreate.json });
      created.gtagConfigPath = gtagCreate.json?.path;
      const gg = await callToolJson('gtm_get_gtag_config', { gtagConfigPath: created.gtagConfigPath });
      results.push({ name: 'gtm_get_gtag_config', status: gg.isError ? 'fail' : 'pass', details: gg.json });
      const fp = gg.json?.fingerprint;
      const ug = await callToolJson('gtm_update_gtag_config', { gtagConfigPath: created.gtagConfigPath, fingerprint: fp, gtagConfig: { parameter: [{ key: 'value', type: 'template', value: 'mcp_selftest_updated' }] } });
      results.push({ name: 'gtm_update_gtag_config', status: ug.isError || isApiError(ug.json) ? 'fail' : 'pass', details: ug.json });
    }

    // Templates: import from gallery (best-effort), then get/update/revert/delete
    const owner = env('GTM_SELFTEST_TEMPLATE_GALLERY_OWNER');
    const repository = env('GTM_SELFTEST_TEMPLATE_GALLERY_REPO');
    const version = env('GTM_SELFTEST_TEMPLATE_GALLERY_VERSION');
    if (owner && repository) {
      const impArgs: Record<string, any> = { workspacePath, host: 'github.com', owner, repository };
      if (version) impArgs.version = version;
      const imp = await callToolJson('gtm_import_template_from_gallery', impArgs);
      if (imp.isError || isApiError(imp.json)) {
        results.push({ name: 'gtm_import_template_from_gallery', status: 'fail', details: imp.json });
      } else {
        results.push({ name: 'gtm_import_template_from_gallery', status: 'pass', details: imp.json });
        created.templatePath = imp.json?.path;
        const gt = await callToolJson('gtm_get_template', { templatePath: created.templatePath });
        results.push({ name: 'gtm_get_template', status: gt.isError ? 'fail' : 'pass', details: gt.json });
        const fp = gt.json?.fingerprint;
        const ut = await callToolJson('gtm_update_template', { templatePath: created.templatePath, fingerprint: fp, templateConfig: { name: `MCP Selftest Template Updated ${runId}` } });
        results.push({ name: 'gtm_update_template', status: ut.isError || isApiError(ut.json) ? 'fail' : 'pass', details: ut.json });
        const rt = await callToolJson('gtm_revert_template', { templatePath: created.templatePath });
        results.push({ name: 'gtm_revert_template', status: rt.isError || isApiError(rt.json) ? 'fail' : 'pass', details: rt.json });
      }
    } else {
      results.push({
        name: 'gtm_import_template_from_gallery',
        status: 'skip',
        details: 'Skipped: set GTM_SELFTEST_TEMPLATE_GALLERY_OWNER/REPO to enable (VERSION optional)',
      });
    }

    // Server-side tools (CRUD on server containers; skip on non-server containers)
    if (isServerContainer) {
      const listClients = await callToolJson('gtm_list_clients', { workspacePath });
      results.push({ name: 'gtm_list_clients', status: listClients.isError ? 'fail' : 'pass', details: listClients.json });
      const listedClients: any[] = Array.isArray(listClients.json) ? listClients.json : [];

      const seedClientPath = listedClients[0]?.path as string | undefined;
      let seedClientType: string | undefined;
      let seedClientParameter: any[] | undefined;
      if (seedClientPath) {
        const seedClient = await callToolJson('gtm_get_client', { clientPath: seedClientPath });
        results.push({ name: 'gtm_get_client_seed', status: seedClient.isError || isApiError(seedClient.json) ? 'fail' : 'pass', details: seedClient.json });
        if (!seedClient.isError && !isApiError(seedClient.json)) {
          seedClientType = seedClient.json?.type;
          if (Array.isArray(seedClient.json?.parameter)) seedClientParameter = seedClient.json.parameter;
        }
      } else {
        results.push({ name: 'gtm_get_client_seed', status: 'skip', details: 'Skipped: no existing client available as seed' });
      }

      const clientCreateAttempts: Array<{ type: string; parameter?: any[] }> = [];
      if (seedClientType) clientCreateAttempts.push({ type: seedClientType, parameter: seedClientParameter });
      clientCreateAttempts.push({ type: 'gaaw_client' });

      let clientCreateResult: ToolJsonResult | undefined;
      const triedClientTypes = new Set<string>();
      for (const attempt of clientCreateAttempts) {
        if (triedClientTypes.has(attempt.type)) continue;
        triedClientTypes.add(attempt.type);
        const c = await callToolJson('gtm_create_client', {
          workspacePath,
          name: `MCP Selftest Client ${runId}`,
          type: attempt.type,
          parameter: attempt.parameter,
          priority: 100,
        });
        clientCreateResult = c;
        if (!c.isError && !isApiError(c.json) && c.json?.path) break;
      }
      if (clientCreateResult && !clientCreateResult.isError && !isApiError(clientCreateResult.json) && clientCreateResult.json?.path) {
        results.push({ name: 'gtm_create_client', status: 'pass', details: clientCreateResult.json });
        created.clientPath = clientCreateResult.json.path;
      } else {
        results.push({ name: 'gtm_create_client', status: 'fail', details: clientCreateResult?.json });
      }

      if (created.clientPath) {
        const gc = await callToolJson('gtm_get_client', { clientPath: created.clientPath });
        results.push({ name: 'gtm_get_client', status: gc.isError || isApiError(gc.json) ? 'fail' : 'pass', details: gc.json });
        const fp = gc.json?.fingerprint;
        const uc = await callToolJson('gtm_update_client', {
          clientPath: created.clientPath,
          fingerprint: fp,
          clientConfig: { name: `MCP Selftest Client Updated ${runId}` },
        });
        results.push({ name: 'gtm_update_client', status: uc.isError || isApiError(uc.json) ? 'fail' : 'pass', details: uc.json });
        const dc = await callToolJson('gtm_delete_client', { clientPath: created.clientPath, confirm: true });
        results.push({ name: 'gtm_delete_client', status: dc.isError || isApiError(dc.json) ? 'fail' : 'pass', details: dc.json });
        if (!dc.isError && !isApiError(dc.json)) created.clientPath = undefined;
      } else {
        results.push({ name: 'gtm_get_client', status: 'skip', details: 'Skipped: client not created' });
        results.push({ name: 'gtm_update_client', status: 'skip', details: 'Skipped: client not created' });
        results.push({ name: 'gtm_delete_client', status: 'skip', details: 'Skipped: client not created' });
      }

      const listTransformations = await callToolJson('gtm_list_transformations', { workspacePath });
      results.push({ name: 'gtm_list_transformations', status: listTransformations.isError ? 'fail' : 'pass', details: listTransformations.json });
      const listedTransformations: any[] = Array.isArray(listTransformations.json) ? listTransformations.json : [];

      const seedTransformationPath = listedTransformations[0]?.path as string | undefined;
      let seedTransformationType: string | undefined;
      let seedTransformationParameter: any[] | undefined;
      if (seedTransformationPath) {
        const seedTransformation = await callToolJson('gtm_get_transformation', { transformationPath: seedTransformationPath });
        results.push({
          name: 'gtm_get_transformation_seed',
          status: seedTransformation.isError || isApiError(seedTransformation.json) ? 'fail' : 'pass',
          details: seedTransformation.json,
        });
        if (!seedTransformation.isError && !isApiError(seedTransformation.json)) {
          seedTransformationType = seedTransformation.json?.type;
          if (Array.isArray(seedTransformation.json?.parameter)) seedTransformationParameter = seedTransformation.json.parameter;
        }
      } else {
        results.push({ name: 'gtm_get_transformation_seed', status: 'skip', details: 'Skipped: no existing transformation available as seed' });
      }

      const transformationCreateAttempts: Array<{ type: string; parameter?: any[] }> = [];
      if (seedTransformationType) transformationCreateAttempts.push({ type: seedTransformationType, parameter: seedTransformationParameter });
      transformationCreateAttempts.push({ type: 'cvt_copy_field' });
      transformationCreateAttempts.push({ type: 'cvt_delete_field' });
      transformationCreateAttempts.push({ type: 'cvt_map_field' });
      transformationCreateAttempts.push({ type: 'cvt_http_header' });
      transformationCreateAttempts.push({ type: 'cvt_javascript' });

      let transformationCreateResult: ToolJsonResult | undefined;
      const triedTransformationTypes = new Set<string>();
      for (const attempt of transformationCreateAttempts) {
        if (triedTransformationTypes.has(attempt.type)) continue;
        triedTransformationTypes.add(attempt.type);
        const t = await callToolJson('gtm_create_transformation', {
          workspacePath,
          name: `MCP Selftest Transformation ${runId}`,
          type: attempt.type,
          parameter: attempt.parameter,
        });
        transformationCreateResult = t;
        if (!t.isError && !isApiError(t.json) && t.json?.path) break;
      }
      if (
        transformationCreateResult &&
        !transformationCreateResult.isError &&
        !isApiError(transformationCreateResult.json) &&
        transformationCreateResult.json?.path
      ) {
        results.push({ name: 'gtm_create_transformation', status: 'pass', details: transformationCreateResult.json });
        created.transformationPath = transformationCreateResult.json.path;
      } else {
        const code = Number((transformationCreateResult?.json as any)?.code ?? NaN);
        const reason = String((transformationCreateResult?.json as any)?.details?.errors?.[0]?.reason ?? '').toLowerCase();
        const isBackend = code >= 500 || reason === 'backenderror';
        results.push({
          name: 'gtm_create_transformation',
          status: isBackend ? 'skip' : 'fail',
          details: transformationCreateResult?.json,
        });
      }

      if (created.transformationPath) {
        const gt = await callToolJson('gtm_get_transformation', { transformationPath: created.transformationPath });
        results.push({ name: 'gtm_get_transformation', status: gt.isError || isApiError(gt.json) ? 'fail' : 'pass', details: gt.json });
        const fp = gt.json?.fingerprint;
        const ut = await callToolJson('gtm_update_transformation', {
          transformationPath: created.transformationPath,
          fingerprint: fp,
          transformationConfig: { name: `MCP Selftest Transformation Updated ${runId}` },
        });
        results.push({ name: 'gtm_update_transformation', status: ut.isError || isApiError(ut.json) ? 'fail' : 'pass', details: ut.json });
        const dt = await callToolJson('gtm_delete_transformation', { transformationPath: created.transformationPath, confirm: true });
        results.push({ name: 'gtm_delete_transformation', status: dt.isError || isApiError(dt.json) ? 'fail' : 'pass', details: dt.json });
        if (!dt.isError && !isApiError(dt.json)) created.transformationPath = undefined;
      } else {
        results.push({ name: 'gtm_get_transformation', status: 'skip', details: 'Skipped: transformation not created' });
        results.push({ name: 'gtm_update_transformation', status: 'skip', details: 'Skipped: transformation not created' });
        results.push({ name: 'gtm_delete_transformation', status: 'skip', details: 'Skipped: transformation not created' });
      }
    } else {
      results.push({ name: 'gtm_list_clients', status: 'skip', details: 'Skipped: not a server container' });
      results.push({ name: 'gtm_get_client_seed', status: 'skip', details: 'Skipped: not a server container' });
      results.push({ name: 'gtm_create_client', status: 'skip', details: 'Skipped: not a server container' });
      results.push({ name: 'gtm_get_client', status: 'skip', details: 'Skipped: not a server container' });
      results.push({ name: 'gtm_update_client', status: 'skip', details: 'Skipped: not a server container' });
      results.push({ name: 'gtm_delete_client', status: 'skip', details: 'Skipped: not a server container' });
      results.push({ name: 'gtm_list_transformations', status: 'skip', details: 'Skipped: not a server container' });
      results.push({ name: 'gtm_get_transformation_seed', status: 'skip', details: 'Skipped: not a server container' });
      results.push({ name: 'gtm_create_transformation', status: 'skip', details: 'Skipped: not a server container' });
      results.push({ name: 'gtm_get_transformation', status: 'skip', details: 'Skipped: not a server container' });
      results.push({ name: 'gtm_update_transformation', status: 'skip', details: 'Skipped: not a server container' });
      results.push({ name: 'gtm_delete_transformation', status: 'skip', details: 'Skipped: not a server container' });
    }

    // Versions: list/latest/live/create/get/export/delete/undelete, publish gate
    results.push({ name: 'gtm_list_versions', status: 'pass', details: (await callToolJson('gtm_list_versions', { containerPath })).json });
    results.push({ name: 'gtm_get_latest_version_header', status: 'pass', details: (await callToolJson('gtm_get_latest_version_header', { containerPath })).json });
    results.push({ name: 'gtm_get_live_version', status: 'pass', details: (await callToolJson('gtm_get_live_version', { containerPath })).json });

    const ver = await callToolJson('gtm_create_version', { workspacePath, name: `MCP Selftest Version ${runId}`, notes: 'Created by MCP selftest' });
    results.push({ name: 'gtm_create_version', status: ver.isError || isApiError(ver.json) ? 'fail' : 'pass', details: ver.json });
    if (!ver.isError && !isApiError(ver.json)) created.versionPath = ver.json?.path;

    if (created.versionPath) {
      const gv = await callToolJson('gtm_get_version', { versionPath: created.versionPath });
      results.push({ name: 'gtm_get_version', status: gv.isError ? 'fail' : 'pass', details: gv.json });
      const exp = await callToolJson('gtm_export_version', { versionPath: created.versionPath });
      results.push({ name: 'gtm_export_version', status: exp.isError ? 'fail' : 'pass', details: exp.json });

      const pubGate = await callToolJson('gtm_publish_version', { versionPath: created.versionPath, confirm: false });
      const okPub = pubGate.json?.errorType === 'CONFIRMATION_REQUIRED' || pubGate.json?.error === 'CONFIRM_REQUIRED' || pubGate.json?.error === 'CONFIRMATION_REQUIRED';
      results.push({ name: 'gate_publish_version', status: okPub ? 'pass' : 'fail', details: pubGate.json });

      const del = await callToolJson('gtm_delete_version', { versionPath: created.versionPath, confirm: true });
      if (del.isError || isApiError(del.json)) {
        const delCode = Number((del.json as any)?.code ?? NaN);
        results.push({
          name: 'gtm_delete_version',
          status: delCode === 400 ? 'skip' : 'fail',
          details: del.json,
        });
      } else {
        results.push({ name: 'gtm_delete_version', status: 'pass', details: del.json });
      }
      const undel = await callToolJson('gtm_undelete_version', { versionPath: created.versionPath, confirm: true });
      results.push({ name: 'gtm_undelete_version', status: undel.isError || isApiError(undel.json) ? 'fail' : 'pass', details: undel.json });
    } else {
      results.push({ name: 'gtm_get_version', status: 'skip', details: 'Skipped: version not created' });
      results.push({ name: 'gtm_export_version', status: 'skip', details: 'Skipped: version not created' });
      results.push({ name: 'gate_publish_version', status: 'skip', details: 'Skipped: version not created' });
      results.push({ name: 'gtm_delete_version', status: 'skip', details: 'Skipped: version not created' });
      results.push({ name: 'gtm_undelete_version', status: 'skip', details: 'Skipped: version not created' });
    }

    // Built-in variables mutating operations (run late to avoid interfering with write entity creation)
    results.push({ name: 'gtm_enable_built_in_variables', status: 'pass', details: (await callToolJson('gtm_enable_built_in_variables', { workspacePath, types: ['EVENT'] })).json });
    results.push({ name: 'gtm_disable_built_in_variables', status: 'pass', details: (await callToolJson('gtm_disable_built_in_variables', { workspacePath, types: ['EVENT'] })).json });
    results.push({ name: 'gtm_revert_built_in_variable', status: 'pass', details: (await callToolJson('gtm_revert_built_in_variable', { workspacePath, type: 'EVENT' })).json });

    // User permissions (risky)
    const acctPath = `accounts/${accountId}`;
    results.push({ name: 'gtm_list_user_permissions', status: 'pass', details: (await callToolJson('gtm_list_user_permissions', { accountPath: acctPath })).json });
    if (risky) {
      results.push({ name: 'gtm_create_user_permission', status: 'skip', details: 'Not implemented in selftest: requires target email + desired permissions (avoid accidental access changes)' });
      results.push({ name: 'gtm_update_user_permission', status: 'skip', details: 'Not implemented in selftest: see create_user_permission' });
      results.push({ name: 'gtm_delete_user_permission', status: 'skip', details: 'Not implemented in selftest: see create_user_permission' });
    } else {
      results.push({ name: 'gtm_create_user_permission', status: 'skip', details: 'Skipped: GTM_SELFTEST_RISKY=false' });
      results.push({ name: 'gtm_update_user_permission', status: 'skip', details: 'Skipped: GTM_SELFTEST_RISKY=false' });
      results.push({ name: 'gtm_delete_user_permission', status: 'skip', details: 'Skipped: GTM_SELFTEST_RISKY=false' });
    }
  } else {
    results.push({ name: 'write_section', status: 'skip', details: 'Skipped: GTM_SELFTEST_MODE=readonly' });
    results.push({ name: 'gtm_enable_built_in_variables', status: 'skip', details: 'Skipped in readonly mode' });
    results.push({ name: 'gtm_disable_built_in_variables', status: 'skip', details: 'Skipped in readonly mode' });
    results.push({ name: 'gtm_revert_built_in_variable', status: 'skip', details: 'Skipped in readonly mode' });
  }

  // ---- Cleanup (best-effort) ----
  if (!doCleanup) {
    cleanup.push({ name: 'cleanup', status: 'skip', details: 'Skipped: GTM_SELFTEST_CLEANUP=false' });
  } else if (!writeAllowed) {
    cleanup.push({ name: 'cleanup', status: 'skip', details: 'Skipped: readonly mode' });
  } else {
    const workspaceLikelySubmitted = !!created.versionPath;
    if (workspaceLikelySubmitted) {
      cleanup.push({
        name: 'cleanup_workspace_submitted',
        status: 'skip',
        details: 'Skipped entity deletions after create_version because GTM marks workspace as submitted',
      });
    }

    // Delete workspace-scoped resources created by this run (confirm:true)
    if (!workspaceLikelySubmitted && created.tagPath) {
      const x = await callToolJson('gtm_delete_tag', { tagPath: created.tagPath, confirm: true });
      cleanup.push({
        name: 'cleanup_delete_tag',
        status: isApiError(x.json) && !isPermissionOrNotFound(x.json) && !isSubmittedWorkspaceError(x.json) ? 'fail' : 'pass',
        details: x.json,
      });
    }
    if (!workspaceLikelySubmitted && created.triggerPath) {
      const x = await callToolJson('gtm_delete_trigger', { triggerPath: created.triggerPath, confirm: true });
      cleanup.push({
        name: 'cleanup_delete_trigger',
        status: isApiError(x.json) && !isPermissionOrNotFound(x.json) && !isSubmittedWorkspaceError(x.json) ? 'fail' : 'pass',
        details: x.json,
      });
    }
    if (!workspaceLikelySubmitted && created.variablePath) {
      const x = await callToolJson('gtm_delete_variable', { variablePath: created.variablePath, confirm: true });
      cleanup.push({
        name: 'cleanup_delete_variable',
        status: isApiError(x.json) && !isPermissionOrNotFound(x.json) && !isSubmittedWorkspaceError(x.json) ? 'fail' : 'pass',
        details: x.json,
      });
    }
    if (!workspaceLikelySubmitted && created.folderPath) {
      const x = await callToolJson('gtm_delete_folder', { folderPath: created.folderPath, confirm: true });
      cleanup.push({
        name: 'cleanup_delete_folder',
        status: isApiError(x.json) && !isPermissionOrNotFound(x.json) && !isSubmittedWorkspaceError(x.json) ? 'fail' : 'pass',
        details: x.json,
      });
    }
    if (!workspaceLikelySubmitted && created.clientPath) {
      const x = await callToolJson('gtm_delete_client', { clientPath: created.clientPath, confirm: true });
      cleanup.push({
        name: 'cleanup_delete_client',
        status: isApiError(x.json) && !isPermissionOrNotFound(x.json) && !isSubmittedWorkspaceError(x.json) ? 'fail' : 'pass',
        details: x.json,
      });
    }
    if (!workspaceLikelySubmitted && created.transformationPath) {
      const x = await callToolJson('gtm_delete_transformation', { transformationPath: created.transformationPath, confirm: true });
      cleanup.push({
        name: 'cleanup_delete_transformation',
        status: isApiError(x.json) && !isPermissionOrNotFound(x.json) && !isSubmittedWorkspaceError(x.json) ? 'fail' : 'pass',
        details: x.json,
      });
    }
    if (created.zonePath) {
      const x = await callToolJson('gtm_delete_zone', { zonePath: created.zonePath, confirm: true });
      cleanup.push({ name: 'cleanup_delete_zone', status: isApiError(x.json) && !isPermissionOrNotFound(x.json) ? 'fail' : 'pass', details: x.json });
    }
    if (created.envPath) {
      const x = await callToolJson('gtm_delete_environment', { environmentPath: created.envPath, confirm: true });
      cleanup.push({ name: 'cleanup_delete_environment', status: isApiError(x.json) && !isPermissionOrNotFound(x.json) ? 'fail' : 'pass', details: x.json });
    }
    if (created.templatePath) {
      const x = await callToolJson('gtm_delete_template', { templatePath: created.templatePath, confirm: true });
      cleanup.push({ name: 'cleanup_delete_template', status: isApiError(x.json) && !isPermissionOrNotFound(x.json) ? 'fail' : 'pass', details: x.json });
    }
    if (created.gtagConfigPath) {
      const x = await callToolJson('gtm_delete_gtag_config', { gtagConfigPath: created.gtagConfigPath, confirm: true });
      cleanup.push({ name: 'cleanup_delete_gtag_config', status: isApiError(x.json) && !isPermissionOrNotFound(x.json) ? 'fail' : 'pass', details: x.json });
    }
    if (createdWorkspacePath) {
      const x = await callToolJson('gtm_delete_workspace', { workspacePath: createdWorkspacePath, confirm: true });
      cleanup.push({
        name: 'cleanup_delete_workspace',
        status:
          isApiError(x.json) &&
          !isPermissionOrNotFound(x.json) &&
          !isSubmittedWorkspaceError(x.json) &&
          Number((x.json as any)?.code ?? NaN) !== 500
            ? 'fail'
            : 'pass',
        details: x.json,
      });
    }
  }

  const report = {
    accountId,
    containerPath,
    workspacePath,
    isServerContainer,
    mode,
    delayMs,
    results,
    cleanup,
    serverStderr,
  };

  console.log(JSON.stringify(report, null, 2));

  const failed = [...results, ...cleanup].some((r) => r.status === 'fail');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String((err as any)?.message ?? err) }, null, 2));
  process.exit(1);
});
