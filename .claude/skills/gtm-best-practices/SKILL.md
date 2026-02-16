# GTM & Server-Side Tagging Expert Skill

## Overview

This skill provides expert guidance for Google Tag Manager and Server-Side GTM implementation based on Analytics Mania and Google Developers best practices.

**When to use:** GTM planning, server-side setup, hybrid tracking, data layer architecture, debugging, consent management, e-commerce tracking.

---

## Part 1: GTM Best Practices

### Planning & Organization

- Create measurement plan before implementation (business objectives → key events → data needed)
- One GTM account per company, one container per website
- Client must ALWAYS own the container (never under agency account)
- Use separate workspaces for major changes
- Publish in small chunks (GA4 first, then ads, then pixels) for easier rollback

### Naming Conventions

- Tags: `[Platform] - [Type] - [Purpose]` → e.g., `GA4 - Event - Purchase`
- Triggers: `[Type] - [Condition]` → e.g., `Custom Event - purchase`
- Variables: `[Type] - [Purpose]` → e.g., `DLV - ecommerce.value`

### Data Layer

- Always use `dataLayer.push()` - never overwrite with `dataLayer = [...]`
- Initialize before GTM: `window.dataLayer = window.dataLayer || []`
- Always include `event` key for triggers
- Use Data Layer Version 2 (accesses nested values, merges data)
- Prioritize Data Layer over DOM scraping (less fragile)

### Tags, Triggers & Variables

- Use Constant variables for repeated values (Pixel IDs, Measurement IDs)
- Make triggers specific (filter by conditions, don't fire on "all events")
- Use Custom Templates from Community Gallery instead of Custom HTML when possible
- Trigger hierarchy: Page View (config) → Custom Events → Click/Form → Element Visibility → Timer

### Performance

- Container size: < 100 KB recommended, 200 KB max
- Lazy load non-critical tags (Timer 3s, Scroll 50%, Element Visibility)
- Consolidate similar tags (one GA4 Event tag with regex trigger for multiple events)
- Remove unused tags/triggers/variables regularly

### Testing

- Always test in Preview mode before publishing
- Verify: tags fire correctly, variables have values, triggers work as expected
- Use Tag Assistant and GA4 DebugView for validation
- Test with real transactions before going live

---

## Part 2: Hybrid Tracking (Client + Server-Side)

### What is Hybrid Tracking?

Hybrid tracking combines client-side and server-side tagging:
- **Client-side:** GTM web container sends data to server container (not directly to vendors)
- **Server-side:** Server container processes and routes data to analytics platforms

### Architecture

```
Website → Web Container (GTM-XXXXX) → Server Container (GTM-YYYYY)
                                            ↓
                      ┌─────────────────────┼─────────────────────┐
                      ↓                     ↓                     ↓
                   GA4 Tags          Facebook CAPI         Google Ads CAPI
```

### Benefits of Hybrid Tracking

| Benefit | Description |
|---------|-------------|
| **Data Control** | Decide what data goes to vendors, remove/hash PII before sending |
| **Ad Blocker Bypass** | Use first-party domain (analytics.yourdomain.com) |
| **Performance** | Reduce scripts in browser, offload processing to server |
| **Cookie Duration** | Server-set cookies bypass Safari ITP 7-day limit |
| **Data Enrichment** | Add server-side data (CRM, geo-location) before sending |

### What to Watch Out For

**Deduplication:**
- Browser pixel and server CAPI may send same event twice
- Always include `event_id` parameter for deduplication
- Facebook uses event_id to deduplicate, Google Ads uses transaction_id

**Timing Issues:**
- Server-side tags fire after request reaches server
- Critical conversion data must be available in Data Layer before event fires
- Test server-side timing in Preview mode (Request tab shows full flow)

**User Identification:**
- Server-side can't access browser cookies directly
- Pass user identifiers via Data Layer (user_id, client_id, fbp, fbc)
- Hash PII (email, phone) with SHA256 before sending to Facebook CAPI

**Cost:**
- Cloud Run minimum ~$90/month (2 instances recommended)
- Stape.io alternative starts at $20/month
- Log requests drive costs - disable request logging if not needed

**Custom Domain Required:**
- Without custom domain, ad blockers may still block server container
- Map subdomain like `analytics.yourdomain.com` to server container
- Configure in GA4 Config tag: `server_container_url` parameter

### When to Use Hybrid/Server-Side

**Good candidates:** High traffic, privacy requirements, ad blocker issues, multi-platform tracking, need data enrichment

**Maybe not yet:** Small sites, simple tracking needs, no developer resources, limited technical expertise

---

## Part 3: GTM MCP Server

### What is the GTM MCP Server?

The GTM MCP Server in this project provides AI assistants direct access to Google Tag Manager API v2. It allows creating, reading, updating, and deleting GTM entities programmatically.

### Key Tool Categories (80+ tools available)

| Category | Tools |
|----------|-------|
| **Accounts/Containers** | `gtm_list_accounts`, `gtm_list_containers`, `gtm_create_container`, `gtm_get_container_info` |
| **Workspaces** | `gtm_list_workspaces`, `gtm_create_workspace`, `gtm_sync_workspace` |
| **Tags** | `gtm_list_tags`, `gtm_get_tag`, `gtm_create_tag`, `gtm_update_tag`, `gtm_delete_tag` |
| **Triggers** | `gtm_list_triggers`, `gtm_get_trigger`, `gtm_create_trigger`, `gtm_update_trigger` |
| **Variables** | `gtm_list_variables`, `gtm_get_variable`, `gtm_create_variable`, `gtm_update_variable` |
| **Templates** | `gtm_list_templates`, `gtm_import_template_from_gallery` |
| **Server-Side** | `gtm_list_clients`, `gtm_create_client`, `gtm_list_transformations` |
| **Versions** | `gtm_create_version`, `gtm_publish_version`, `gtm_get_live_version` |
| **Helpers** | `gtm_validate_tag_config`, `gtm_get_tag_parameters`, `gtm_check_best_practices`, `gtm_search_entities` |

### How to Use

**Path Format:** All operations use paths like `accounts/123/containers/456/workspaces/7`

**Parameter Format (API v2):** All parameters require `type` field:
- `template` - String value
- `boolean` - true/false
- `integer` - Number
- `list` - Array
- `map` - Object

**Template Reference:** Use `templateReference` for community templates to avoid guessing types:
```
templateReference: { owner: "stape-io", repository: "facebook-pixel" }
```

### Workflow Pattern

1. List entities to find paths
2. Get entity details (includes fingerprint for updates)
3. Validate config before creating
4. Create/update with required parameters
5. Check best practices for issues

### Rate Limits

- 10,000 requests/day per project
- 0.25 QPS (1 request per 4 seconds)
- MCP server handles automatic rate limiting

---

## Part 4: Stape.io Integration

### What is Stape.io?

Stape.io is a managed hosting service for Server-Side GTM containers. It eliminates the need to manage Google Cloud Platform infrastructure.

### Stape.io vs Google Cloud Run

| Aspect | Stape.io | Google Cloud Run |
|--------|----------|------------------|
| **Cost** | $20-100/month (tiered) | ~$90/month minimum |
| **Setup** | Minutes (managed) | Hours (manual config) |
| **Maintenance** | Automatic updates | Self-managed |
| **Custom Domain** | Included | Manual load balancer setup |
| **Multi-region** | Available | Manual deployment |

### Stape MCP Server (separate from GTM MCP Server)

Stape provides its own MCP server for managing Stape-hosted containers via AI assistants. This is **different** from the GTM MCP Server.

**GitHub:** https://github.com/stape-io/stape-mcp-server

### Stape MCP Server Setup

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "stape-mcp-server": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://mcp.stape.ai/mcp",
        "--header", "Authorization: YOUR_STAPE_API_KEY"
      ]
    }
  }
}
```

**EU Region:** Add header `"X-Stape-Region: EU"` for EU-hosted containers.

### Stape MCP Server Tools

| Tool | Actions |
|------|---------|
| `stape_container_crud` | `create`, `get`, `get_all`, `update`, `delete` containers |
| `stape_container_domains` | `list`, `get`, `create`, `update`, `delete`, `validate`, `revalidate`, `get_entri` for custom domains |
| `stape_container_power_ups` | Enable/configure power-ups (see below) |
| `stape_container_proxy_files` | Manage proxy files |
| `stape_container_schedules` | Manage container schedules |
| `stape_containers_analytics` | Container analytics data |
| `stape_containers_resources` | Container resources |
| `stape_resource` | General resource operations |

### Container Power-Ups (stape_container_power_ups)

| Power-Up | Purpose |
|----------|---------|
| `anonymizer` | Anonymize user data |
| `bot_detection` | Detect bot traffic |
| `bot_index` | Index bots |
| `cookie_keeper` | Extend cookie lifetime (ITP bypass) |
| `custom_loader` | Custom loading behavior |
| `geo_headers` | Add geolocation headers |
| `preview_header_config` | Configure preview headers |
| `proxy_files` | Proxy static files |
| `request_delay` | Delay requests |
| `schedule` | Schedule container operations |
| `service_account` | Google service account integration |
| `user_agent_headers` | Add user agent headers |
| `user_id` | X-STAPE-USER-ID header |
| `xml_to_json` | Convert XML to JSON |

### Stape.io Key Features

**Custom Domain:** Automatic SSL and domain mapping (e.g., `gtm.yourdomain.com`)

**Tag Templates:** Pre-built templates for Facebook CAPI, Google Ads Enhanced Conversions, TikTok Events API, Snapchat CAPI, Pinterest CAPI

**Entri Integration:** Automated DNS configuration via `get_entri` action in domain tools

### Two MCP Servers - When to Use Which?

| Task | Use |
|------|-----|
| Create/edit GTM tags, triggers, variables | GTM MCP Server (this project) |
| Manage Stape container hosting, domains, power-ups | Stape MCP Server |
| Import Stape templates into GTM | GTM MCP Server with `templateReference` |

### GTM MCP Server Template Registry

The GTM MCP Server includes verified Stape.io templates:

| Template | Purpose |
|----------|---------|
| `stape-io/facebook-pixel` | Facebook Conversions API |
| `stape-io/google-ads-enhanced-conversions` | Enhanced conversions |
| `stape-io/tiktok-events-api` | TikTok server-side tracking |

---

## Part 5: Consent Mode v2

### New Parameters (March 2024)

| Parameter | Description |
|-----------|-------------|
| `ad_storage` | Cookies for advertising |
| `ad_user_data` | **NEW** - Send user data for ads |
| `ad_personalization` | **NEW** - Personalized advertising |
| `analytics_storage` | Analytics cookies |

### Implementation Pattern

1. Set default consent to `denied` BEFORE any gtag commands
2. Load CMP (consent management platform) banner
3. Update consent when user accepts

### Red vs Green Behavior

**Green (granted):** Full tracking, cookies, IP collection
**Red (denied):** Limited tracking, cookieless pings, behavioral modeling in GA4

**Prerequisites for GA4 behavioral modeling:**
- 1,000+ events/day with `analytics_storage='denied'` for 7 days
- Advanced implementation (tags load before consent dialog)

---

## Quick Reference

### Container Limits
- Size: < 100 KB (max 200 KB)
- Load time: < 500ms
- Tag success: > 95%

### Essential Built-in Variables
`{{Page URL}}`, `{{Page Path}}`, `{{Click Element}}`, `{{Click ID}}`, `{{Click Classes}}`, `{{Form Element}}`, `{{Container ID}}`

### Common Event Names
`page_view`, `purchase`, `add_to_cart`, `begin_checkout`, `view_item`, `sign_up`, `generate_lead`

### Debugging Tools
- Data Layer Inspector (Adswerve)
- Google Tag Assistant
- GA4 DebugView
- Browser DevTools Network tab

---

## Part 6: MCP Tool Reference

### Parameter Format (GTM API v2)

All parameters use this structure:
```
{ "key": "parameterName", "type": "template|boolean|integer|list|map", "value": "..." }
```

| Type | Usage |
|------|-------|
| `template` | String values (IDs, names, URLs) |
| `boolean` | true/false flags |
| `integer` | Numbers (delays, priorities) |
| `list` | Arrays of parameters |
| `map` | Key-value objects |

### Tag Types & Parameters

Use `gtm_get_tag_parameters` to get parameters for a specific tag type.

**Common Tag Types:**
| Type | Description | Key Parameters |
|------|-------------|----------------|
| `gaawe` | GA4 Event | measurementId, eventName |
| `googtag` | Google Tag | measurementId, sendPageView |
| `html` | Custom HTML | html |
| `awct` | Google Ads Conversion | conversionId, conversionLabel, conversionValue |
| `sp` | Google Ads Remarketing | conversionId |
| `sgtmadsct` | Server-side Google Ads Conversion | conversionId, conversionLabel |
| `sgtmadsremarket` | Server-side Google Ads Remarketing | conversionId |
| `sgtmgaaw` | Server-side GA4 | measurementId |

### Trigger Types

**Web Container:**
| Type | Use When | Key Parameters |
|------|----------|----------------|
| `pageview` | Page loads | filter (URL conditions) |
| `domReady` | DOM ready | filter |
| `windowLoaded` | Window load | filter |
| `customEvent` | dataLayer event | customEventFilter |
| `click` | Element click | autoEventFilter |
| `linkClick` | Link click | autoEventFilter, waitForTags |
| `formSubmission` | Form submit | autoEventFilter |
| `scrollDepth` | Scroll % | verticalScrollBoundaryList |
| `elementVisibility` | Element visible | elementSelector |
| `timer` | Interval | interval, limit |
| `youTubeVideo` | YouTube video | videoIdFilter |

**Server Container:**
| Type | Use When |
|------|----------|
| `always` | Always fires |
| `init` | Container init |
| `serverPageview` | Page view request |
| `customEvent` | Custom event |
| `triggerGroup` | Combine triggers |

### Variable Types

Use `gtm_get_variable_parameters` to get parameters for a specific variable type.

| Type | Description | Key Parameters |
|------|-------------|----------------|
| `k` | Constant | value |
| `c` | 1st Party Cookie | cookieName |
| `f` | Data Layer | dataLayerName |
| `v` | URL | urlComponent, queryKey |
| `jsm` | Custom JavaScript | javascript |
| `aev` | Auto-Event | eventType, varType |
| `r` | Random Number | - |
| `smm` | Storage | key, storageType |

### Trigger Condition Format

```json
{
  "type": "contains|equals|startsWith|endsWith|matchRegex|greater|less",
  "parameter": [
    { "key": "arg0", "type": "template", "value": "{{Page URL}}" },
    { "key": "arg1", "type": "template", "value": "/checkout" },
    { "key": "ignore_case", "type": "boolean", "value": "true" }
  ]
}
```

### Filter Types for Triggers

| Filter | Purpose |
|--------|---------|
| `filter` | Trigger activation conditions |
| `customEventFilter` | Match dataLayer event name (customEvent triggers only) |
| `autoEventFilter` | Element conditions (click, form, visibility triggers) |

### Template Reference

For community templates, use `templateReference` instead of guessing types:

```json
{
  "templateReference": {
    "owner": "stape-io",
    "repository": "facebook-pixel"
  }
}
```

Verified templates in registry: `stape-io/facebook-pixel`, `stape-io/google-ads-enhanced-conversions`, `stape-io/tiktok-events-api`

### Validation Tools

Always validate before creating:
- `gtm_validate_tag_config` - Validate tag
- `gtm_validate_trigger_config` - Validate trigger (requires containerType)
- `gtm_validate_variable_config` - Validate variable
- `gtm_validate_client_config` - Validate server client
- `gtm_validate_transformation_config` - Validate server transformation

### Helper Tools

| Tool | Purpose |
|------|---------|
| `gtm_get_tag_parameters` | Get required/optional params for tag type |
| `gtm_list_tag_types` | List all available tag types |
| `gtm_get_variable_parameters` | Get params for variable type |
| `gtm_get_trigger_template` | Get example trigger config |
| `gtm_search_entities` | Search tags/triggers/variables |
| `gtm_check_best_practices` | Audit container |
| `gtm_get_container_info` | Get container type (web/server) |

### Workflow Guides

Use `gtm_get_workflow` with one of:
- `setup_ga4` - Complete GA4 setup
- `setup_conversion_tracking` - Google Ads conversions
- `setup_form_tracking` - Form tracking
- `setup_scroll_tracking` - Scroll depth
- `setup_link_click_tracking` - Link clicks
- `setup_ecommerce_tracking` - E-commerce

### Server-Side Tools

**Clients** (receive incoming requests):
| Tool | Purpose |
|------|---------|
| `gtm_list_clients` | List clients |
| `gtm_create_client` | Create client (type: gaaw_client, adwords_client, etc.) |
| `gtm_update_client` | Update client config |

**Transformations** (modify event data):
| Tool | Purpose |
|------|---------|
| `gtm_list_transformations` | List transformations |
| `gtm_create_transformation` | Create transformation |

### Update Operations

All update operations require `fingerprint` from the corresponding `get_*` call:
1. Call `gtm_get_tag` / `gtm_get_trigger` / `gtm_get_variable`
2. Extract `fingerprint` from response
3. Include in update call

### Destructive Operations

All delete operations require `confirm: true` parameter.

---

## Resources

- [Analytics Mania](https://www.analyticsmania.com) - Julius Fedorovicius
- [Google Tag Manager Help](https://support.google.com/tagmanager)
- [Server-Side GTM Guide](https://developers.google.com/tag-platform/tag-manager/server-side)
- [Stape.io](https://stape.io) - Managed server-side hosting
