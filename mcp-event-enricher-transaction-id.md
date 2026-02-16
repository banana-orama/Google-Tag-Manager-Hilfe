# Event Enricher Tag - Server-Side Transformation Alternative

**Status:** ✅ **ERSTELLT UND BEREIT**  
**Date:** 2026-02-13

---

## 🎯 Zweck

Anstatt einer GTM Transformation (die durch API Timeouts unzuverlässig ist), verwenden wir den **Event Enricher Tag** von stape.io, um `event_id` → `transaction_id` zu mappen.

---

## 📦 Was wurde erstellt

### Tag: Add transaction_id for Google Ads

**Template:** stape-io/event-enricher-tag (cvt_PHRV8)  
**Tag ID:** 12  
**Trigger:** GA4 Pageview Event (ID: 5)

**Parameter:**
```json
{
  "newEventName": "page_view",
  "copyCurrentEventData": true,
  "additionalEventDataParameters": [
    {
      "name": "transaction_id",
      "value": "{{Event Data - event_id}}"
    }
  ]
}
```

---

## ⚙️ Funktionsweise

### Schritt 1: Event Empfang
- GA4 Web Client empfängt Event von Web Container
- Event enthält: `event_id`, `event_name`, `page_location`, etc.

### Schritt 2: Event Enricher Tag feuert
- **Trigger:** Bei `page_view` Events
- **Aktion:**
  1. Kopiert alle Event Data
  2. Fügt `transaction_id` = `{{Event Data - event_id}}` hinzu
  3. Lässt Container mit angereicherten Daten erneut laufen

### Schritt 3: Google Ads Tags nutzen transaction_id
- Tags feuern auf dem angereicherten Event
- Haben Zugriff auf `transaction_id` Parameter
- Nutzen diesen für Deduplizierung

---

## 🔄 Event Flow

```
Web Container
    ↓ (event_id: 1234567890-abc)
GA4 Client (Server)
    ↓
Event Data:
  - event_id: 1234567890-abc
  - event_name: page_view
    ↓
Event Enricher Tag feuert
    ↓
Event Data (angereichert):
  - event_id: 1234567890-abc
  - transaction_id: 1234567890-abc ← NEU!
  - event_name: page_view
    ↓
Google Ads Tags feuern
    ↓
Nutzen transaction_id für Deduplizierung
```

---

## ⚠️ WICHTIG: Konfiguration für Google Ads Tags

Wenn Google Ads Server Tags erstellt werden, müssen sie:

1. **Trigger verwenden, der NACH dem Event Enricher feuert**
   - Option A: Neuen Trigger für `page_view` mit `transaction_id` existiert
   - Option B: Gleicher Trigger, aber Reihenfolge beachten

2. **transaction_id Parameter nutzen:**
   ```json
   {
     "key": "transaction_id",
     "type": "template",
     "value": "{{Event Data - transaction_id}}"
   }
   ```

---

## 🎛️ Alternative: Direkter Zugriff

Falls Google Ads Tags bereits auf `event_id` zugreifen können, kann auch direkt referenziert werden:

```json
{
  "key": "transaction_id",
  "type": "template", 
  "value": "{{Event Data - event_id}}"
}
```

Der Event Enricher ist dann **optional**.

---

## ✅ Vorteile des Event Enricher Tags

1. **Explizites Mapping:** `event_id` → `transaction_id` ist klar dokumentiert
2. **Zentralisiert:** Alle Tags profitieren vom Mapping
3. **Flexibel:** Kann weitere Parameter hinzufügen
4. **Keine Transformation:** Umgeht API Timeout Probleme

---

## 📋 To-Do für Google Ads Server Tags

Wenn Google Ads Server Tags erstellt werden:

- [ ] Google Ads Server Tag erstellen (stape-io/google-conversion-events-tag)
- [ ] Trigger: page_view mit transaction_id vorhanden
- [ ] Parameter: `transaction_id` = `{{Event Data - transaction_id}}`
- [ ] Testen: Event Flow prüfen
- [ ] Deduplizierung validieren

---

## 🔍 Testing

### Test 1: Event Enricher feuert
1. Server Container Preview Mode öffnen
2. Page View auslösen
3. Prüfen: Tag "Add transaction_id for Google Ads" feuert
4. Event Data prüfen: `transaction_id` vorhanden?

### Test 2: Google Ads Tag (wenn erstellt)
1. Google Ads Tag feuert NACH Event Enricher
2. `transaction_id` in Tag Parameters sichtbar
3. Keine Fehler in Console

---

## 📚 Doku-Links

- **Template:** stape-io/event-enricher-tag
- **GitHub:** https://github.com/stape-io/event-enricher-tag
- **Helper:** `/src/utils/tag-helpers.ts` (für zukünftige Tags)

---

**Erstellt:** 2026-02-13  
**Tag ID:** 12  
**Status:** ✅ Bereit für Google Ads Server Tags
