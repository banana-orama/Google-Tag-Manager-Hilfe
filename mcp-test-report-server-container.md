# MCP GTM Server Container Test Report
**Date:** 2026-02-13  
**Container:** MCP Hybrid Server Test (GTM-5BBSQB23)

## ✅ Was funktioniert

### 1. Template Import
- **Facebook Conversion API (stape-io/facebook-tag)** → ✅ Erfolgreich importiert
  - Template ID: `cvt_5TP8W`
  - Status: Verfügbar für Tag-Erstellung

### 2. Tag Creation mit Custom Templates
- **Facebook CAPI Tag** → ✅ Erfolgreich erstellt
  - Required Parameters identifiziert: `pixelId`, `accessToken`, `actionSource`
  - Tag ID: 7
  - Type: `cvt_5TP8W` (Custom Template)
  - Trigger: GA4 Pageview Event (ID: 5)

### 3. Server Clients
- **GA4 Web Client** → ✅ Bereits vorhanden (auto-created)
- **GA4 Client** → ✅ Bereits vorhanden (auto-created)

### 4. Server Triggers
- **All Events (always)** → ✅ Erstellt (ID: 4)
- **GA4 Pageview Event (customEvent)** → ✅ Erstellt (ID: 5)

## ❌ Was NICHT funktioniert

### 1. Server Variables - Komplett blockiert
**Problem:** Alle Variable-Typen werden als "web-only" abgelehnt
```
Type "k" (Constant) → SERVER_TYPE_BLOCKED
Type "jsm" (JavaScript) → SERVER_TYPE_BLOCKED  
Type "f" (Data Layer) → SERVER_TYPE_BLOCKED
Type "c" (Cookie) → SERVER_TYPE_BLOCKED
```

**Registry Issue:** `stape-io/data-variable` ist WEB-only, nicht SERVER-kompatibel

**Auswirkung:** Keine Konstanten für IDs/Secrets möglich

**Status:** CRITICAL - Server Variables komplett nicht funktional

### 2. Transformation - API Timeout
**Problem:** Jeder Versuch eine Transformation zu erstellen resultiert in Timeout
```
gtm_gtm_create_transformation → Request timed out
```

**Auswirkung:** Kein Mapping von `unique_event_id` → `transaction_id` möglich

**Status:** CRITICAL - Transformation API instabil

### 3. Standard Server Tags - Nicht erkannt
**Problem:** Built-in Server Tag Types werden nicht erkannt
```
Type "gaawe" (GA4 Event) → "Unknown entity type"
Type "awct" (Google Ads Conversion) → Server nicht verfügbar
```

**Auswirkung:** Nur Custom Templates funktionieren

**Status:** MAJOR - Standard Tags fehlen

### 4. Google Ads Client - Nicht verfügbar
**Problem:** `adwords_client` wird nicht erkannt
```
Type "adwords_client" → "Unknown entity type"
Type "measurement_client" → "Unknown entity type"
```

**Auswirkung:** Google Ads Events können nicht serverseitig empfangen werden

**Status:** MAJOR

### 5. GA4 Advanced Template - Nicht getestet
**Problem:** `stape-io/ga4-advanced-tag` noch nicht importiert
- Könnte Alternative zu built-in GA4 Event sein
- Muss noch getestet werden

**Status:** PENDING

## 🔍 Root Causes

### 1. Variable Type System nicht dokumentiert
- Keine Doku welche Variable-Typen im Server Container verfügbar sind
- API capabilities zeigen "k, jsm, f, c" als supported, aber API blockiert sie
- Vermutlich: Server nutzt Event Properties statt Variables

### 2. Transformation API Instabil
- Jeder Request timed out (nach 2 Minuten)
- Möglicherweise fehlende Template-Types
- Keine Doku über verfügbare Transformation Types

### 3. Template Registry incomplete
- `entityKind` wird nicht korrekt gesetzt (bleibt "unknown")
- Container Context teilweise falsch (data-variable ist WEB, nicht SERVER)
- Keine Parameter-Extraktion aus Template-Code

## 📊 Test Coverage

| Feature | Status | Notes |
|---------|--------|-------|
| Template Import | ✅ 50% | Facebook OK, andere nicht getestet |
| Tag Creation (Custom) | ✅ 100% | Facebook CAPI funktioniert |
| Tag Creation (Built-in) | ❌ 0% | Keine built-in Types erkannt |
| Variables | ❌ 0% | Alle Typen blockiert |
| Clients | ✅ 100% | GA4 auto-created |
| Triggers | ✅ 100% | always + customEvent OK |
| Transformations | ❌ 0% | API Timeout |
| Template Registry | ⚠️ 30% | entityKind fehlerhaft |

## 🎯 Priorisierte Lösungen

### P0 - Critical (Sofort)
1. **Server Variable Types dokumentieren**
   - Research: Wie funktionieren Server Container Konstanten?
   - Test: Event Properties statt Variables?
   
2. **Transformation API fixen**
   - Research: Welche Transformation Types gibt es?
   - Test: Stape.io event-enricher-tag als Alternative?

### P1 - Major (Diese Woche)
3. **Built-in Server Tags aktivieren**
   - Test: ga4-advanced-tag importieren
   - Test: Google Ads Templates von stape.io
   
4. **Template Registry verbessern**
   - Fix: entityKind korrekt setzen
   - Fix: Parameter aus Template-Code extrahieren

### P2 - Medium (Nächste Woche)
5. **Google Ads Client testen**
   - Alternative: Custom Client Template?
   
6. **Dokumentation erstellen**
   - Server Variable Best Practices
   - Template Parameter Reference

## 📝 Nächste Schritte

1. Research Agent starten für:
   - Server Variable Types & Best Practices
   - Transformation Templates & Workarounds
   - stape.io GA4 & Google Ads Templates

2. Lösungen implementieren:
   - Variable-Workaround (Event Properties)
   - Transformation Alternative (event-enricher-tag)
   - Template Registry verbessern

3. Erneut testen:
   - Vollständiger Server Container Setup
   - Hybrid Tracking (Web + Server)
   - Deduplizierung validieren
