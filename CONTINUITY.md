Goal (incl. success criteria):
- Fix gtm-optimizer so GTM container export no longer triggers import error: folder name cannot start with "_".
- Keep client/optimized download filename equal to original uploaded filename (not GTM-XXXXX.json).
- Show uploaded filename in overview while keeping GTM public ID visible.
- Provide full-package GTM audit+cleanup workflow with time-saving tool features.
- Update SSG tab: remove readiness score, add vendor selection, support Stape templates for Facebook/LinkedIn/Microsoft, and dedupe server tags.
- Ensure 1:1 mapping: GA4 base tag only for GA4, other selected client tags map 1:1 to server tags.

Constraints/Assumptions:
- Follow AGENTS.md instructions; maintain this ledger.
- Workspace: /Users/tobias_batke/Documents/Google Tag Manager Hilfe.
- User sells full-package audit+cleanup (no upsells).
- Stape templates must be used for Facebook/LinkedIn/Microsoft.

Key decisions:
- Rename settings folder from "_Einstellungen" to "Einstellungen" in SSG generator.
- Store original upload filename and reuse it for client-container and optimized export downloads.
- Add filename display in results header alongside GTM public ID.
- Implement audit report export (HTML) + change-log export (JSON) + auto-cleanup change log (unused + dedup).
- Server-side download should use a suffix (not original name only).
- Disable noisy GTM rules (naming, folder usage, sequencing/complexity, preview/environment, GA4 event params, GA delegation, tag timing).
- Add SSG vendor selection and filter server-side generation by selected vendors.
- Add Stape templates (Facebook, LinkedIn, Microsoft Ads) embedded as base64 and include customTemplate in SSG export.
- Adjust SSG mapping to keep 1:1 tags (no dedupe) and only create GA4 base tag when GA4 tags are selected.

State:
- SSG generator updated for 1:1 mapping logic; awaiting user test.

Done:
- Created initial CONTINUITY.md ledger.
- Updated SSG folder name and lookup to remove leading underscore.
- Added original filename tracking and reuse for client download.
- Updated optimized export to reuse original filename.
- Added filename display in results header.
- Added audit report export and change-log export + downloadText helper.
- Updated server-side download filename to use base name + suffix.
- Disabled selected rules in rules engine.
- Added vendor detection in SSG prep, vendor selection UI, and selection-aware SSG export.
- Embedded Stape templates and added customTemplate generation and vendor tag support.
- Adjusted GA4 base tag creation condition and GA4 client creation for selected vendors.

Now:
- User to test SSG vendor selection and 1:1 server tag mapping.

Next:
- Adjust mapping behavior if user reports mismatches.

Open questions (UNCONFIRMED if needed):
- Are there other GTM import restrictions triggering errors?
- Should folder auto-structure be added?

Working set (files/ids/commands):
- CONTINUITY.md
- gtm-optimizer/js/ssg-prep.js
- gtm-optimizer/js/ssg-generator.js
- gtm-optimizer/js/ssg-templates.js
- gtm-optimizer/js/optimizer.js
- gtm-optimizer/js/ui.js
- gtm-optimizer/index.html
- gtm-optimizer/css/style.css
- gtm-optimizer/js/rules.js
