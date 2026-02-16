# GTM Tag Parameter Structures Reference

**Critical reference for creating GTM tags with correct API parameters**

---

## 🚨 Common Pitfalls

1. **Direct parameters don't work** - Many settings require nested `list`/`map` structures
2. **Parameter names differ from UI** - UI shows friendly names, API uses internal names
3. **update_tag can't add parameters** - Must delete & recreate if adding new parameters

---

## 📋 Parameter Structures by Tag Type

### 1. Google Tag (googtag) - GA4 Configuration

**Correct Structure for Server Container URL:**
```json
{
  "name": "GA4 Configuration",
  "type": "googtag",
  "parameter": [
    {
      "key": "tagId",
      "type": "template",
      "value": "{{DL - GA4 Measurement ID}}"
    },
    {
      "key": "configSettingsTable",
      "type": "list",
      "list": [
        {
          "type": "map",
          "map": [
            {
              "key": "parameter",
              "type": "template",
              "value": "server_container_url"
            },
            {
              "key": "parameterValue",
              "type": "template",
              "value": "https://your-server.com"
            }
          ]
        },
        {
          "type": "map",
          "map": [
            {
              "key": "parameter",
              "type": "template",
              "value": "send_page_view"
            },
            {
              "key": "parameterValue",
              "type": "template",
              "value": "false"
            }
          ]
        }
      ]
    }
  ]
}
```

**Key Points:**
- ❌ NOT `{"key": "server_container_url", "value": "..."}`
- ✅ MUST use `configSettingsTable` with map structure
- Map keys: `parameter` / `parameterValue`
- Common settings: `server_container_url`, `send_page_view`, `user_id`

---

### 2. GA4 Event Tag (gaawe)

**Correct Structure for Event Parameters:**
```json
{
  "name": "GA4 Event",
  "type": "gaawe",
  "parameter": [
    {
      "key": "eventName",
      "type": "template",
      "value": "page_view"
    },
    {
      "key": "measurementIdOverride",
      "type": "template",
      "value": "{{DL - GA4 Measurement ID}}"
    },
    {
      "key": "eventSettingsTable",
      "type": "list",
      "list": [
        {
          "type": "map",
          "map": [
            {
              "key": "parameter",
              "type": "template",
              "value": "event_id"
            },
            {
              "key": "parameterValue",
              "type": "template",
              "value": "{{DL - Unique Event ID}}"
            }
          ]
        },
        {
          "type": "map",
          "map": [
            {
              "key": "parameter",
              "type": "template",
              "value": "custom_parameter"
            },
            {
              "key": "parameterValue",
              "type": "template",
              "value": "{{Custom Variable}}"
            }
          ]
        }
      ]
    }
  ]
}
```

**Key Points:**
- ❌ NOT `{"key": "event_id", "value": "..."}`
- ✅ MUST use `eventSettingsTable` with map structure
- Map keys: `parameter` / `parameterValue`
- Common parameters: `event_id`, `value`, `currency`, `transaction_id`

---

### 3. Google Ads Conversion Tag (awct)

**Direct Parameters (simple):**
```json
{
  "name": "Google Ads Conversion",
  "type": "awct",
  "parameter": [
    {
      "key": "conversionId",
      "type": "template",
      "value": "AW-XXXXXXXX"
    },
    {
      "key": "conversionLabel",
      "type": "template",
      "value": "abc123"
    },
    {
      "key": "conversionValue",
      "type": "template",
      "value": "99.99"
    },
    {
      "key": "currencyCode",
      "type": "template",
      "value": "USD"
    },
    {
      "key": "orderId",
      "type": "template",
      "value": "{{DL - Unique Event ID}}"
    }
  ]
}
```

**Key Points:**
- ✅ Direct parameters work (no nested structure)
- `orderId` is for deduplication
- `conversionValue` and `currencyCode` for value tracking

---

### 4. Facebook Pixel Tag (Custom Template cvt_KFNBV)

**Parameters for stape-io/fb-tag:**
```json
{
  "name": "Facebook PageView",
  "type": "cvt_KFNBV",
  "parameter": [
    {
      "key": "pixelIds",
      "type": "template",
      "value": "123456789"
    },
    {
      "key": "eventId",
      "type": "template",
      "value": "{{DL - Unique Event ID}}"
    }
  ]
}
```

**Key Points:**
- Template ID: `cvt_KFNBV` (from stape-io/fb-tag)
- `pixelIds` (plural!) - NOT `pixelId`
- `eventId` for deduplication with CAPI
- Custom templates have their own parameter structure

---

## 🔧 Helper Functions for MCP Server

### Function: Build Config Settings Table
```typescript
function buildConfigSettingsTable(settings: Record<string, string>): any {
  return {
    key: "configSettingsTable",
    type: "list",
    list: Object.entries(settings).map(([param, value]) => ({
      type: "map",
      map: [
        { key: "parameter", type: "template", value: param },
        { key: "parameterValue", type: "template", value: value }
      ]
    }))
  };
}

// Usage:
buildConfigSettingsTable({
  "server_container_url": "https://server.com",
  "send_page_view": "false"
})
```

### Function: Build Event Settings Table
```typescript
function buildEventSettingsTable(params: Record<string, string>): any {
  return {
    key: "eventSettingsTable",
    type: "list",
    list: Object.entries(params).map(([param, value]) => ({
      type: "map",
      map: [
        { key: "parameter", type: "template", value: param },
        { key: "parameterValue", type: "template", value: value }
      ]
    }))
  };
}

// Usage:
buildEventSettingsTable({
  "event_id": "{{DL - Unique Event ID}}",
  "value": "99.99",
  "currency": "USD"
})
```

---

## 📚 Common Use Cases

### Hybrid Tracking Setup (Web + Server)

**GA4 Config:**
```typescript
parameter: [
  { key: "tagId", type: "template", value: "{{DL - GA4 Measurement ID}}" },
  buildConfigSettingsTable({
    "server_container_url": "{{DL - Server Transport URL}}"
  })
]
```

**GA4 Event with Deduplication:**
```typescript
parameter: [
  { key: "eventName", type: "template", value: "page_view" },
  { key: "measurementIdOverride", type: "template", value: "{{DL - GA4 Measurement ID}}" },
  buildEventSettingsTable({
    "event_id": "{{DL - Unique Event ID}}"
  })
]
```

**Facebook with Deduplication:**
```typescript
parameter: [
  { key: "pixelIds", type: "template", value: "{{DL - FB Pixel ID}}" },
  { key: "eventId", type: "template", value: "{{DL - Unique Event ID}}" }
]
```

**Google Ads with Deduplication:**
```typescript
parameter: [
  { key: "conversionId", type: "template", value: "{{DL - Google Ads Conversion ID}}" },
  { key: "conversionLabel", type: "template", value: "{{DL - Google Ads Conversion Label}}" },
  { key: "orderId", type: "template", value: "{{DL - Unique Event ID}}" }
]
```

---

## ⚠️ Troubleshooting

### Problem: Parameters are ignored
**Cause:** Wrong structure or parameter name  
**Solution:** Use nested `list`/`map` structure with correct keys

### Problem: `update_tag` doesn't add parameters
**Cause:** API limitation  
**Solution:** Delete tag and recreate with all parameters

### Problem: Custom template parameters differ
**Cause:** Each template defines its own parameters  
**Solution:** Check template documentation or extract from existing tag

---

## 🔍 How to Find Parameter Structures

### Method 1: Extract from Existing Tag
```typescript
// List tags from working container
const tags = await gtm_gtm_list_tags(workspacePath);

// Get full tag details
const tag = await gtm_gtm_get_tag(tagPath);

// Extract parameter structure
console.log(tag.parameter);
```

### Method 2: Research in GTM UI
1. Create tag manually in GTM UI
2. Use browser DevTools → Network tab
3. Save tag and capture API request
4. Extract parameter structure from request payload

### Method 3: Check Template Code
```typescript
// Import template
const template = await gtm_gtm_import_template_from_gallery(
  workspacePath,
  owner,
  repository
);

// Read template.tpl file in repository
// Look for ___TEMPLATE_PARAMETERS___ section
```

---

## ✅ Best Practices

1. **Always check parameter structure before creating tags**
2. **Use helper functions for complex nested structures**
3. **Test with preview mode before publishing**
4. **Document custom template parameters**
5. **Keep this reference updated**

---

## 📖 Additional Resources

- GTM API v2 Reference: https://developers.google.com/tag-manager/api/v2
- stape.io Templates: https://github.com/stape-io
- GTM Community Gallery: https://tagmanager.google.com/gallery

---

**Last Updated:** 2026-02-13  
**Version:** 1.0  
**Status:** Production Ready
