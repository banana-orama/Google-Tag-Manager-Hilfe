/**
 * GTM Container Optimizer - Best Practice Rules
 * Comprehensive rule set for GTM container analysis
 */

class GTMRulesEngine {
    constructor(parser) {
        this.parser = parser;
        this.issues = [];
        this.suggestions = [];
        this.disabledRules = new Set([
            'checkTagNaming',
            'checkTriggerNaming',
            'checkVariableNaming',
            'checkFolderUsage',
            'checkTagSequencing',
            'checkTriggerComplexity',
            'checkPreviewMode',
            'checkEnvironmentSettings',
            'checkGA4EventParameters',
            'checkGATrackingDelegation',
            'checkTagTiming'
        ]);
    }

    /**
     * Run all rules against the container
     * @returns {Object} Analysis results
     */
    analyze() {
        this.issues = [];
        this.suggestions = [];

        // Category 1: Unused Elements
        this.checkUnusedTags();
        this.checkUnusedTriggers();
        this.checkUnusedVariables();
        this.checkUnusedFolders();
        this.checkUnusedTemplates();

        // Category 2: Duplicates
        this.checkDuplicateTags();
        this.checkDuplicateTriggers();
        this.checkDuplicateVariables();

        // Category 3: Naming Conventions
        if (!this.disabledRules.has('checkTagNaming')) this.checkTagNaming();
        if (!this.disabledRules.has('checkTriggerNaming')) this.checkTriggerNaming();
        if (!this.disabledRules.has('checkVariableNaming')) this.checkVariableNaming();

        // Category 4: Structure & Organization
        if (!this.disabledRules.has('checkFolderUsage')) this.checkFolderUsage();
        if (!this.disabledRules.has('checkTagSequencing')) this.checkTagSequencing();
        if (!this.disabledRules.has('checkTriggerComplexity')) this.checkTriggerComplexity();

        // Category 5: Performance
        this.checkHeavyTags();
        this.checkTagFiringOrder();
        this.checkBlockingTriggers();
        this.checkVariableReferences();

        // Category 6: Privacy & Security
        this.checkPiiInVariables();
        this.checkDataLayerNames();
        this.checkCustomScripts();
        this.checkPermissionRules();

        // Category 7: Best Practices
        if (!this.disabledRules.has('checkPreviewMode')) this.checkPreviewMode();
        if (!this.disabledRules.has('checkEnvironmentSettings')) this.checkEnvironmentSettings();
        this.checkBuiltInVariablesUsage();
        this.checkHardcodedValues();
        this.checkMissingDescriptions();

        // Category 8: Google Analytics Specific
        this.checkGA4Configuration();
        this.checkGA4MeasurementId();
        if (!this.disabledRules.has('checkGA4EventParameters')) this.checkGA4EventParameters();
        if (!this.disabledRules.has('checkGATrackingDelegation')) this.checkGATrackingDelegation();

        // Category 9: Marketing Tags
        this.checkMarketingTagsPrivacy();
        this.checkConsentIntegration();
        if (!this.disabledRules.has('checkTagTiming')) this.checkTagTiming();

        // Category 10: Advanced Issues
        this.checkCircularDependencies();
        this.checkNestedReferences();
        this.checkDeprecatedFeatures();
        this.checkTemplateVersions();

        return {
            issues: this.issues,
            suggestions: this.suggestions,
            scores: this.calculateScores()
        };
    }

    // ==================== UNUSED ELEMENTS ====================

    checkUnusedTags() {
        const unusedTags = this.parser.getUnusedTags();
        for (const tag of unusedTags) {
            this.issues.push({
                id: generateUniqueId({ type: 'unused-tag', path: tag.path }),
                type: 'tag',
                severity: 'medium',
                category: 'cleanup',
                title: 'Ungenutzter Tag gefunden',
                description: `Der Tag "${tag.name}" wird von keinem Trigger ausgelöst und muss nicht im Container verbleiben.`,
                location: tag.path,
                entity: tag,
                action: 'delete',
                fixable: true
            });
        }
    }

    checkUnusedTriggers() {
        const unusedTriggers = this.parser.getUnusedTriggers();
        for (const trigger of unusedTriggers) {
            // Skip special triggers like "Once", "All Elements", etc.
            if (trigger.triggerId === '2147479553' || trigger.builtIn) {
                continue;
            }
            this.issues.push({
                id: generateUniqueId({ type: 'unused-trigger', path: trigger.path }),
                type: 'trigger',
                severity: 'low',
                category: 'cleanup',
                title: 'Ungenutzter Trigger gefunden',
                description: `Der Trigger "${trigger.name}" wird von keinem Tag referenziert.`,
                location: trigger.path,
                entity: trigger,
                action: 'delete',
                fixable: true
            });
        }
    }

    checkUnusedVariables() {
        const unusedVars = this.parser.getUnusedVariables();
        for (const variable of unusedVars) {
            // Skip built-in variables
            if (variable.type?.startsWith('k')) continue;

            this.issues.push({
                id: generateUniqueId({ type: 'unused-variable', path: variable.path }),
                type: 'variable',
                severity: 'low',
                category: 'cleanup',
                title: 'Ungenutzte Variable gefunden',
                description: `Die Variable "${variable.name}" wird nirgendwo im Container verwendet.`,
                location: variable.path,
                entity: variable,
                action: 'delete',
                fixable: true
            });
        }
    }

    checkUnusedFolders() {
        const tags = this.parser.getTags();
        const triggers = this.parser.getTriggers();
        const variables = this.parser.getVariables();
        const folders = this.parser.getFolders();

        // Build set of used folder IDs
        const usedFolderIds = new Set();

        for (const tag of tags) {
            if (tag.parentFolderId) usedFolderIds.add(tag.parentFolderId);
        }
        for (const trigger of triggers) {
            if (trigger.parentFolderId) usedFolderIds.add(trigger.parentFolderId);
        }
        for (const variable of variables) {
            if (variable.parentFolderId) usedFolderIds.add(variable.parentFolderId);
        }

        for (const folder of folders) {
            if (!usedFolderIds.has(folder.folderId)) {
                this.issues.push({
                    id: generateUniqueId({ type: 'unused-folder', path: folder.path }),
                    type: 'folder',
                    severity: 'low',
                    category: 'cleanup',
                    title: 'Leerer Ordner gefunden',
                    description: `Der Ordner "${folder.name}" enthält keine Elemente.`,
                    location: folder.path,
                    entity: folder,
                    action: 'delete',
                    fixable: true
                });
            }
        }
    }

    checkUnusedTemplates() {
        const templates = this.parser.getTemplates();
        const usedTemplateIds = new Set();

        // Check which templates are used by tags
        const tags = this.parser.getTags();
        for (const tag of tags) {
            if (tag.templateId) {
                usedTemplateIds.add(tag.templateId);
            }
        }

        for (const template of templates) {
            if (!usedTemplateIds.has(template.templateId)) {
                this.issues.push({
                    id: generateUniqueId({ type: 'unused-template', id: template.templateId }),
                    type: 'template',
                    severity: 'low',
                    category: 'cleanup',
                    title: 'Ungenutzte Vorlage gefunden',
                    description: `Die Vorlage "${template.name}" wird von keinem Tag verwendet.`,
                    location: `template:${template.templateId}`,
                    entity: template,
                    action: 'delete',
                    fixable: true
                });
            }
        }
    }

    // ==================== DUPLICATES ====================

    checkDuplicateTags() {
        const duplicates = this.parser.findDuplicates().tags;
        for (const { signature, items } of duplicates) {
            const keep = items[0];
            const remove = items.slice(1);

            this.issues.push({
                id: generateUniqueId({ type: 'duplicate-tags', signature }),
                type: 'tag',
                severity: 'medium',
                category: 'duplication',
                title: `${items.length} identische Tags gefunden`,
                description: `Es gibt ${items.length} Tags mit identischer Konfiguration. Ein Tag kann entfernt werden.`,
                location: keep.path,
                entity: keep,
                duplicates: remove,
                action: 'deduplicate',
                fixable: true
            });
        }
    }

    checkDuplicateTriggers() {
        const duplicates = this.parser.findDuplicates().triggers;
        for (const { signature, items } of duplicates) {
            this.issues.push({
                id: generateUniqueId({ type: 'duplicate-triggers', signature }),
                type: 'trigger',
                severity: 'high',
                category: 'duplication',
                title: `${items.length} identische Trigger gefunden`,
                description: `Es gibt ${items.length} Trigger mit identischer Konfiguration. Diese können zusammengeführt werden.`,
                location: items[0].path,
                entity: items[0],
                duplicates: items.slice(1),
                action: 'deduplicate',
                fixable: true
            });
        }
    }

    checkDuplicateVariables() {
        const duplicates = this.parser.findDuplicates().variables;
        for (const { signature, items } of duplicates) {
            this.issues.push({
                id: generateUniqueId({ type: 'duplicate-variables', signature }),
                type: 'variable',
                severity: 'medium',
                category: 'duplication',
                title: `${items.length} identische Variablen gefunden`,
                description: `Es gibt ${items.length} Variablen mit identischer Konfiguration. Diese können zusammengeführt werden.`,
                location: items[0].path,
                entity: items[0],
                duplicates: items.slice(1),
                action: 'deduplicate',
                fixable: true
            });
        }
    }

    // ==================== NAMING CONVENTIONS ====================

    checkTagNaming() {
        const tags = this.parser.getTags();
        const namingIssues = [];

        // Check for prefixes
        const prefixPattern = /^([A-Z]{2,})\s*-\s*/;
        const tagsWithoutPrefix = [];

        for (const tag of tags) {
            if (!prefixPattern.test(tag.name)) {
                tagsWithoutPrefix.push(tag);
            }
        }

        if (tagsWithoutPrefix.length > 5) {
            this.suggestions.push({
                id: 'tag-naming-prefix',
                type: 'structure',
                category: 'maintainability',
                impact: 'medium',
                title: 'Tag-Namenskonvention verbessern',
                description: 'Viele Tags verwenden keine konsistente Prefix-Konvention (z.B. "GA - Pageview").',
                recommendation: 'Führe Prefixe für Tag-Typen ein (GA, FB, ADS, etc.) für bessere Übersicht.',
                steps: [
                    'Definiere eine Namenskonvention mit Prefixen für verschiedene Tag-Typen',
                    'Benenne existierende Tags entsprechend um',
                    'Dokumentiere die Konvention im Team'
                ]
            });
        }

        // Check for special characters
        for (const tag of tags) {
            if (/[^\w\s\-ÄÖÜäöüß()]/.test(tag.name)) {
                namingIssues.push(tag);
            }
        }

        if (namingIssues.length > 0) {
            this.suggestions.push({
                id: 'tag-naming-chars',
                type: 'structure',
                category: 'maintainability',
                impact: 'low',
                title: 'Tags mit Sonderzeichen umbenennen',
                description: `${namingIssues.length} Tags enthalten Sonderzeichen, die Probleme verursachen können.`,
                entities: namingIssues,
                recommendation: 'Verwende nur alphanumerische Zeichen, Bindestriche und Unterstriche.',
                steps: [
                    'Identifiziere Tags mit Sonderzeichen',
                    'Benenne diese unter Verwendung einfacher Zeichen um'
                ]
            });
        }
    }

    checkTriggerNaming() {
        const triggers = this.parser.getTriggers();
        const inconsistent = [];

        // Check for consistent trigger type naming
        for (const trigger of triggers) {
            const type = trigger.type;
            const name = trigger.name.toLowerCase();

            // Check if name reflects trigger type
            if (type === 'PAGE_VIEW' && !name.includes('page') && !name.includes('seite') && !name.includes('all pages')) {
                inconsistent.push(trigger);
            }
        }

        if (inconsistent.length > 5) {
            this.suggestions.push({
                id: 'trigger-naming',
                type: 'structure',
                category: 'maintainability',
                impact: 'low',
                title: 'Trigger-Namenskonvention verbessern',
                description: 'Viele Trigger-Namen spiegeln nicht den Trigger-Typ wider.',
                recommendation: 'Trigger-Namen sollten ihren Typ deutlich machen (z.B. "Pageview - Checkout").'
            });
        }
    }

    checkVariableNaming() {
        const variables = this.parser.getVariables();
        const badNames = [];

        for (const variable of variables) {
            // Skip built-in variables
            if (variable.type?.startsWith('k')) continue;

            // Check for camelCase or snake_case inconsistency
            const hasCamelCase = /[a-z][A-Z]/.test(variable.name);
            const hasSnakeCase = /_[a-z]/.test(variable.name);
            const hasSpaces = /\s/.test(variable.name);

            if (hasSpaces) {
                badNames.push(variable);
            }
        }

        if (badNames.length > 0) {
            this.suggestions.push({
                id: 'variable-naming',
                type: 'structure',
                category: 'maintainability',
                impact: 'medium',
                title: 'Variablen-Namenskonvention verbessern',
                description: `${badNames.length} Variablen enthalten Leerzeichen, was zu Problemen bei Referenzierungen führen kann.`,
                entities: badNames,
                recommendation: 'Verwende camelCase oder snake_case ohne Leerzeichen.',
                steps: [
                    'Variablen mit Leerzeichen identifizieren',
                    'In camelCase oder snake_case umwandeln',
                    'Referenzen in Tags und Triggern aktualisieren'
                ]
            });
        }
    }

    // ==================== STRUCTURE & ORGANIZATION ====================

    checkFolderUsage() {
        const tags = this.parser.getTags();
        const triggers = this.parser.getTriggers();
        const variables = this.parser.getVariables();

        const unorganizedItems = [];

        for (const tag of tags) {
            if (!tag.parentFolderId) unorganizedItems.push(tag);
        }
        for (const trigger of triggers) {
            if (!trigger.parentFolderId) unorganizedItems.push(trigger);
        }
        for (const variable of variables) {
            if (!variable.parentFolderId) unorganizedItems.push(variable);
        }

        const totalItems = tags.length + triggers.length + variables.length;
        const unorganizedPercent = (unorganizedItems.length / totalItems) * 100;

        if (unorganizedPercent > 50 && unorganizedItems.length > 10) {
            this.suggestions.push({
                id: 'folder-organization',
                type: 'structure',
                category: 'maintainability',
                impact: 'medium',
                title: 'Container-Struktur mit Ordnern verbessern',
                description: `${Math.round(unorganizedPercent)}% der Elemente sind nicht in Ordnern organisiert.`,
                recommendation: 'Erstelle Ordner für verschiedene Kategorien (Marketing, Analytics, etc.).',
                steps: [
                    'Analysiere welche Elemente thematisch zusammengehören',
                    'Erstelle entsprechende Ordner',
                    'Verschiebe die Elemente in die passenden Ordner'
                ]
            });
        }
    }

    checkTagSequencing() {
        const tags = this.parser.getTags();
        const tagsWithPriority = tags.filter(t => t.priority);
        const tagsWithoutPriority = tags.filter(t => !t.priority && t.type !== 'html'); // HTML tags often don't need priority

        if (tagsWithPriority.length > 5 && tagsWithoutPriority.length > 10) {
            this.suggestions.push({
                id: 'tag-sequencing',
                type: 'structure',
                category: 'performance',
                impact: 'medium',
                title: 'Tag-Ausführungsreihenfolge optimieren',
                description: 'Mehrere Tags haben Prioritäten, viele andere nicht. Überprüfe die Ausführungsreihenfolge.',
                recommendation: 'Setze Prioritäten für kritische Tags, um die korrekte Ausführungsreihenfolge sicherzustellen.',
                steps: [
                    'Identifiziere Tags die in bestimmter Reihenfolge feuern müssen',
                    'Setze die Priority-Eigenschaft entsprechend (niedrigere Zahl = früher feuern)',
                    'Teste die Ausführungsreihenfolge im Preview-Modus'
                ]
            });
        }
    }

    checkTriggerComplexity() {
        const triggers = this.parser.getTriggers();
        const complexTriggers = [];

        for (const trigger of triggers) {
            // Check for excessive conditions
            const conditionCount = (trigger.filter || []).length + (trigger.condition || []).length;

            // Check for complex custom event triggers
            if (trigger.type === 'CUSTOM_EVENT' && conditionCount > 5) {
                complexTriggers.push({ trigger, reason: `${conditionCount} Bedingungen` });
            }

            // Check for complex DOM triggers
            if (trigger.type === 'CLICK' || trigger.type === 'SUBMIT') {
                const hasComplexWaitFor = trigger.parameter?.find(p => p.key === 'waitForTokens');
                if (hasComplexWaitFor) {
                    complexTriggers.push({ trigger, reason: 'Komplexes WaitFor' });
                }
            }
        }

        if (complexTriggers.length > 0) {
            this.suggestions.push({
                id: 'trigger-complexity',
                type: 'structure',
                category: 'maintainability',
                impact: 'medium',
                title: 'Komplexe Trigger vereinfachen',
                description: `${complexTriggers.length} Trigger sind sehr komplex und sollten vereinfacht werden.`,
                entities: complexTriggers.map(t => t.trigger),
                recommendation: 'Komplexe Trigger sind schwer zu warten und fehleranfällig.',
                steps: [
                    'Überprüfe ob Bedingungen zusammengefasst werden können',
                    'Erstelle bei Bedarf Hilfsvariablen für komplexe Logik',
                    'Zerlege extrem komplexe Trigger in mehrere einfache'
                ]
            });
        }
    }

    // ==================== PERFORMANCE ====================

    checkHeavyTags() {
        const tags = this.parser.getTags();
        const heavyTagTypes = [
            'gcpm', // Google Tag Manager
            'google_tag_manager',
            'ua', // Universal Analytics (legacy)
            'ga', // Classic Analytics
            'awct', // Google Ads Remarketing
            'sp', // Spam (actually some third party tags)
            'html' // Custom HTML - potentially heavy
        ];

        const heavyTags = tags.filter(tag => {
            // Check for legacy Google Analytics
            if (tag.type === 'ua') return true;
            if (tag.type === 'ga') return true;

            // Check for custom HTML with document.write or synchronous scripts
            if (tag.type === 'html' && tag.parameter) {
                const htmlParam = tag.parameter.find(p => p.key === 'html');
                if (htmlParam && typeof htmlParam.value === 'string') {
                    if (htmlParam.value.includes('document.write') ||
                        htmlParam.value.includes('async=false') ||
                        htmlParam.value.includes('<script') &&
                        !htmlParam.value.includes('async')) {
                        return true;
                    }
                }
            }

            return false;
        });

        if (heavyTags.length > 0) {
            for (const tag of heavyTags) {
                const reason = tag.type === 'ua' ? 'Veraltetes Universal Analytics' :
                              tag.type === 'ga' ? 'Veraltetes Classic Analytics' :
                              'Potentiell performancelastig';

                this.issues.push({
                    id: generateUniqueId({ type: 'heavy-tag', path: tag.path }),
                    type: 'tag',
                    severity: tag.type === 'ua' || tag.type === 'ga' ? 'high' : 'medium',
                    category: 'performance',
                    title: 'Performancelastiger Tag gefunden',
                    description: `Der Tag "${tag.name}" ist ${reason}.`,
                    location: tag.path,
                    entity: tag,
                    action: 'review',
                    fixable: false
                });
            }
        }
    }

    checkTagFiringOrder() {
        const tags = this.parser.getTags();
        const allPagesTriggerId = '2147479553'; // "All Pages" trigger ID

        const allPagesTags = tags.filter(tag =>
            tag.firingTriggerId && tag.firingTriggerId.includes(allPagesTriggerId)
        );

        if (allPagesTags.length > 15) {
            this.suggestions.push({
                id: 'all-pages-tags',
                type: 'performance',
                category: 'performance',
                impact: 'high',
                title: 'Zu viele Tags feuern auf allen Seiten',
                description: `${allPagesTags.length} Tags werden auf jeder Seite ausgelöst. Das kann die Ladezeit erheblich beeinträchtigen.`,
                entities: allPagesTags,
                recommendation: 'Erwäge, Tags nur bei Bedarf auszulösen oder Server-Side GTM zu verwenden.',
                steps: [
                    'Überprüfe welche Tags wirklich auf jeder Seite notwendig sind',
                    'Erstelle spezifischere Trigger für Marketing-Tags',
                    'Consider Server-Side GTM für heavy tracking'
                ]
            });
        }
    }

    checkBlockingTriggers() {
        const tags = this.parser.getTags();
        const blockingTags = tags.filter(tag =>
            tag.blockingTriggerId && tag.blockingTriggerId.length > 0
        );

        if (blockingTags.length > 5) {
            this.suggestions.push({
                id: 'blocking-triggers',
                type: 'performance',
                category: 'performance',
                impact: 'high',
                title: 'Blockierende Trigger überprüfen',
                description: `${blockingTags.length} Tags verwenden blockierende Trigger, was die Performance beeinträchtigen kann.`,
                entities: blockingTags,
                recommendation: 'Blockierende Trigger sollten sparsam eingesetzt werden.',
                steps: [
                    'Überprüfe ob Blockierung wirklich notwendig ist',
                    'Erwäge Tag Sequencing als Alternative',
                    'Teste Performance mit/ohne Blockierung'
                ]
            });
        }
    }

    checkVariableReferences() {
        const variables = this.parser.getVariables();

        // Check for deeply nested variable references
        for (const variable of variables) {
            const refs = this.parser.variableVariableMap.get(variable.path) || new Set();
            if (refs.size > 5) {
                this.suggestions.push({
                    id: 'nested-variable-refs',
                    type: 'performance',
                    category: 'performance',
                    impact: 'low',
                    title: 'Variable mit vielen Referenzen',
                    description: `Die Variable "${variable.name}" referenziert ${refs.size} andere Variablen.`,
                    entity: variable,
                    recommendation: 'Viele Referenzen können die Verarbeitung verlangsamen. Prüfe ob dies nötig ist.'
                });
            }
        }
    }

    // ==================== PRIVACY & SECURITY ====================

    checkPiiInVariables() {
        const variables = this.parser.getVariables();
        const piiKeywords = [
            'email', 'mail', 'e-mail',
            'phone', 'telephone', 'mobile',
            'name', 'firstname', 'lastname', 'fullname',
            'address', 'street', 'zip', 'postal',
            'ssn', 'social', 'creditcard', 'card'
        ];

        const suspiciousVars = [];

        for (const variable of variables) {
            if (variable.type?.startsWith('k')) continue; // Skip built-in

            const nameLower = variable.name.toLowerCase();
            const hasPiiKeyword = piiKeywords.some(keyword => nameLower.includes(keyword));

            if (hasPiiKeyword) {
                // Check if it's actually capturing PII
                const capturesData = variable.type === 'jsm' || // Data Layer Variable
                                    variable.type === 'd'; // DOM Variable

                if (capturesData) {
                    suspiciousVars.push(variable);
                }
            }
        }

        if (suspiciousVars.length > 0) {
            this.issues.push({
                id: 'pii-variables',
                type: 'variable',
                severity: 'high',
                category: 'privacy',
                title: 'Mögliche PII-Variablen gefunden',
                description: `${suspiciousVars.length} Variablen enthalten möglicherweise persönlich identifizierbare Informationen (PII).`,
                entities: suspiciousVars,
                action: 'review',
                fixable: false,
                recommendation: 'Stelle sicher, dass PII-Daten vor dem Senden an Analytics- oder Marketing-Tools anonymisiert werden.'
            });
        }
    }

    checkDataLayerNames() {
        const tags = this.parser.getTags();
        const nonDefaultDataLayer = [];

        for (const tag of tags) {
            if (tag.parameter) {
                const dlParam = tag.parameter.find(p => p.key === 'dataLayerName');
                if (dlParam && dlParam.value !== 'dataLayer') {
                    nonDefaultDataLayer.push({
                        tag,
                        dataLayerName: dlParam.value
                    });
                }
            }
        }

        if (nonDefaultDataLayer.length > 0 && new Set(nonDefaultDataLayer.map(d => d.dataLayerName)).size > 1) {
            this.suggestions.push({
                id: 'datalayer-naming',
                type: 'structure',
                category: 'maintainability',
                impact: 'medium',
                title: 'Inkonsistente DataLayer-Namen',
                description: 'Es werden mehrere verschiedene DataLayer-Namen verwendet.',
                entities: nonDefaultDataLayer.map(d => d.tag),
                recommendation: 'Verwende konsistent einen DataLayer-Namen (standard: "dataLayer").'
            });
        }
    }

    checkCustomScripts() {
        const tags = this.parser.getTags();
        const customHtmlTags = tags.filter(tag => tag.type === 'html');

        const riskyTags = [];

        for (const tag of customHtmlTags) {
            const htmlParam = tag.parameter?.find(p => p.key === 'html');
            if (htmlParam && typeof htmlParam.value === 'string') {
                const html = htmlParam.value.toLowerCase();

                // Check for risky patterns
                const hasDocumentWrite = html.includes('document.write');
                const hasInnerHTML = html.includes('.innerhtml');
                const hasEval = html.includes('eval(');
                const hasInlineHandler = html.includes('onerror=') || html.includes('onload=');

                if (hasDocumentWrite || hasEval || hasInlineHandler) {
                    riskyTags.push({
                        tag,
                        reasons: []
                    });
                    if (hasDocumentWrite) riskyTags[riskyTags.length - 1].reasons.push('document.write');
                    if (hasEval) riskyTags[riskyTags.length - 1].reasons.push('eval()');
                    if (hasInlineHandler) riskyTags[riskyTags.length - 1].reasons.push('Inline Event Handler');
                }
            }
        }

        if (riskyTags.length > 0) {
            for (const risky of riskyTags) {
                this.issues.push({
                    id: generateUniqueId({ type: 'risky-script', path: risky.tag.path }),
                    type: 'tag',
                    severity: 'high',
                    category: 'security',
                    title: 'Riskantes Skript gefunden',
                    description: `Der Tag "${risky.tag.name}" verwendet ${risky.reasons.join(', ')}.`,
                    location: risky.tag.path,
                    entity: risky.tag,
                    action: 'review',
                    fixable: false
                });
            }
        }
    }

    checkPermissionRules() {
        const container = this.parser.getContainer();
        const version = container.containerVersion;

        if (version.securityGroups && version.securityGroups.length > 0) {
            // Check for overly permissive rules
            for (const group of version.securityGroups) {
                if (group.parameter) {
                    const enableAll = group.parameter.find(p => p.key === 'enableAll');
                    if (enableAll && enableAll.value === 'true') {
                        this.suggestions.push({
                            id: 'permissive-rules',
                            type: 'security',
                            category: 'security',
                            impact: 'high',
                            title: 'Zu permissive Berechtigungsregeln',
                            description: 'Einige Berechtigungsregeln erlauben alle Aktionen.',
                            recommendation: 'Beschränke Berechtigungen auf das notwendige Minimum (Principle of Least Privilege).'
                        });
                    }
                }
            }
        }
    }

    // ==================== BEST PRACTICES ====================

    checkPreviewMode() {
        const container = this.parser.getContainer();
        const version = container.containerVersion;

        // Check for preview/debug parameters
        const previewParam = version.container?.containerPreviewConfiguration;

        if (!previewParam || !previewParam.enablePreviewPane) {
            this.suggestions.push({
                id: 'preview-mode',
                type: 'best-practice',
                category: 'maintainability',
                impact: 'low',
                title: 'Preview-Mode konfigurieren',
                description: 'Der Preview-Mode ist nicht vollständig konfiguriert.',
                recommendation: 'Aktiviere und konfiguriere den Preview-Mode für einfachere Fehlersuche.'
            });
        }
    }

    checkEnvironmentSettings() {
        const container = this.parser.getContainer();
        const version = container.containerVersion;

        if (!version.environment || version.environment.length < 2) {
            this.suggestions.push({
                id: 'environments',
                type: 'best-practice',
                category: 'maintainability',
                impact: 'medium',
                title: 'Umgebungen einrichten',
                description: 'Es sind keine oder wenige Umgebungen konfiguriert.',
                recommendation: 'Richte Umgebungen für Development, Staging und Production ein.',
                steps: [
                    'Erstelle separate Umgebungen für Dev/Staging/Prod',
                    'Nutze die Environment API für serverspezifische Werte'
                ]
            });
        }
    }

    checkBuiltInVariablesUsage() {
        const container = this.parser.getContainer();
        const version = container.containerVersion;

        // Check if built-in variables are enabled
        const enabledBuiltInVars = version.container?.enabledBuiltInVariable || [];

        const essentialBuiltInVars = [
            'url', 'pageUrl', 'pageTitle', 'referrer', 'event'
        ];

        const missingEssential = essentialBuiltInVars.filter(v =>
            !enabledBuiltInVars.includes(v)
        );

        if (missingEssential.length > 0) {
            this.suggestions.push({
                id: 'builtin-vars',
                type: 'best-practice',
                category: 'maintainability',
                impact: 'low',
                title: 'Wichtige Built-in Variablen aktivieren',
                description: `Einige wichtige Built-in Variablen sind nicht aktiviert: ${missingEssential.join(', ')}.`,
                recommendation: 'Aktiviere diese Variablen für bessere Funktionalität.'
            });
        }
    }

    checkHardcodedValues() {
        const tags = this.parser.getTags();
        const hardcodedIssues = [];

        // Check for hardcoded IDs in common tags
        for (const tag of tags) {
            if (tag.parameter) {
                // Google Analytics Measurement ID
                const measurementId = tag.parameter.find(p => p.key === 'measurementId');
                if (measurementId && typeof measurementId.value === 'string' && !measurementId.value.includes('{{')) {
                    hardcodedIssues.push({
                        tag,
                        key: 'measurementId',
                        value: measurementId.value
                    });
                }

                // Google Ads Conversion ID
                const conversionId = tag.parameter.find(p => p.key === 'conversionId');
                if (conversionId && typeof conversionId.value === 'string' && !conversionId.value.includes('{{')) {
                    hardcodedIssues.push({
                        tag,
                        key: 'conversionId',
                        value: conversionId.value
                    });
                }
            }
        }

        if (hardcodedIssues.length > 5) {
            this.suggestions.push({
                id: 'hardcoded-values',
                type: 'best-practice',
                category: 'maintainability',
                impact: 'medium',
                title: 'Hardcodierte Werte in Variablen auslagern',
                description: `${hardcodedIssues.length} Tags verwenden hardcodierte IDs/Tracking-Nummern.`,
                recommendation: 'Erstelle Variablen für IDs und Tracking-Nummern für einfachere Updates.',
                steps: [
                    'Erstelle Variablen für alle hardcodierten Werte',
                    'Ersetze die hardcodierten Werte durch Variablen-Referenzen',
                    'Dokumentiere die Variablen'
                ]
            });
        }
    }

    checkMissingDescriptions() {
        const allEntities = [
            ...this.parser.getTags(),
            ...this.parser.getTriggers(),
            ...this.parser.getVariables().filter(v => !v.type?.startsWith('k'))
        ];

        const withoutNotes = allEntities.filter(e => !e.notes || e.notes.trim() === '');

        if (withoutNotes.length > allEntities.length * 0.7) {
            this.suggestions.push({
                id: 'descriptions',
                type: 'best-practice',
                category: 'maintainability',
                impact: 'low',
                title: 'Beschreibungen hinzufügen',
                description: `${Math.round((withoutNotes.length / allEntities.length) * 100)}% der Elemente haben keine Beschreibung.`,
                recommendation: 'Füge komplexe Elementen Beschreibungen hinzu für bessere Dokumentation.'
            });
        }
    }

    // ==================== GOOGLE ANALYTICS SPECIFIC ====================

    checkGA4Configuration() {
        const tags = this.parser.getTags();
        const ga4Tags = tags.filter(tag =>
            tag.type === 'gaawe' || // GA4 Event
            tag.type === 'gawc'     // GA4 Configuration
        );

        if (ga4Tags.length === 0) {
            this.suggestions.push({
                id: 'ga4-missing',
                type: 'best-practice',
                category: 'performance',
                impact: 'high',
                title: 'GA4 Configuration Tag fehlt',
                description: 'Es wurde kein GA4 Configuration Tag gefunden.',
                recommendation: 'Implementiere GA4 mit Configuration Tag für korrektes Tracking.'
            });
            return;
        }

        // Check for multiple GA4 config tags
        const configTags = ga4Tags.filter(tag => tag.type === 'gawc');
        if (configTags.length > 1) {
            this.issues.push({
                id: 'multiple-ga4-config',
                type: 'tag',
                severity: 'medium',
                category: 'best-practice',
                title: 'Mehrere GA4 Configuration Tags',
                description: `Es gibt ${configTags.length} GA4 Configuration Tags. Normalerweise ist einer ausreichend.`,
                entities: configTags,
                action: 'review',
                fixable: false
            });
        }

        // Check if GA4 config tag fires on all pages
        const allPagesTriggerId = '2147479553';
        const configNotOnAllPages = configTags.filter(tag =>
            !tag.firingTriggerId || !tag.firingTriggerId.includes(allPagesTriggerId)
        );

        if (configNotOnAllPages.length > 0 && configTags.length > 0) {
            this.issues.push({
                id: 'ga4-config-not-all-pages',
                type: 'tag',
                severity: 'high',
                category: 'best-practice',
                title: 'GA4 Config nicht auf allen Seiten',
                description: 'Der GA4 Configuration Tag sollte auf allen Seiten feuern.',
                entities: configNotOnAllPages,
                action: 'review',
                fixable: false
            });
        }
    }

    checkGA4MeasurementId() {
        const tags = this.parser.getTags();
        const ga4Tags = tags.filter(tag =>
            tag.type === 'gawc' || tag.type === 'gaawe'
        );

        const measurementIds = new Set();

        for (const tag of ga4Tags) {
            if (tag.parameter) {
                const measurementId = tag.parameter.find(p => p.key === 'measurementId');
                if (measurementId && measurementId.value) {
                    const id = typeof measurementId.value === 'string'
                        ? measurementId.value
                        : measurementId.value?.value || measurementId.value;

                    if (id && !id.includes('{{')) {
                        measurementIds.add(id);
                    }
                }
            }
        }

        if (measurementIds.size > 1) {
            this.issues.push({
                id: 'multiple-measurement-ids',
                type: 'tag',
                severity: 'medium',
                category: 'best-practice',
                title: 'Mehrere GA4 Measurement IDs',
                description: `Es werden ${measurementIds.size} verschiedene GA4 Measurement IDs verwendet: ${Array.from(measurementIds).join(', ')}`,
                action: 'review',
                fixable: false
            });
        }
    }

    checkGA4EventParameters() {
        const tags = this.parser.getTags();
        const ga4EventTags = tags.filter(tag => tag.type === 'gaawe');

        const tagsWithoutParams = ga4EventTags.filter(tag => {
            if (!tag.parameter) return true;
            const eventParams = tag.parameter.find(p => p.key === 'eventParameters');
            return !eventParams || !eventParams.list || eventParams.list.length === 0;
        });

        if (tagsWithoutParams.length > 5) {
            this.suggestions.push({
                id: 'ga4-event-params',
                type: 'best-practice',
                category: 'maintainability',
                impact: 'medium',
                title: 'GA4 Event-Parameter hinzufügen',
                description: `${tagsWithoutParams.length} GA4 Event Tags senden keine zusätzlichen Parameter.`,
                entities: tagsWithoutParams,
                recommendation: 'Füge relevante Parameter zu Events hinzu für bessere Analyse.',
                steps: [
                    'Überprüfe welche Events zusätzliche Informationen benötigen',
                    'Füge Event-Parameter für page_type, content_group, etc. hinzu',
                    'Dokumentiere die Parameter-Namenskonvention'
                ]
            });
        }
    }

    checkGATrackingDelegation() {
        const tags = this.parser.getTags();
        const hasGATags = tags.some(tag =>
            tag.type === 'ua' || // Universal Analytics
            tag.type === 'ga'     // Classic Analytics
        );

        if (hasGATags) {
            const uaTags = tags.filter(tag => tag.type === 'ua');
            this.issues.push({
                id: 'legacy-ga-tags',
                type: 'tag',
                severity: 'critical',
                category: 'performance',
                title: 'Veraltete Google Analytics Tags',
                description: `Universal Analytics ist ab Juli 2023 deprecated. ${uaTags.length} UA-Tags sollten entfernt werden.`,
                entities: uaTags,
                action: 'delete',
                fixable: true
            });
        }
    }

    // ==================== MARKETING TAGS ====================

    checkMarketingTagsPrivacy() {
        const tags = this.parser.getTags();
        const marketingTagTypes = [
            'awct', // Google Ads Conversion Tracking
            'adsct', // Google Ads Remarketing
            'flc',   // Floodlight Counter
            'fls',   // Floodlight Sales
            'ms',    // Microsoft Advertising
            'fbq',   // Facebook Pixel
            'lnq',   // LinkedIn Insight Tag
            'baut',  // Bing Ads Universal Event Tracking
        ];

        const marketingTags = tags.filter(tag =>
            marketingTagTypes.includes(tag.type) ||
            tag.name.toLowerCase().includes('facebook') ||
            tag.name.toLowerCase().includes('linkedin') ||
            tag.name.toLowerCase().includes('tiktok')
        );

        // Check if consent tags exist
        const consentTags = tags.filter(tag =>
            tag.type === 'cmp' || // Consent Management
            tag.name.toLowerCase().includes('consent') ||
            tag.name.toLowerCase().includes('cookiebot') ||
            tag.name.toLowerCase().includes('one-trust')
        );

        if (marketingTags.length > 0 && consentTags.length === 0) {
            this.issues.push({
                id: 'missing-consent',
                type: 'tag',
                severity: 'critical',
                category: 'privacy',
                title: 'Consent-Management fehlt',
                description: `Es sind ${marketingTags.length} Marketing-Tags vorhanden, aber kein Consent-Management.`,
                entities: marketingTags,
                action: 'review',
                fixable: false,
                recommendation: 'Implementiere ein Consent-Management-System (CMP) für DSGVO-Konformität.'
            });
        }
    }

    checkConsentIntegration() {
        const tags = this.parser.getTags();
        const consentTags = tags.filter(tag =>
            tag.type === 'cmp' ||
            tag.name.toLowerCase().includes('consent')
        );

        const tagsWithConsent = tags.filter(tag => {
            if (tag.parameter) {
                const consentParam = tag.parameter.find(p =>
                    p.key === 'consentStatus' ||
                    p.key === 'consentSettings'
                );
                return !!consentParam;
            }
            return false;
        });

        if (consentTags.length > 0) {
            const marketingWithoutConsent = tags.filter(tag =>
                !tagsWithConsent.includes(tag) &&
                (tag.type === 'awct' || tag.type === 'fbq' || tag.type === 'adsct')
            );

            if (marketingWithoutConsent.length > 0) {
                this.suggestions.push({
                    id: 'consent-integration',
                    type: 'privacy',
                    category: 'privacy',
                    impact: 'high',
                    title: 'Consent-Integration vervollständigen',
                    description: `${marketingWithoutConsent.length} Marketing-Tags fehlen Consent-Abhängigkeiten.`,
                    entities: marketingWithoutConsent,
                    recommendation: 'Verbinde alle Marketing-Tags mit dem Consent-Management für DSGVO-Konformität.',
                    steps: [
                        'Identifiziere alle Marketing-Tags',
                        'Füge Consent-Trigger als Blocking Trigger hinzu',
                        'Teste die Consent-Integration'
                    ]
                });
            }
        }
    }

    checkTagTiming() {
        const tags = this.parser.getTags();
        const earlyTags = tags.filter(tag => {
            if (tag.parameter) {
                const early = tag.parameter.find(p => p.key === 'earlyEventParams');
                return !!early;
            }
            return false;
        });

        if (earlyTags.length > 5) {
            this.suggestions.push({
                id: 'early-tag-timing',
                type: 'performance',
                category: 'performance',
                impact: 'medium',
                title: 'Early Tag Timing überprüfen',
                description: `${earlyTags.length} Tags verwenden Early Event Params.`,
                entities: earlyTags,
                recommendation: 'Early Event sollte sparsam verwendet werden, da es die Seite blockieren kann.'
            });
        }
    }

    // ==================== ADVANCED ISSUES ====================

    checkCircularDependencies() {
        // Check for circular variable references
        const variables = this.parser.getVariables();
        const visited = new Set();
        const recursionStack = new Set();
        const circular = [];

        const checkCircular = (variable, path = []) => {
            if (recursionStack.has(variable.path)) {
                circular.push({
                    type: 'circular-var-ref',
                    path: [...path, variable.name],
                    entity: variable
                });
                return;
            }
            if (visited.has(variable.path)) return;

            visited.add(variable.path);
            recursionStack.add(variable.path);

            const refs = this.parser.variableVariableMap.get(variable.path) || new Set();
            for (const refName of refs) {
                const refVar = this.parser.getVariableByName(refName);
                if (refVar) {
                    checkCircular(refVar, [...path, variable.name]);
                }
            }

            recursionStack.delete(variable.path);
        };

        for (const variable of variables) {
            if (!visited.has(variable.path)) {
                checkCircular(variable);
            }
        }

        if (circular.length > 0) {
            for (const circ of circular) {
                this.issues.push({
                    id: generateUniqueId({ type: 'circular-ref', path: circ.entity.path }),
                    type: 'variable',
                    severity: 'critical',
                    category: 'best-practice',
                    title: 'Zirkuläre Abhängigkeit gefunden',
                    description: `Zirkuläre Referenz: ${circ.path.join(' → ')}.`,
                    location: circ.entity.path,
                    entity: circ.entity,
                    action: 'fix',
                    fixable: false
                });
            }
        }
    }

    checkNestedReferences() {
        const variables = this.parser.getVariables();
        const deeplyNested = [];

        const getDepth = (variable, visited = new Set()) => {
            if (visited.has(variable.path)) return 0; // Prevent infinite loops
            visited.add(variable.path);

            const refs = this.parser.variableVariableMap.get(variable.path) || new Set();
            if (refs.size === 0) return 1;

            let maxDepth = 0;
            for (const refName of refs) {
                const refVar = this.parser.getVariableByName(refName);
                if (refVar) {
                    const depth = getDepth(refVar, new Set(visited));
                    maxDepth = Math.max(maxDepth, depth);
                }
            }
            return maxDepth + 1;
        };

        for (const variable of variables) {
            const depth = getDepth(variable);
            if (depth > 5) {
                deeplyNested.push({ variable, depth });
            }
        }

        if (deeplyNested.length > 0) {
            for (const { variable, depth } of deeplyNested) {
                this.issues.push({
                    id: generateUniqueId({ type: 'deep-nesting', path: variable.path }),
                    type: 'variable',
                    severity: 'medium',
                    category: 'best-practice',
                    title: 'Tief verschachtelte Variable',
                    description: `Die Variable "${variable.name}" hat eine Verschachtelungstiefe von ${depth}.`,
                    location: variable.path,
                    entity: variable,
                    action: 'review',
                    fixable: false
                });
            }
        }
    }

    checkDeprecatedFeatures() {
        const tags = this.parser.getTags();

        const deprecatedTypes = {
            'ua': 'Universal Analytics (eingestellt seit Juli 2023)',
            'ga': 'Classic Analytics (eingestellt)',
            'utm': 'Legacy UTM Tag (veraltet)',
            'tc': 'Legacy Conversion Linker (veraltet)',
        };

        for (const tag of tags) {
            if (deprecatedTypes[tag.type]) {
                this.issues.push({
                    id: generateUniqueId({ type: 'deprecated', path: tag.path }),
                    type: 'tag',
                    severity: 'high',
                    category: 'best-practice',
                    title: 'Veralteter Tag-Typ',
                    description: `${deprecatedTypes[tag.type]}: "${tag.name}"`,
                    location: tag.path,
                    entity: tag,
                    action: 'migrate',
                    fixable: false
                });
            }
        }
    }

    checkTemplateVersions() {
        const templates = this.parser.getTemplates();
        const outdated = [];

        for (const template of templates) {
            if (template.templateId && template.templateId.startsWith('custom')) {
                // Custom template - check if it has version info
                // No way to check actual version without API
            }
        }

        // Check for tags using old template versions
        const tags = this.parser.getTags();
        for (const tag of tags) {
            if (tag.templateId && tag.templateId.startsWith('custom')) {
                // Tag uses custom template
                // Could check version but not available in export
            }
        }
    }

    // ==================== SCORING ====================

    calculateScores() {
        const issuesByCategory = groupBy(this.issues, 'category');

        return {
            overall: calculateScore(this.issues, 50),
            cleanup: calculateScore(issuesByCategory.cleanup || [], 20),
            performance: calculateScore(issuesByCategory.performance || [], 15),
            structure: calculateScore([...(issuesByCategory.duplication || []), ...(issuesByCategory.structure || [])], 15),
            security: calculateScore(issuesByCategory.security || [], 10),
            privacy: calculateScore(issuesByCategory.privacy || [], 10),
            ssgReadiness: this.calculateSSGReadiness()
        };
    }

    calculateSSGReadiness() {
        let score = 100;

        // Deduct points for client-side only implementations
        const tags = this.parser.getTags();
        const heavyClientTags = tags.filter(t =>
            t.type === 'html' ||
            t.type === 'ua' ||
            t.type === 'awct' ||
            t.type === 'fbq'
        );
        score -= Math.min(heavyClientTags.length * 2, 50);

        // Check for GA4 server-ready tags
        const hasGA4Server = tags.some(t => t.type === 'gawc');
        if (hasGA4Server) score += 10;

        // Check for proper event naming (server-side friendly)
        const events = this.getCustomEvents();
        if (events.length > 0) score += 5;

        return Math.max(0, Math.min(100, score));
    }

    getCustomEvents() {
        const triggers = this.parser.getTriggers();
        return triggers.filter(t => t.type === 'CUSTOM_EVENT');
    }
}
