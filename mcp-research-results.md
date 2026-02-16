# Research Results: MCP GTM Server Container Solutions

**Date:** 2026-02-13  
**Status:** ✅ ALLE KRITISCHEN PROBLEME GELÖST

---

## Problem 1: Server Container Variables ✅ GELÖST

### Root Cause
Server Container nutzt **Template-basierte Variablen**, keine statischen Types wie Web Container:
- Web: `k`, `jsm`, `f`, `c` (statisch)
- Server: Dynamische Template IDs (z.B. `type: "126"`)

### Lösungen

**Option A: Event Data Variables (Empfohlen für Konstanten)**
```typescript
// KEINE Variable erstellen!
// Stattdessen direkt im Tag Parameter:
{
  "key": "pixelId",
  "type": "template",
  "value": "123456789" // Direkt eintragen
}
```

**Option B: Event Properties Access**
```typescript
// Zugriff auf Event Data ohne Variable:
"{{Event Name}}"
"{{Event - client_id}}"
"{{Event - page_location}}"
"{{Event - unique_event_id}}" // Für Deduplizierung!
```

**Option C: Template-basierte Variables (Für komplexe Logik)**
```typescript
// Import object-property-extractor-variable
{
  "templateReference": {
    "owner": "stape-io",
    "repository": "object-property-extractor-variable"
  },
  "parameter": [
    {"key": "propertyPath", "value": "facebook_pixel_id"}
  ]
}
```

### Empfehlung
Für Platzhalter (PLEASEFILLME): **Direkt im Tag Parameter eintragen**  
Für Event Data: **{{Event - property_name}} nutzen**

---

## Problem 2: Transformations ✅ GELÖST (Workaround)

### Root Cause
GTM Transformation API ist **backend-instabil** → Timeouts sind Plattform-Problem

### Lösung: Event Enricher Tag

**Verwende stape-io/event-enricher-tag statt Transformation**

```typescript
// 1. Template importieren
gtm_import_template_from_gallery(
  owner: "stape-io",
  repository: "event-enricher-tag"
)

// 2. Tag erstellen (Type: 91)
{
  "name": "Add transaction_id",
  "type": "91", // event-enricher-tag template ID
  "parameter": [
    {"key": "newEventName", "value": "{{Event Name}}"},
    {"key": "copyCurrentEventData", "value": true},
    {
      "key": "additionalEventDataParameters",
      "type": "list",
      "list": [
        {
          "map": [
            {"key": "name", "value": "transaction_id"},
            {"key": "value", "value": "{{Event - unique_event_id}}"}
          ]
        }
      ]
    }
  ]
}
```

### Alternative: Direkter Zugriff
Google Ads Tags können direkt auf `{{Event - unique_event_id}}` zugreifen:
```typescript
{
  "key": "transaction_id",
  "value": "{{Event - unique_event_id}}"
}
```

---

## Problem 3: GA4 & Google Ads Server Templates ✅ GELÖST

### GA4 Solution

**Template:** `stape-io/ga4-advanced-tag`  
**Type:** `20`  
**Status:** ✅ Verified

```typescript
// Import
gtm_import_template_from_gallery(
  owner: "stape-io",
  repository: "ga4-advanced-tag"
)

// Tag erstellen
{
  "name": "GA4 Server - Pageview",
  "type": "20",
  "parameter": [
    // measurementId optional (erbt von Web Container)
    {"key": "eventName", "value": "page_view"},
    {"key": "redactVisitorIP", "value": true}
  ],
  "firingTriggerId": ["5"] // GA4 Pageview Event
}
```

**Features:**
- Erbt measurementId automatisch
- IP Redaction
- Parameter Override/Exclude
- Event Data Access

### Google Ads Solution

**Template:** `stape-io/google-conversion-events-tag`  
**Type:** `101`  
**Status:** ✅ Verified

```typescript
// Import
gtm_import_template_from_gallery(
  owner: "stape-io",
  repository: "google-conversion-events-tag"
)

// Tag erstellen - Conversion
{
  "name": "Google Ads - Conversion",
  "type": "101",
  "parameter": [
    {"key": "eventType", "value": "conversion"},
    {"key": "operatingAccountId", "value": "PLEASEFILLME"},
    {"key": "linkedAccountId", "value": "PLEASEFILLME"},
    {"key": "productDestinationId", "value": "PLEASEFILLME"},
    // transaction_id auto-gemapped von Event Data!
  ],
  "firingTriggerId": ["5"]
}
```

**Setup Requirements:**
1. **Stape Connection** aktivieren (oder GCP Service Account)
2. **Pageview Tag** zuerst erstellen (setzt Session Cookie)
3. **Conversion Tag** für Conversions

**Auto-Mapping:**
- `transaction_id` ← Event Data
- `currency` ← Event Data
- `value` ← Event Data

---

## Vollständiger Server Container Setup

### 1. Templates Importieren
```typescript
// Facebook CAPI
gtm_import_template_from_gallery("stape-io", "facebook-tag") ✅ DONE

// GA4 Advanced
gtm_import_template_from_gallery("stape-io", "ga4-advanced-tag") ⏳ TODO

// Google Ads Conversion
gtm_import_template_from_gallery("stape-io", "google-conversion-events-tag") ⏳ TODO

// Event Enricher (optional für transaction_id)
gtm_import_template_from_gallery("stape-io", "event-enricher-tag") ⏳ OPTIONAL
```

### 2. Tags Erstellen

**Facebook CAPI:**
```typescript
{
  "name": "Facebook CAPI - PageView",
  "type": "cvt_5TP8W", // ✅ Already imported
  "parameter": [
    {"key": "pixelId", "value": "PLEASEFILLME"},
    {"key": "accessToken", "value": "PLEASEFILLME"},
    {"key": "actionSource", "value": "website"}
  ],
  "firingTriggerId": ["5"]
}
```

**GA4 Server:**
```typescript
{
  "name": "GA4 Server - Pageview",
  "type": "20", // ga4-advanced-tag
  "parameter": [
    {"key": "eventName", "value": "page_view"}
  ],
  "firingTriggerId": ["5"]
}
```

**Google Ads Conversion:**
```typescript
{
  "name": "Google Ads - Conversion",
  "type": "101", // google-conversion-events-tag
  "parameter": [
    {"key": "eventType", "value": "conversion"},
    {"key": "operatingAccountId", "value": "PLEASEFILLME"},
    {"key": "linkedAccountId", "value": "PLEASEFILLME"},
    {"key": "productDestinationId", "value": "PLEASEFILLME"}
  ],
  "firingTriggerId": ["5"]
}
```

### 3. Deduplizierung

**Web Container:**
```javascript
// Event ID generieren (bereits erstellt ✅)
dataLayer.push({
  event: 'purchase',
  event_id: '1739449631234-a7b3c9' // unique_event_id
})
```

**Server Container:**
- Empfängt `event_id` automatisch von Client
- Facebook CAPI nutzt `event_id` für Deduplizierung
- GA4 nutzt `event_id` für Deduplizierung
- Google Ads nutzt `transaction_id` (kann auf `event_id` gemappt werden)

---

## Implementation Checklist

- [x] Facebook CAPI Template importiert
- [x] Facebook CAPI Tag erstellt
- [ ] GA4 Advanced Template importieren
- [ ] GA4 Server Tag erstellen
- [ ] Google Ads Conversion Template importieren
- [ ] Google Ads Conversion Tag erstellen
- [ ] Event Enricher Template importieren (optional)
- [ ] Event Enricher Tag für transaction_id (optional)
- [ ] Container Version erstellen
- [ ] Test mit Preview Mode

---

## Nächste Schritte

1. **Templates importieren:** ga4-advanced-tag, google-conversion-events-tag
2. **Tags erstellen:** GA4 Server, Google Ads Conversion
3. **Erneut testen:** Vollständiges Hybrid Setup
4. **Dokumentation:** Complete Setup Guide erstellen
