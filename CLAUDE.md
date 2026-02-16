# Claude Context for GTM Workspace

This workspace contains GTM (Google Tag Manager) tools and utilities.

## Projects

1. **gtm-mcp-server** - Model Context Protocol server providing AI access to GTM API v2
2. **gtm-optimizer** - Web-based tool for analyzing and optimizing GTM containers
3. **cartographer** - Codebase mapping plugin (for Claude Code)

## Stack

- **TypeScript** (gtm-mcp-server)
- **Vanilla JavaScript** (gtm-optimizer)
- **Python** (cartographer scanner)
- **HTML/CSS** (gtm-optimizer UI)

## Structure

Three independent projects sharing this workspace:
- Server-side API integration layer (MCP) with template registry
- Client-side analysis tool (browser-based)
- Code documentation utility

## Key Features

- **Template Registry**: `gtm-mcp-server/config/template-registry.json` - Verified community templates for deterministic type resolution
- **Selftest Infrastructure**: `gtm-mcp-server/scripts/selftest.ts` - MCP stdio end-to-end testing

For detailed architecture, file purposes, dependencies, and navigation guides, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).
