# Claude Context for GTM Workspace

This workspace contains GTM (Google Tag Manager) tools and utilities plus 26 marketing skills.

## Projects

1. **gtm-mcp-server** - MCP server with 106 tools for GTM API v2 (TypeScript)
2. **gtm-optimizer** - Browser-based GTM analysis and optimization (Vanilla JS)
3. **cartographer** - Codebase mapping plugin
4. **.claude/skills/** - 26 marketing automation skills

## Stack

- **TypeScript** (gtm-mcp-server)
- **Vanilla JavaScript** (gtm-optimizer)
- **Python** (cartographer scanner)
- **Markdown** (skills)

## Key Features

- **MCP Server**: 106 tools for GTM API, recently slimmed (3555→1531 lines)
- **Template Registry**: Verified community templates for type resolution
- **Skills**: `gtm-best-practices` skill with Part 6 MCP Tool Reference

## Quick Navigation

| Task | Location |
|------|----------|
| Add MCP tool | `gtm-mcp-server/index.ts` + `tools/*.ts` |
| Add optimizer rule | `gtm-optimizer/js/rules.js` |
| Update skill docs | `.claude/skills/gtm-best-practices/SKILL.md` |
| Run selftest | `cd gtm-mcp-server && npm run selftest` |

For detailed architecture, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).
