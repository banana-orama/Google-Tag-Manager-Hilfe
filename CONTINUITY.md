Goal (incl. success criteria):
- Implement full strict API-v2 hardening for `gtm-mcp-server` per agreed plan so LLM flows run deterministically in 1-3 calls without trial-and-error.
- Success: all 7 reported blocker areas are either fixed in code/tests or cleanly classified as GTM API limits with deterministic errors.

Constraints/Assumptions:
- Follow AGENTS.md continuity workflow and keep this ledger current.
- Workspace: `/Users/tobias_batke/Documents/Google Tag Manager Hilfe`.
- Strict API v2 mode is default (no UI fallback in runtime).
- Existing unrelated dirty worktree changes must not be reverted.
- GTM API/network latency can block full selftest completion in this environment.

Key decisions:
- Use template registry as canonical source for template-specific type + parameter hints.
- Enforce strict preflight for create paths; `templateReference` is prioritized when provided.
- Split container capabilities into declared vs verified/observed to avoid misleading outputs.

State:
- Core hardening implementation completed locally; build passes. Full selftest run is currently environment-limited by very slow/blocked GTM API calls.

Done:
- Added strict entity validator module `utils/entity-validators.ts` with unified output (`valid/errors/warnings/suggestedFixes/resolvedContext`).
- Added new MCP tools in `index.ts`:
  - `gtm_validate_tag_config`
  - `gtm_validate_variable_config`
  - `gtm_validate_client_config`
  - `gtm_validate_transformation_config`
- Wired strict validation into runtime switch handling.
- Extended `gtm_list_tag_types` to accept optional `workspacePath` and return workspace-scoped `availableInWorkspace` hints.
- Hardened `utils/error-handler.ts` with deterministic classifications:
  - `ENTITY_TYPE_UNKNOWN`, `UPDATE_NOT_APPLIED`, `WORKSPACE_STATE_INVALID`, `TEMPLATE_NOT_FOUND`, `TEMPLATE_CONTEXT_MISMATCH`, `TEMPLATE_PERMISSION_DENIED`.
- Hardened template import flow (`tools/templates.ts`):
  - preflight workspace-state check
  - deterministic import error classification
  - registry status enrichment with `verificationCode`, `lastErrorType`, `lastErrorMessage`.
- Hardened transformation create flow (`tools/transformations.ts`):
  - retry/backoff dedicated policy
  - timeout/backend instability classification with telemetry
  - validation-only fallback signal (`TRANSFORMATION_CREATE_SKIPPED`).
- Hardened tag update flow (`tools/tags.ts`):
  - guard for server URL params by supported type
  - read-after-write verification with `UPDATE_NOT_APPLIED` diff on non-persisted fields.
- Improved variable create validation feedback (`tools/variables.ts`) with workspace type hints.
- Updated registry schema and seed script:
  - `template-registry.schema.json` now allows verification/error metadata fields.
  - `seed-template-registry.ts` adds workspace-state preflight and better failure classification.
- Expanded selftest helper coverage (`scripts/selftest.ts`) to include all new `gtm_validate_*` tools.
- Verification runs:
  - `npm run -s build` ✅
  - `npm run -s template-registry:validate` ✅ (`Template registry is valid: 186 entries`)
  - `npm run -s selftest` started but blocked by very slow GTM API calls (e.g., `gtm_list_accounts` took ~134s and run stalled afterward).

Now:
- Stage only relevant hardening files and create commit.

Next:
- If needed, rerun full selftest in an environment with stable GTM API latency/credentials to produce fresh green report.

Open questions (UNCONFIRMED if needed):
- UNCONFIRMED: current environment API latency/timeout behavior prevents deterministic full selftest completion.

Working set (files/ids/commands):
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/CONTINUITY.md`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/index.ts`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/utils/entity-validators.ts`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/utils/template-registry.ts`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/utils/container-validator.ts`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/utils/error-handler.ts`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/tools/templates.ts`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/tools/tags.ts`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/tools/transformations.ts`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/tools/variables.ts`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/scripts/seed-template-registry.ts`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/scripts/selftest.ts`
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/gtm-mcp-server/config/template-registry.schema.json`
