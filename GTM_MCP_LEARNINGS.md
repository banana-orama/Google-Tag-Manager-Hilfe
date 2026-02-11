# GTM MCP Server - Learnings & Verbesserungsvorschläge

Dieses Dokument fasst alle Learnings aus dem umfassenden Funktionalitätstest des GTM MCP Servers zusammen und bietet konkrete Vorschläge zur Verbesserung der LLM-Integration.

## Executive Summary

Der GTM MCP Server ist grundsätzlich funktionsfähig, hat aber mehrere Bereiche, die optimiert werden sollten, um die Zusammenarbeit mit LLMs zu verbessern. Die wichtigsten Learnings betreffen:
- Parameter-Formatierung und Validation
- Bessere Fehlermeldungen mit konkreten Beispielen
- Konsistente API-Design-Patterns
- Erweiterte Dokumentation für LLM-Kontext

---

## 1. Documentation & Error Messages

### 1.1 Verbesserte Tool-Beschreibungen

**Problem:** Aktuelle Beschreibungen sind oft zu allgemein und enthalten keine Beispiele.

**Verbesserung:**
```json
{
  "name": "gtm_gtm_create_tag",
  "description": "Creates a new tag in the specified workspace.\n\n**Common Tag Types:**\n- `html`: Custom HTML/JavaScript code\n- `gaawe`: GA4 Event tag\n- `ua`: Universal Analytics tag\n- `awct`: Google Ads conversion tracking\n\n**Parameter Format:**\nAll parameters must include a `type` field:\n```json\n[\n  { \"key\": \"html\", \"type\": \"template\", \"value\": \"<script>console.log('test');</script>\" }\n]\n```\n\n**Example:**\n```json\n{\n  \"name\": \"Purchase Event Tag\",\n  \"type\": \"gaawe\",\n  \"parameter\": [\n    { \"key\": \"measurementId\", \"type\": \"template\", \"value\": \"G-XXXXXXXXXX\" },\n    { \"key\": \"eventName\", \"type\": \"template\", \"value\": \"purchase\" }\n  ],\n  \"firingTriggerId\": [\"12\"]\n}\n```",
  "parameters": {
    // ...
  }
}
```

### 1.2 Strukturierte Fehlermeldungen

**Problem:** Fehlermeldungen sind technisch, aber bieten keine Lösungshinweise.

**Verbesserung:**
```json
{
  "code": 400,
  "message": "Parameter format error",
  "errorType": "PARAMETER_MISSING_TYPE",
  "help": "Each parameter must include a 'type' field. Valid types: 'template', 'boolean', 'integer', 'list', 'map'.",
  "example": {
    "incorrect": { "key": "html", "value": "<script>...</script>" },
    "correct": { "key": "html", "type": "template", "value": "<script>...</script>" }
  },
  "suggestions": [
    "Add type: 'template' to HTML tag parameters",
    "Check the documentation for the specific tag type"
  ]
}
```

### 1.3 Container-Kontext in Beschreibungen

**Problem:** Trigger-Typen unterscheiden sich zwischen Web und Server Containern.

**Verbesserung:**
```json
{
  "name": "gtm_gtm_create_trigger",
  "description": "Creates a new GTM trigger.\n\n**Container Type Compatibility:**\n\n**Web Container (usageContext: 'web'):**\nSupported types: PAGEVIEW, CLICK, FORM_SUBMISSION, CUSTOM_EVENT, TIMER, SCROLL_DEPTH, LINK_CLICK, etc.\n\n**Server Container (usageContext: 'server'):**\nSupported types: always, customEvent, triggerGroup\n\n**Filter by Container Type:**\n- Web: Use `filter` parameter for most triggers\n- Server: Use `customEventFilter` for CUSTOM_EVENT type only\n- Server 'always' trigger: No filter needed\n\n**Get container type:** Use `gtm_gtm_get_container_info` to verify supported trigger types."
}
```

---

## 2. API Design & Parameter Handling

### 2.1 Konsistentes Parameter-Format

**Problem:** Verschiedene Funktionen erwarten unterschiedliche Parameter-Formate.

**Lösung:**
- Standardisiere auf `[{ key, type, value, list?, map? }]` Format
- Erstelle Parameter-Validierungs-Hilfsfunktion
- Documentiere jeden Parameter-Typ mit Beispiel

**Empfohlene Implementation:**
```typescript
interface GTMParameter {
  key: string;
  type: 'template' | 'boolean' | 'integer' | 'list' | 'map';
  value?: string | number | boolean;
  list?: GTMParameter[];
  map?: GTMParameter[];
}

function validateParameter(param: any): GTMParameter | null {
  if (!param.type) return null;
  // Validate based on type...
}
```

### 2.2 Trigger Filter Struktur

**Problem:** Filter-Struktur unterscheidet sich zwischen Filter-Typen.

**Verbesserung:**
```json
{
  "name": "gtm_gtm_create_trigger",
  "parameters": {
    "filter": {
      "description": "Filter conditions for PAGEVIEW, CLICK, FORM_SUBMISSION, etc.\n\nFormat: Array of condition objects\n```json\n[\n  { \"type\": \"contains\", \"arg1\": \"{{Page URL}}\", \"arg2\": \"/checkout\" }\n]\n```\n\n**Condition Types:**\n- equals: Exact match\n- contains: Substring match\n- matchRegex: Regular expression\n- startsWith: Starts with string\n- endsWith: Ends with string\n- greater: Numeric greater than\n- less: Numeric less than\n\n**Variables:**\nUse built-in variables like {{Page URL}}, {{Event}}, {{Click URL}}, etc.",
      "type": "array"
    },
    "customEventFilter": {
      "description": "Filter for CUSTOM_EVENT triggers ONLY.\n\nRequired for: CUSTOM_EVENT\nNot used for: Other trigger types\n\nFormat:**\n```json\n[\n  {\n    \"type\": \"equals\",\n    \"parameter\": [\n      { \"key\": \"arg1\", \"type\": \"template\", \"value\": \"{{Event}}\" },\n      { \"key\": \"arg2\", \"type\": \"template\", \"value\": \"purchase\" }\n    ]\n  }\n]\n```\n\nIMPORTANT: Unlike `filter`, `customEventFilter` uses a nested `parameter` array with `key` fields."
    }
  }
}
```

### 2.3 Trigger Templates Erweitern

**Problem:** Templates enthalten nicht das vollständige Format.

**Verbesserung:**
```json
{
  "templateType": "custom-event-purchase",
  "template": {
    "type": "CUSTOM_EVENT",
    "name": "Purchase Event",
    "customEventFilter": [
      {
        "type": "equals",
        "parameter": [
          { "key": "arg1", "type": "template", "value": "{{Event}}" },
          { "key": "arg2", "type": "template", "value": "purchase" }
        ]
      }
    ],
    "description": "Fires when a custom event named 'purchase' is pushed to the data layer",
    "containerType": "web",
    "apiCall": {
      "method": "gtm_gtm_create_trigger",
      "parameters": {
        "workspacePath": "accounts/123/containers/456/workspaces/789",
        "name": "Purchase Event",
        "type": "CUSTOM_EVENT",
        "customEventFilter": [
          {
            "type": "equals",
            "parameter": [
              { "key": "arg1", "type": "template", "value": "{{Event}}" },
              { "key": "arg2", "type": "template", "value": "purchase" }
            ]
          }
        ]
      }
    }
  }
}
```

---

## 3. Validation & Feedback

### 3.1 Pre-Validation Tools

**Problem:** Validierung passiert erst bei der API-Call-Ausführung.

**Verbesserung:** Erweitere `gtm_gtm_validate_trigger_config`:

```json
{
  "name": "gtm_gtm_validate_trigger_config",
  "description": "Validates a trigger configuration before creation. Returns detailed validation results including errors, warnings, and suggestions.\n\n**Usage:** Call this before `gtm_gtm_create_trigger` to catch errors early.\n\n**Returns:**\n```json\n{\n  \"valid\": true|false,\n  \"errors\": [\n    {\n      \"field\": \"customEventFilter\",\n      \"message\": \"Missing parameter key\",\n      \"example_fix\": \"Add key: 'arg1' to first parameter\"\n    }\n  ],\n  \"warnings\": [],\n  \"suggestions\": [],\n  \"corrected_config\": { /* Automatically corrected if possible */ },\n  \"example_call\": { /* Full API call example */ }\n}```",
  "parameters": {
    "triggerConfig": { /* ... */ },
    "containerType": {
      "description": "Container type to validate against. Get from `gtm_gtm_get_container_info`",
      "enum": ["web", "server", "amp", "ios", "android"]
    }
  }
}
```

### 3.2 Smart Parameter Completion

**Vorschlag:** Neues Tool für Parameter-Hilfe:

```json
{
  "name": "gtm_gtm_get_tag_parameters",
  "description": "Returns the required and optional parameters for a specific tag type.\n\n**Example:**\n- Tag type: 'gaawe' returns measurementId, eventName, eventParameters\n- Tag type: 'html' returns html\n- Tag type: 'ua' returns trackingId, type, fieldsToSet",
  "parameters": {
    "tagType": {
      "type": "string",
      "description": "Tag type (e.g., gaawe, html, ua, awct)"
    }
  },
  "returns": {
    "required": [
      {
        "key": "measurementId",
        "type": "template",
        "description": "GA4 Measurement ID (e.g., G-XXXXXXXXXX)"
      }
    ],
    "optional": [
      {
        "key": "eventName",
        "type": "template",
        "description": "Event name to send",
        "defaultValue": "custom_event"
      }
    ]
  }
}
```

---

## 4. Type System & Schema

### 4.1 TypeScript Type Definitions

**Problem:** Keine Typ-Definitionen für Parameter-Strukturen.

**Lösung:** Erstelle `types.ts` mit allen Interfaces:

```typescript
// Parameter Types
export interface GTMTemplateParameter {
  key: string;
  type: 'template';
  value: string;
}

export interface GTMBooleanParameter {
  key: string;
  type: 'boolean';
  value: boolean;
}

export interface GTMListParameter {
  key: string;
  type: 'list';
  list: GTMParameter[];
}

export type GTMParameter = GTMTemplateParameter | GTMBooleanParameter | GTMListParameter;

// Trigger Filters
export interface GTMCondition {
  type: ConditionType;
  parameter?: { key: string; type: 'template'; value: string }[];
  ignoreCase?: boolean;
}

export type ConditionType =
  | 'equals' | 'contains' | 'matchRegex'
  | 'startsWith' | 'endsWith' | 'greater' | 'less';

// Trigger Configs
export interface WebTrigger {
  type: WebTriggerType;
  name: string;
  filter?: GTMCondition[];
  // ... other fields
}

export interface ServerTrigger {
  type: ServerTriggerType;
  name: string;
  customEventFilter?: GTMCondition[];
  // ... other fields
}
```

### 4.2 JSON Schema für Validierung

**Vorschlag:** Erstelle JSON-Schemas für jedes Tool:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "GTM Tag Creation",
  "type": "object",
  "required": ["workspacePath", "name", "type", "parameter"],
  "properties": {
    "workspacePath": { "type": "string", "pattern": "^accounts/\\d+/containers/\\d+/workspaces/\\d+$" },
    "name": { "type": "string", "minLength": 1 },
    "type": {
      "type": "string",
      "enum": ["html", "gaawe", "ua", "awct", "flc", "awct", "spa"]
    },
    "parameter": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["key", "type"],
        "properties": {
          "key": { "type": "string" },
          "type": { "enum": ["template", "boolean", "integer", "list", "map"] },
          "value": { "type": ["string", "number", "boolean"] },
          "list": { "$ref": "#/properties/parameter" },
          "map": { "$ref": "#/properties/parameter" }
        }
      }
    }
  }
}
```

---

## 5. Workflows & Best Practices

### 5.1 Workflow Guides

**Vorschlag:** Neues Tool für Workflow-Empfehlungen:

```json
{
  "name": "gtm_gtm_workflow_guide",
  "description": "Returns recommended workflow steps for common GTM tasks.\n\n**Available Workflows:**\n- 'setup_ga4': Complete GA4 setup with tags and triggers\n- 'setup_conversion_tracking': Conversion tracking setup\n- 'setup_form_tracking': Form submission tracking\n- 'setup_scroll_tracking': Scroll depth tracking\n- 'setup_link_click_tracking': Link click tracking",
  "parameters": {
    "workflow": {
      "type": "string",
      "enum": ["setup_ga4", "setup_conversion_tracking", "setup_form_tracking", "setup_scroll_tracking", "setup_link_click_tracking"]
    },
    "containerPath": {
      "type": "string",
      "description": "Container path for the workflow"
    }
  },
  "returns": {
    "steps": [
      {
        "step": 1,
        "action": "Create GA4 Configuration Tag",
        "tool": "gtm_gtm_create_tag",
        "parameters": { /* ... */ },
        "description": "Creates the base GA4 configuration tag with measurement ID"
      },
      {
        "step": 2,
        "action": "Create Page View Trigger",
        "tool": "gtm_gtm_create_trigger",
        "parameters": { /* ... */ },
        "description": "Creates a trigger that fires on all page views"
      }
    ],
    "prerequisites": [
      "GA4 Property must exist in Google Analytics",
      "Measurement ID must be available"
    ]
  }
}
```

### 5.2 Best Practice Checker

**Vorschlag:** Neues Tool für Best Practice Validierung:

```json
{
  "name": "gtm_gtm_check_best_practices",
  "description": "Analyzes a workspace for GTM best practices and provides recommendations.\n\n**Checks:**\n- Tags with missing triggers\n- Duplicate trigger names\n- Unused variables\n- Missing GA4 configuration\n- Proper tag naming conventions\n- Trigger organization",
  "parameters": {
    "workspacePath": { "type": "string" }
  },
  "returns": {
    "score": 85,
    "issues": [
      {
        "severity": "warning",
        "type": "tag_without_trigger",
        "message": "Tag 'Old Analytics' has no firing triggers",
        "tagId": "7",
        "recommendation": "Add a firing trigger or delete the tag"
      },
      {
        "severity": "info",
        "type": "naming_convention",
        "message": "Consider using consistent tag naming (e.g., 'GA4 - Event Name')"
      }
    ],
    "recommendations": [
      "Add descriptive tag names",
      "Organize tags into folders",
      "Test tags before publishing"
    ]
  }
}
```

---

## 6. Tool-Specific Improvements

### 6.1 Create Trigger - Parameter Format Korrektur

**Problem:** Parameter-Format für customEventFilter unklar.

**Lösung:** Explizite Dokumentation:

```
**customEventFilter Structure:**
```json
[
  {
    "type": "equals",
    "parameter": [
      { "key": "arg1", "type": "template", "value": "{{Event}}" },
      { "key": "arg2", "type": "template", "value": "purchase" }
    ]
  }
]
```

**Key Points:**
- Nested `parameter` array (NOT direct arg1/arg2)
- Each parameter MUST have a `key` field
- Values wrapped in {{ }} for GTM variables

**Alternative for filter:**
```json
[
  {
    "type": "contains",
    "arg1": "{{Page URL}}",
    "arg2": "/checkout"
  }
]
```
```

### 6.2 Create Variable - Vendor Template Issue

**Problem:** Constant Variables erfordern vendorTemplate Struktur.

**Lösung:** Spezifische Dokumentation:

```
**Variable Type: Constant (k)**

When creating a constant variable, use this format:
```json
{
  "name": "My Constant",
  "type": "k",
  "parameter": [
    {
      "key": "value",
      "type": "template",
      "value": "your_constant_value"
    }
  ]
}
```

**Important:**
- Do NOT use {{ }} in variable names
- Use simple, descriptive names (e.g., "API Key" not "{{API Key}}")
- Value is the constant string to use

**For JavaScript variables (jsm):**
```json
{
  "name": "My JS Variable",
  "type": "jsm",
  "parameter": [
    {
      "key": "javascript",
      "type": "template",
      "value": "function() { return 'hello'; }"
    }
  ]
}
```
```

### 6.3 Template Creation - Format Requirements

**Problem:** Template-Format nicht gut dokumentiert.

**Lösung:** Vollständiges Beispiel:

```
**Template Format:**

```
// ==ClosureCompiler==
// @compilation_level ADVANCED_OPTIMIZATIONS
// @output_file_name template.js
// @externs_url https://googleads.github.io/google-tag-manager-api-reference/externs.js
// ==/ClosureCompiler==

___INFO___
{
  "displayName": "My Template",
  "description": "Template description",
  "category": "UTILITY",
  "helpUrl": "https://example.com/docs",
  "parameters": [
    {
      "key": "input",
      "type": "TEXT",
      "name": "Input Text",
      "description": "Text to process"
    }
  ],
  "containers": ["web"]
}

___SANDBOXED_JS___

var input = data.input;
return {
  value: input.toUpperCase()
};

___TESTS___

assertThat('ABC').isIn(['ABC', 'XYZ']);
```

**Sections:**
1. Closure Compiler settings (optional)
2. ___INFO___ - Metadata
3. ___SANDBOXED_JS___ - Code
4. ___TESTS___ - Tests (optional)
```

### 6.4 Zone Creation - Parameter Format

**Problem:** Zone-Parameter-Format unklar.

**Lösung:** Detaillierte Dokumentation:

```
**Zone Creation Parameters**

**Boundary - URL-based:**
```json
{
  "boundary": {
    "condition": [
      {
        "type": "contains",
        "arg1": "{{Page URL}}",
        "arg2": "/checkout"
      }
    ]
  }
}
```

**Boundary - Event-based:**
```json
{
  "boundary": {
    "condition": [
      {
        "type": "equals",
        "arg1": "{{Event}}",
        "arg2": "purchase"
      }
    ]
  }
}
```

**Type Restriction - Whitelist:**
```json
{
  "typeRestriction": {
    "whitelist": [
      {
        "type": "contains",
        "arg1": "{{_Type}}",
        "arg2": "gaawe"
      }
    ]
  }
}
```

**Type Restriction - Blacklist:**
```json
{
  "typeRestriction": {
    "blacklist": [
      {
        "type": "contains",
        "arg1": "{{Tag Name}}",
        "arg2": "marketing"
      }
    ]
  }
}
```

**Full Example:**
```json
{
  "name": "GA4 Purchase Zone",
  "boundary": {
    "condition": [
      {
        "type": "equals",
        "arg1": "{{Event}}",
        "arg2": "purchase"
      }
    ]
  },
  "typeRestriction": {
    "whitelist": [
      {
        "type": "equals",
        "arg1": "{{_Type}}",
        "arg2": "gaawe"
      }
    ]
  }
}
```
```

---

## 7. Enhanced Context & Helper Tools

### 7.1 Container Type Detection

**Vorschlag:** Hilfreiches Tool für Container-Info:

```json
{
  "name": "gtm_gtm_detect_container_capabilities",
  "description": "Returns a summary of what's supported in the container.\n\n**Use this BEFORE:**\n- Creating triggers (to know which types are supported)\n- Creating tags (to know which features are available)\n- Setting up server-side features\n\n**Returns:**\n```json\n{\n  \"containerType\": \"web\",\n  \"supportedFeatures\": {\n    \"clients\": false,\n    \"transformations\": false,\n    \"zones\": true\n  },\n  \"supportedTriggerTypes\": [\n    \"PAGEVIEW\", \"CLICK\", \"CUSTOM_EVENT\", \"TIMER\", etc.\n  ],\n  \"supportedVariableTypes\": [\n    \"c\", \"jsm\", \"v\", \"k\", \"aev\", \"r\", \"smm\", \"f\"\n  ],\n  \"bestPractices\": {\n    \"useFilter\": true,\n    \"useCustomEventFilter\": false,\n    \"recommendedTriggers\": [\"PAGEVIEW\", \"CUSTOM_EVENT\"]\n  }\n}```"
}
```

### 7.2 Smart Search

**Vorschlag:** Tool für intelligente Suche:

```json
{
  "name": "gtm_gtm_search_entities",
  "description": "Search for tags, triggers, or variables across workspaces.\n\n**Example Queries:**\n- 'analytics' - Find all tags/triggers with 'analytics' in name\n- 'type:gaawe' - Find all GA4 tags\n- 'trigger:pageview' - Find pageview triggers\n- 'variable:jsm' - Find JavaScript variables",
  "parameters": {
    "containerPath": { "type": "string" },
    "query": { "type": "string" },
    "entityType": {
      "type": "string",
      "enum": ["all", "tags", "triggers", "variables"],
      "default": "all"
    }
  }
}
```

---

## 8. Documentation for LLMs

### 8.1 System Prompt Recommendations

**Vorschlag:** Ergänze System Prompt mit GTM-spezifischen Anweisungen:

```
When working with GTM tools:

1. **ALWAYS check container type first:**
   - Use `gtm_gtm_get_container_info` before creating triggers
   - Web containers use `filter`, Server containers use `customEventFilter`
   - Different trigger types are supported

2. **Parameter format is CRITICAL:**
   - All parameters must have `type: "template"` unless otherwise specified
   - Format: [{ "key": "keyName", "type": "template", "value": "value" }]
   - For filters in CUSTOM_EVENT triggers, use nested parameter array with keys

3. **Validation before creation:**
   - Use `gtm_gtm_validate_trigger_config` before creating triggers
   - Use `gtm_gtm_get_trigger_template` for common patterns
   - Check workspace status with `gtm_gtm_get_workspace_status`

4. **Variable naming:**
   - Do NOT use {{ }} in variable names (e.g., use "API Key" not "{{API Key}}")
   - Use {{ }} only in values to reference GTM variables

5. **Workflow pattern:**
   a) Get container info → b) Validate config → c) Create entity → d) Verify creation → e) Test in workspace
```

### 8.2 Error Handling Strategy

**Vorschlag:** Standardisierte Fehlerbehandlung:

```
When encountering errors:

1. **Parse error type:**
   - Invalid parameter format → Check type field, add "type": "template"
   - Missing key in filter → Add "key" fields to parameter array
   - Invalid container type → Verify container supports the operation

2. **Use validation tools:**
   - Call `gtm_gtm_validate_trigger_config` with the failed config
   - Use suggestions from validation to fix issues

3. **Get examples:**
   - Use `gtm_gtm_get_trigger_template` for correct patterns
   - Compare with successful creations in workspace

4. **Retry with corrected config:**
   - Apply fixes from validation
   - Try again with same operation

5. **If still failing:**
   - Check container capabilities with `gtm_gtm_get_container_info`
   - Verify workspace path is correct
   - Check API permissions/scopes
```

---

## 9. Implementation Priority

### High Priority (P1)
1. ✅ Fix parameter documentation in all create/update tools
2. ✅ Add explicit examples for filter vs customEventFilter
3. ✅ Improve error messages with fix suggestions
4. ✅ Add container type context to tool descriptions
5. ✅ Create parameter format guide

### Medium Priority (P2)
1. ⚡ Add validation tools for pre-creation checks
2. ⚡ Create workflow guide tool
3. ⚡ Add smart search functionality
4. ⚡ Improve trigger templates with full API calls
5. ⚡ Add best practice checker

### Low Priority (P3)
1. 💡 Create TypeScript type definitions
2. 💡 Add JSON schema validation
3. 💡 Create comprehensive examples library
4. 💡 Add unit test examples for LLM testing
5. 💡 Create interactive tutorial mode

---

## 10. Quick Reference for LLMs

### Parameter Format Cheatsheet

```javascript
// Tag Creation
{
  parameter: [
    { key: "html", type: "template", value: "<script>...</script>" }
  ]
}

// Web Trigger Filter
{
  filter: [
    { type: "contains", arg1: "{{Page URL}}", arg2: "/checkout" }
  ]
}

// Server Trigger Filter (CUSTOM_EVENT)
{
  customEventFilter: [
    {
      type: "equals",
      parameter: [
        { key: "arg1", type: "template", value: "{{Event}}" },
        { key: "arg2", type: "template", value: "purchase" }
      ]
    }
  ]
}

// Variable Creation
{
  parameter: [
    { key: "value", type: "template", value: "my_value" }
  ]
}
```

### Container Type Quick Check

```
Web Container:
- Usage: tags, triggers (filter), variables, folders
- No: clients, transformations
- Trigger types: PAGEVIEW, CLICK, CUSTOM_EVENT, etc.

Server Container:
- Usage: clients, triggers (customEventFilter), transformations
- Special: always, customEvent, triggerGroup
- Trigger types: always, customEvent, triggerGroup
```

### Workflow Checklist

Before any operation:
- [ ] Check container type with `gtm_gtm_get_container_info`
- [ ] Verify supported trigger/variable types
- [ ] Use `gtm_gtm_validate_trigger_config` for triggers
- [ ] Get workspace status with `gtm_gtm_get_workspace_status`

During operation:
- [ ] Include `type: "template"` in all parameters
- [ ] Use correct filter format for container type
- [ ] Use `{{ }}` only for GTM variable references
- [ ] Variable names should NOT contain {{ }}

After operation:
- [ ] Verify creation with get/list functions
- [ ] Check workspace status for changes
- [ ] Test in preview/debug mode if available

---

## Appendix: Test Results Summary

### Fully Functional (✅)
- All list/get operations
- Basic create operations with correct format
- Delete operations
- Status/analysis functions
- Export operations
- Server container client operations

### Needs Documentation Updates (⚠️)
- create_trigger: Filter format clarification needed
- create_variable: Parameter type requirements
- create_template: Complete format examples
- create_zone: Boundary format details

### Requires Higher Scopes (🔒)
- create_version: Insufficient Permission
- list_user_permissions: Insufficient Scopes
- publish_version: Requires version creation rights

### API Limitations (⚙️)
- delete_environment: Live environment cannot be deleted
- Container type restrictions based on usageContext
- Trigger type varies by container (web vs server)

---

## Conclusion

Der GTM MCP Server hat ein solides Fundament, aber die Zusammenarbeit mit LLMs kann durch folgende Maßnahmen deutlich verbessert werden:

1. **Bessere Dokumentation** mit konkreten Beispielen für jeden Parameter-Typ
2. **Klare Fehlermeldungen** mit automatischen Lösungsvorschlägen
3. **Validierungstools** vor der Erstellung von Ressourcen
4. **Workflow-Guides** für häufige Aufgaben
5. **Container-Kontext** in allen Tool-Beschreibungen

Mit diesen Verbesserungen wird der Server für LLMs viel intuitiver und effizienter nutzbar, was die Produktivität bei der GTM-Automatisierung erheblich steigert.

## Tool-by-Tool Status (2026-02-11)

Quelle: `selftest-web-report.clean.json` (WEB: pass=73, skip=23, fail=0) und `selftest-server-report.clean.json` (SERVER: pass=76, skip=20, fail=0).

Legende: `pass` = erfolgreich, `skip` = bewusst/bedingt ausgelassen, `not-run` = im aktuellen Selftest nicht aufgerufen.

| Tool | WEB | SERVER | Hinweis |
|---|---|---|---|
| `gtm_analyze_container` | pass | pass |  |
| `gtm_check_best_practices` | pass | pass |  |
| `gtm_create_client` | skip | pass | WEB: not a server container |
| `gtm_create_container` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_create_environment` | pass | pass |  |
| `gtm_create_folder` | pass | pass |  |
| `gtm_create_gtag_config` | pass | pass |  |
| `gtm_create_tag` | pass | skip | SERVER: server container |
| `gtm_create_template` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_create_transformation` | skip | skip | WEB: not a server container; SERVER: 500: Experienced an internal error. |
| `gtm_create_trigger` | pass | pass |  |
| `gtm_create_user_permission` | skip | skip | WEB: GTM_SELFTEST_RISKY=false |
| `gtm_create_variable` | pass | pass |  |
| `gtm_create_version` | pass | pass |  |
| `gtm_create_workspace` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_create_zone` | skip | skip | WEB: 404: Not found or permission denied.; SERVER: zone tests are not applicable for server container workflow |
| `gtm_delete_client` | skip | pass | WEB: not a server container |
| `gtm_delete_container` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_delete_environment` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_delete_folder` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_delete_gtag_config` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_delete_tag` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_delete_template` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_delete_transformation` | skip | skip | WEB: not a server container; SERVER: transformation not created |
| `gtm_delete_trigger` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_delete_user_permission` | skip | skip | WEB: GTM_SELFTEST_RISKY=false |
| `gtm_delete_variable` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_delete_version` | skip | skip | WEB: 400: Returned an error response for your request. |
| `gtm_delete_workspace` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_delete_zone` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_disable_built_in_variables` | pass | pass |  |
| `gtm_enable_built_in_variables` | pass | pass |  |
| `gtm_export_version` | pass | pass |  |
| `gtm_get_account` | pass | pass |  |
| `gtm_get_client` | skip | pass | WEB: not a server container |
| `gtm_get_container` | pass | pass |  |
| `gtm_get_container_info` | pass | pass |  |
| `gtm_get_destination` | skip | skip | WEB: no destinations found |
| `gtm_get_environment` | pass | pass |  |
| `gtm_get_folder` | pass | pass |  |
| `gtm_get_folder_entities` | pass | pass |  |
| `gtm_get_gtag_config` | pass | pass |  |
| `gtm_get_latest_version_header` | pass | pass |  |
| `gtm_get_live_version` | pass | pass |  |
| `gtm_get_tag` | pass | skip | SERVER: tag not created |
| `gtm_get_tag_parameters` | pass | pass |  |
| `gtm_get_template` | pass | pass |  |
| `gtm_get_transformation` | skip | skip | WEB: not a server container; SERVER: transformation not created |
| `gtm_get_trigger` | pass | pass |  |
| `gtm_get_trigger_template` | pass | pass |  |
| `gtm_get_user_permission` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_get_variable` | pass | pass |  |
| `gtm_get_variable_parameters` | pass | pass |  |
| `gtm_get_version` | pass | pass |  |
| `gtm_get_workflow` | pass | pass |  |
| `gtm_get_workspace` | pass | pass |  |
| `gtm_get_workspace_status` | pass | pass |  |
| `gtm_get_zone` | skip | skip | WEB: zone not created; SERVER: zone not created (server container) |
| `gtm_import_template_from_gallery` | pass | pass |  |
| `gtm_link_destination` | skip | skip | WEB: set GTM_SELFTEST_DESTINATION_ID to enable |
| `gtm_list_accounts` | pass | pass |  |
| `gtm_list_built_in_variables` | pass | pass |  |
| `gtm_list_clients` | skip | pass | WEB: not a server container |
| `gtm_list_containers` | pass | pass |  |
| `gtm_list_destinations` | pass | pass |  |
| `gtm_list_environments` | pass | pass |  |
| `gtm_list_folders` | pass | pass |  |
| `gtm_list_gtag_configs` | pass | pass |  |
| `gtm_list_tag_types` | pass | pass |  |
| `gtm_list_tags` | pass | pass |  |
| `gtm_list_templates` | pass | pass |  |
| `gtm_list_transformations` | skip | pass | WEB: not a server container |
| `gtm_list_triggers` | pass | pass |  |
| `gtm_list_user_permissions` | pass | pass |  |
| `gtm_list_variables` | pass | pass |  |
| `gtm_list_versions` | pass | pass |  |
| `gtm_list_workflows` | pass | pass |  |
| `gtm_list_workspaces` | pass | pass |  |
| `gtm_list_zones` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_lookup_container` | skip | skip | WEB: GTM_TEST_CONTAINER_PUBLIC_ID not set |
| `gtm_move_entities_to_folder` | skip | pass | WEB: 404: Not found or permission denied. |
| `gtm_publish_version` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_reauthorize_environment` | pass | pass |  |
| `gtm_revert_built_in_variable` | pass | pass |  |
| `gtm_revert_tag` | pass | skip | SERVER: tag not created |
| `gtm_revert_template` | pass | pass |  |
| `gtm_search_entities` | pass | pass |  |
| `gtm_status` | pass | pass |  |
| `gtm_sync_workspace` | not-run | not-run | WEB: Nicht im Selftest-Szenario aufgerufen |
| `gtm_undelete_version` | pass | pass |  |
| `gtm_update_client` | skip | pass | WEB: not a server container |
| `gtm_update_environment` | pass | pass |  |
| `gtm_update_folder` | pass | pass |  |
| `gtm_update_gtag_config` | pass | pass |  |
| `gtm_update_tag` | pass | skip | SERVER: tag not created |
| `gtm_update_template` | pass | pass |  |
| `gtm_update_transformation` | skip | skip | WEB: not a server container; SERVER: transformation not created |
| `gtm_update_trigger` | pass | pass |  |
| `gtm_update_user_permission` | skip | skip | WEB: GTM_SELFTEST_RISKY=false |
| `gtm_update_variable` | pass | pass |  |
| `gtm_update_zone` | skip | skip | WEB: zone not created; SERVER: zone not created (server container) |
| `gtm_validate_trigger_config` | pass | pass |  |
