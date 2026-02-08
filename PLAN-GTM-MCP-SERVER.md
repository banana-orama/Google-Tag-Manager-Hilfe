# Plan: GTM API MCP Server

## Übersicht

Ein MCP (Model Context Protocol) Server, der die Google Tag Manager API v2 kapselt und Claude direkten Zugriff auf GTM-Container ermöglicht.

## Vorteile gegenüber manuellem JSON-Export/Import

| Aktuell (manuell) | Mit MCP Server |
|---|---|
| JSON exportieren → Tool → JSON importieren | Direkte Änderungen im Container |
| Keine Live-Validierung | Sofortige Fehlerrückmeldung von GTM |
| Versionierung manuell | Automatische Versionierung |
| Kein Rollback möglich | Versionen vergleichen/wiederherstellen |
| Keine Duplikat-Prüfung | Live-Abgleich mit bestehendem Container |

---

## 1. Technische Architektur

### Stack
- **Runtime**: Node.js (TypeScript)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Google API**: `googleapis` npm package (enthält tagmanager v2)
- **Auth**: OAuth2 mit Refresh Token (einmalige Autorisierung, dann persistent)

### Dateienstruktur
```
gtm-mcp-server/
├── src/
│   ├── index.ts           # MCP Server Entry Point
│   ├── auth/
│   │   ├── oauth.ts       # OAuth2 Flow
│   │   └── token-store.ts # Token-Persistierung
│   ├── tools/
│   │   ├── accounts.ts    # Account-Tools
│   │   ├── containers.ts  # Container-Tools
│   │   ├── workspaces.ts  # Workspace-Tools
│   │   ├── tags.ts        # Tag-Tools
│   │   ├── triggers.ts    # Trigger-Tools
│   │   ├── variables.ts   # Variable-Tools
│   │   ├── versions.ts    # Version-Tools
│   │   └── bulk.ts        # Bulk-Operationen
│   └── utils/
│       ├── rate-limiter.ts # 0.25 QPS Limiter
│       └── error-handler.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## 2. Authentifizierung

### Setup (einmalig)
1. Google Cloud Project erstellen
2. Tag Manager API aktivieren
3. OAuth2 Client ID erstellen (Desktop App)
4. `client_secrets.json` herunterladen
5. Einmalig autorisieren → Refresh Token speichern

### Scopes (benötigt)
```
https://www.googleapis.com/auth/tagmanager.edit.containers
https://www.googleapis.com/auth/tagmanager.manage.accounts
https://www.googleapis.com/auth/tagmanager.publish
https://www.googleapis.com/auth/tagmanager.readonly
```

---

## 3. MCP Tools (Funktionen)

### Tier 1: Lesen (readonly, sicher)

| Tool | Beschreibung | Parameter |
|------|--------------|-----------|
| `gtm_list_accounts` | Alle zugänglichen GTM-Accounts | - |
| `gtm_list_containers` | Container eines Accounts | `accountId` |
| `gtm_get_container` | Container-Details | `containerId` |
| `gtm_list_workspaces` | Workspaces eines Containers | `containerId` |
| `gtm_list_tags` | Alle Tags im Workspace | `workspacePath` |
| `gtm_list_triggers` | Alle Trigger | `workspacePath` |
| `gtm_list_variables` | Alle Variablen | `workspacePath` |
| `gtm_list_folders` | Alle Ordner | `workspacePath` |
| `gtm_get_version` | Container-Version abrufen | `versionPath` |
| `gtm_list_versions` | Alle Versionen | `containerId` |
| `gtm_get_live_version` | Aktuell publizierte Version | `containerId` |
| `gtm_export_container` | Kompletter Export als JSON | `versionPath` |

### Tier 2: Schreiben (mit Bestätigung)

| Tool | Beschreibung | Parameter |
|------|--------------|-----------|
| `gtm_create_workspace` | Neuen Workspace erstellen | `containerId`, `name` |
| `gtm_create_tag` | Tag erstellen | `workspacePath`, `tagConfig` |
| `gtm_update_tag` | Tag aktualisieren | `tagPath`, `tagConfig` |
| `gtm_delete_tag` | Tag löschen | `tagPath` |
| `gtm_create_trigger` | Trigger erstellen | `workspacePath`, `triggerConfig` |
| `gtm_update_trigger` | Trigger aktualisieren | `triggerPath`, `triggerConfig` |
| `gtm_delete_trigger` | Trigger löschen | `triggerPath` |
| `gtm_create_variable` | Variable erstellen | `workspacePath`, `variableConfig` |
| `gtm_update_variable` | Variable aktualisieren | `variablePath`, `variableConfig` |
| `gtm_delete_variable` | Variable löschen | `variablePath` |
| `gtm_create_folder` | Ordner erstellen | `workspacePath`, `name` |
| `gtm_move_to_folder` | Entities in Ordner verschieben | `folderPath`, `entityIds` |

### Tier 3: Versionierung & Publish

| Tool | Beschreibung | Parameter |
|------|--------------|-----------|
| `gtm_create_version` | Version aus Workspace erstellen | `workspacePath`, `name`, `notes` |
| `gtm_publish_version` | Version publizieren | `versionPath` |
| `gtm_compare_versions` | Zwei Versionen vergleichen | `versionPath1`, `versionPath2` |

### Tier 4: Bulk-Operationen (für Optimizer)

| Tool | Beschreibung | Parameter |
|------|--------------|-----------|
| `gtm_bulk_create` | Mehrere Entities auf einmal | `workspacePath`, `entities[]` |
| `gtm_bulk_delete` | Mehrere Entities löschen | `entityPaths[]` |
| `gtm_import_container` | Container aus JSON importieren | `workspacePath`, `containerJson` |
| `gtm_sync_workspace` | Workspace mit Version synchronisieren | `workspacePath` |

---

## 4. Rate Limiting

### GTM API Limits
- **10.000 Requests/Tag** pro Projekt
- **0.25 QPS** (= 1 Request alle 4 Sekunden, oder 25 pro 100 Sekunden)

### Implementierung
```typescript
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private lastRequest = 0;
  private readonly minInterval = 4000; // 4 Sekunden

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const wait = Math.max(0, this.lastRequest + this.minInterval - now);
    await sleep(wait);
    this.lastRequest = Date.now();
    return fn();
  }
}
```

---

## 5. Sicherheit

### Schutzmechanismen
1. **Alle schreibenden Operationen** erfordern explizite Bestätigung
2. **Destructive Ops** (delete, publish) haben doppelte Bestätigung
3. **Dry-Run Modus** für alle Bulk-Operationen
4. **Backup vor Änderungen**: Automatischer Export vor Bulk-Änderungen
5. **Rate Limit Protection**: Automatische Drosselung

### Bestätigungsflow
```
User: "Lösche alle ungenutzten Tags"
Claude: [analysiert] → "Gefunden: 5 ungenutzte Tags. Soll ich löschen?"
User: "Ja"
Claude: [führt gtm_bulk_delete aus]
```

---

## 6. Implementierungsreihenfolge

### Phase 1: Grundgerüst (Tag 1)
- [ ] MCP Server Boilerplate
- [ ] OAuth2 Flow mit Token-Persistierung
- [ ] Rate Limiter
- [ ] `gtm_list_accounts`, `gtm_list_containers`

### Phase 2: Lese-Tools (Tag 2)
- [ ] Alle Tier 1 Tools (readonly)
- [ ] `gtm_export_container` (wichtig für Backup)

### Phase 3: Schreib-Tools (Tag 3)
- [ ] Workspace-Management
- [ ] CRUD für Tags, Triggers, Variables
- [ ] Bestätigungs-Flow

### Phase 4: Versionierung (Tag 4)
- [ ] Version erstellen/publizieren
- [ ] Version vergleichen
- [ ] Rollback-Funktion

### Phase 5: Bulk & Optimizer-Integration (Tag 5)
- [ ] Bulk-Operationen
- [ ] Import aus GTM Optimizer JSON
- [ ] Integration mit bestehendem Web-Tool

---

## 7. Beispiel-Workflows

### Container analysieren (nur lesen)
```
User: "Analysiere meinen GTM Container GTM-ABC123"
1. gtm_list_accounts → Account finden
2. gtm_list_containers → Container finden
3. gtm_get_live_version → Aktuelle Version
4. gtm_list_tags, gtm_list_triggers, gtm_list_variables
5. [Analyse durchführen]
```

### Ungenutzte Elemente entfernen
```
User: "Räume meinen Container auf"
1. [Analyse wie oben]
2. [Ungenutzte Elemente identifizieren]
3. "Gefunden: 3 Tags, 2 Trigger, 5 Variablen ungenutzt. Löschen?"
4. gtm_create_workspace → Sicherer Arbeitsbereich
5. gtm_bulk_delete → Elemente löschen
6. gtm_create_version → "Cleanup v1"
7. "Fertig. Soll ich die Version publizieren?"
```

### Server-Side Container erstellen
```
User: "Erstelle SSG-Container aus meinem Client-Container"
1. gtm_export_container → Client-Container JSON
2. [SSG-Container generieren wie im Optimizer]
3. gtm_create_container → Neuen SSG-Container
4. gtm_bulk_create → Alle Entities importieren
5. "SSG-Container erstellt. Platzhalter ausfüllen!"
```

---

## 8. Offene Fragen

1. **Wo OAuth Tokens speichern?**
   - Option A: `~/.gtm-mcp/tokens.json` (einfach)
   - Option B: macOS Keychain (sicherer)

2. **Multi-Account Support?**
   - Mehrere GTM-Accounts mit verschiedenen Credentials?

3. **Workspace-Strategie?**
   - Immer neuen Workspace für Änderungen erstellen?
   - Oder bestehenden "Default" nutzen?

4. **Publish-Policy?**
   - Automatisch publizieren nach Änderungen?
   - Oder immer manuell bestätigen?

---

## Quellen

- [GTM API Overview](https://developers.google.com/tag-platform/tag-manager/api/v2)
- [REST API Reference](https://developers.google.com/tag-platform/tag-manager/api/reference/rest)
- [Developer's Guide](https://developers.google.com/tag-platform/tag-manager/api/v2/devguide)
- [Limits & Quotas](https://developers.google.com/tag-platform/tag-manager/api/v2/limits-quotas)
