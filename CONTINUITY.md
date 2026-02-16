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
- Hardening implementation is committed on `main`.

Done:
- Commit on main: `6080a96` (`Harden GTM MCP strict API v2 validation and type resolution`).
- Added strict validator tools and runtime wiring.
- Added strict resolver/preflight hardening, capability split, and improved error model.
- Added template import classification + registry error metadata fields.
- Added transformation timeout/retry telemetry and tag update read-after-write verification.
- Updated seed/schema/selftest coverage for strict flow.
- Verification runs:
  - `npm run -s build` ✅
  - `npm run -s template-registry:validate` ✅ (`Template registry is valid: 186 entries`)
  - `npm run -s selftest` partially blocked by API latency.

Now:
- Confirmed to user that commit is on `main`.

Next:
- Optional: rerun targeted integration tests once API latency is stable.

Open questions (UNCONFIRMED if needed):
- UNCONFIRMED: whether remaining local unstaged files (`.DS_Store`, `cartographer`, `config/template-registry.json`) should be included in a follow-up commit.

Working set (files/ids/commands):
- `/Users/tobias_batke/Documents/Google Tag Manager Hilfe/CONTINUITY.md`
- commit `6080a96` on branch `main`
