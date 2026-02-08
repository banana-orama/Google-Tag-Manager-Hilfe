/**
 * GTM Container Optimizer - Server-Side GTM Preparation
 * Dedicated module for SSG migration preparation
 */

class GTMServerSidePrep {
    constructor(parser) {
        this.parser = parser;
    }

    /**
     * Generate complete migration plan
     * @returns {Object} Migration plan
     */
    generateMigrationPlan() {
        const analysis = this.analyzeContainerForSSG();

        return {
            readiness: {
                score: analysis.readinessScore,
                grade: this.getReadinessGrade(analysis.readinessScore),
                assessment: this.getReadinessAssessment(analysis.readinessScore)
            },
            migrationSteps: this.getMigrationSteps(analysis),
            clientSideChanges: this.getClientSideChanges(analysis),
            serverSideStructure: this.getServerSideStructure(analysis),
            tags: {
                migrate: analysis.tagsToMigrate.map(t => ({
                    name: t.name,
                    type: t.type,
                    path: t.path,
                    priority: this.getTagMigrationPriority(t)
                })),
                keepClientSide: analysis.clientOnlyTags.map(t => ({
                    name: t.name,
                    type: t.type,
                    reason: this.getClientSideReason(t)
                }))
            },
            variables: {
                migrate: analysis.variablesToMigrate.map(v => ({
                    name: v.name,
                    type: v.type,
                    path: v.path
                })),
                createServer: this.getServerSideVariables(analysis)
            },
            triggers: {
                migrate: analysis.triggersToMigrate.map(t => ({
                    name: t.name,
                    type: t.type,
                    path: t.path
                }))
            },
            clients: this.getRequiredClients(analysis),
            estimatedEffort: this.estimateEffort(analysis),
            vendorsDetected: analysis.vendorsDetected || []
        };
    }

    /**
     * Analyze container for SSG readiness
     */
    analyzeContainerForSSG() {
        const tags = this.parser.getTags();
        const triggers = this.parser.getTriggers();
        const variables = this.parser.getVariables();

        const analysis = {
            tagsToMigrate: [],
            clientOnlyTags: [],
            triggersToMigrate: [],
            complexTriggers: [],
            variablesToMigrate: [],
            hasGA4: false,
            hasGoogleAds: false,
            hasOtherMarketing: false,
            hasFacebook: false,
            hasLinkedIn: false,
            hasMicrosoftAds: false,
            readinessScore: 0,
            vendorsDetected: []
        };

        const vendorCatalog = this.getVendorCatalog();
        const detectedVendors = new Map();

        // Analyze tags
        for (const tag of tags) {
            const migratable = this.isTagMigratable(tag);
            const reason = this.getTagMigrationReason(tag);

            if (migratable) {
                analysis.tagsToMigrate.push(tag);
            } else {
                analysis.clientOnlyTags.push(tag);
            }

            if (tag.type === 'gawc' || tag.type === 'gaawe') {
                analysis.hasGA4 = true;
            }
            if (tag.type === 'awct' || tag.type === 'adsct') {
                analysis.hasGoogleAds = true;
            }
            if (tag.type === 'fbq' || tag.type === 'lnq' || tag.type === 'ms') {
                analysis.hasOtherMarketing = true;
            }
            if (tag.type === 'fbq') {
                analysis.hasFacebook = true;
            }
            if (tag.type === 'lnq') {
                analysis.hasLinkedIn = true;
            }
            if (tag.type === 'ms') {
                analysis.hasMicrosoftAds = true;
            }

            const vendorKey = this.getVendorKeyForTag(tag, vendorCatalog);
            if (vendorKey) {
                detectedVendors.set(vendorKey, vendorCatalog.find(v => v.key === vendorKey));
            }
        }

        // Analyze triggers
        for (const trigger of triggers) {
            if (this.isTriggerMigratable(trigger)) {
                analysis.triggersToMigrate.push(trigger);
            } else {
                analysis.complexTriggers.push(trigger);
            }
        }

        // Analyze variables
        for (const variable of variables) {
            if (this.isVariableNeededForSSG(variable)) {
                analysis.variablesToMigrate.push(variable);
            }
        }

        // Calculate readiness score
        analysis.readinessScore = this.calculateReadinessScore(analysis);
        analysis.vendorsDetected = Array.from(detectedVendors.values());

        return analysis;
    }

    /**
     * Vendor catalog for SSG selection
     */
    getVendorCatalog() {
        return [
            { key: 'ga4', label: 'GA4', supported: true, tagTypes: ['gawc', 'gaawe'], nameHints: ['ga4'] },
            { key: 'google_ads', label: 'Google Ads', supported: true, tagTypes: ['awct', 'adsct'], nameHints: ['ads', 'google ads'] },
            { key: 'floodlight', label: 'Floodlight', supported: true, tagTypes: ['flc', 'fls'], nameHints: ['floodlight'] },
            { key: 'facebook', label: 'Facebook', supported: true, tagTypes: ['fbq'], nameHints: ['facebook', 'meta'] },
            { key: 'linkedin', label: 'LinkedIn', supported: true, tagTypes: ['lnq'], nameHints: ['linkedin'] },
            { key: 'microsoft_ads', label: 'Microsoft Ads', supported: true, tagTypes: ['ms'], nameHints: ['microsoft', 'bing'] }
        ];
    }

    /**
     * Detect vendor key for a tag
     */
    getVendorKeyForTag(tag, vendorCatalog) {
        for (const vendor of vendorCatalog) {
            if (vendor.tagTypes.includes(tag.type)) {
                return vendor.key;
            }
            const name = (tag.name || '').toLowerCase();
            if (vendor.nameHints.some(h => name.includes(h))) {
                return vendor.key;
            }
        }
        return null;
    }

    /**
     * Check if tag is migratable to SSG
     */
    isTagMigratable(tag) {
        const migratableTypes = [
            'gaawe', // GA4 Event
            'gawc',  // GA4 Configuration (partial - needs transport URL)
            'awct',  // Google Ads Conversion
            'adsct', // Google Ads Remarketing
            'flc',   // Floodlight Counter
            'fls',   // Floodlight Sales
            'img',   // Simple Image Tag
            'fbq',   // Facebook Pixel
            'lnq',   // LinkedIn Insight
            'ms'     // Microsoft Ads UET
        ];

        // Custom HTML may be migratable depending on content
        if (tag.type === 'html') {
            const html = tag.parameter?.find(p => p.key === 'html')?.value || '';
            // Check if it's just sending data (fetch, XMLHttpRequest)
            const hasNetworkRequest = html.includes('fetch(') ||
                                       html.includes('XMLHttpRequest') ||
                                       html.includes('sendBeacon');
            return hasNetworkRequest;
        }

        return migratableTypes.includes(tag.type);
    }

    /**
     * Get reason for tag migration decision
     */
    getTagMigrationReason(tag) {
        if (tag.type === 'html') {
            return 'Custom HTML muss manuell geprüft werden';
        }
        if (tag.type === 'cmp' || tag.type === 'consent') {
            return 'Consent muss client-seitig bleiben';
        }
        if (tag.type === 'a') {
            return 'A/B Testing muss client-seitig bleiben';
        }
        return 'Kann zu SSG migriert werden';
    }

    /**
     * Get reason why tag must stay client-side
     */
    getClientSideReason(tag) {
        if (tag.type === 'html') {
            return 'Custom HTML mit DOM-Manipulation';
        }
        if (tag.type === 'cmp' || tag.name.toLowerCase().includes('consent')) {
            return 'Consent-Management benötigt Browser-API';
        }
        if (tag.type === 'a' || tag.name.toLowerCase().includes('optimizely') ||
            tag.name.toLowerCase().includes('ab test')) {
            return 'A/B Testing benötigt client-seitige Ausführung';
        }
        if (tag.type === 'k' || tag.type.startsWith('k')) {
            return 'Built-in Tag';
        }
        return 'Erfordert Browser-Kontext';
    }

    /**
     * Get tag migration priority
     */
    getTagMigrationPriority(tag) {
        const priorities = {
            'gawc': 'critical',
            'gaawe': 'high',
            'awct': 'high',
            'adsct': 'medium',
            'flc': 'high',
            'fls': 'high'
        };
        return priorities[tag.type] || 'medium';
    }

    /**
     * Check if trigger is migratable to SSG
     */
    isTriggerMigratable(trigger) {
        // These trigger types work well with SSG
        const ssgCompatibleTypes = [
            'PAGE_VIEW',
            'CUSTOM_EVENT',
            'LINK_CLICK',
            'FORM_SUBMIT',
            'SCROLL',
            'TIMER'
        ];

        // DOM-specific triggers are client-only
        const clientOnlyTypes = [
            'CLICK',         // All Elements click
            'SUBMIT',        // All Forms submit
            'DOM_READY',     // DOM Ready
            'WINDOW_LOADED', // Window Loaded
            'ELEMENT_VISIBLE'
        ];

        if (clientOnlyTypes.includes(trigger.type)) {
            return false;
        }

        return ssgCompatibleTypes.includes(trigger.type);
    }

    /**
     * Check if variable is needed for SSG
     */
    isVariableNeededForSSG(variable) {
        // Skip built-in variables
        if (variable.type?.startsWith('k')) return false;

        // Check if used by migratable tags
        const tags = this.parser.getTags();
        for (const tag of tags) {
            if (this.isTagMigratable(tag)) {
                const refs = this.parser.tagVariableMap.get(tag.path) || new Set();
                if (refs.has(variable.name)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Get server-side specific variables
     */
    getServerSideVariables(analysis) {
        const variables = [];

        // SSG-specific variables
        variables.push(
            {
                name: 'Server User Agent',
                type: 'SERVER_USER_AGENT',
                description: 'User-Agent vom Server'
            },
            {
                name: 'Client IP',
                type: 'CLIENT_IP',
                description: 'IP-Adresse des Clients (anonymisiert)'
            },
            {
                name: 'Request Protocol',
                type: 'REQUEST_PROTOCOL',
                description: 'HTTP/HTTPS Protokoll'
            },
            {
                name: 'Request Hostname',
                type: 'REQUEST_HOSTNAME',
                description: 'Hostname der Anfrage'
            },
            {
                name: 'Request Path',
                type: 'REQUEST_PATH',
                description: 'Pfad der Anfrage'
            },
            {
                name: 'Request URI',
                type: 'REQUEST_URI',
                description: 'Vollständige URI der Anfrage'
            },
            {
                name: 'Query Parameters',
                type: 'QUERY_PARAM',
                description: 'Query-Parameter aus der Anfrage'
            },
            {
                name: 'Event Name',
                type: 'EVENT_NAME',
                description: 'Name des Events'
            },
            {
                name: 'Event Parameters',
                type: 'EVENT_PARAM',
                description: 'Parameter des Events'
            }
        );

        return variables;
    }

    /**
     * Get required SSG clients
     */
    getRequiredClients(analysis) {
        const clients = [];

        if (analysis.hasGA4) {
            clients.push({
                name: 'Google Analytics 4',
                type: 'GA4',
                required: true,
                priority: 'critical',
                description: 'GA4 Client für Event-Weiterleitung'
            });
        }

        if (analysis.hasGoogleAds) {
            clients.push({
                name: 'Google Ads',
                type: 'GOOGLE_ADS',
                required: true,
                priority: 'high',
                description: 'Google Ads Client für Conversion-Tracking'
            });
        }

        if (analysis.hasOtherMarketing) {
            clients.push({
                name: 'HTTP',
                type: 'HTTP',
                required: false,
                priority: 'medium',
                description: 'Generic HTTP Client für andere Marketing-Tags'
            });
        }

        // Always add these helpful clients
        clients.push(
            {
                name: 'Google Tag',
                type: 'GOOGLE_TAG',
                required: false,
                priority: 'low',
                description: 'Für Google Tag Manager-Integrationen'
            },
            {
                name: 'Conversion Linker',
                type: 'CONVERSION_LINKER',
                required: false,
                priority: 'medium',
                description: 'Für Cross-Domain-Tracking'
            }
        );

        return clients;
    }

    /**
     * Calculate SSG readiness score
     */
    calculateReadinessScore(analysis) {
        let score = 0;

        // Base score for having migratable tags
        const totalTags = analysis.tagsToMigrate.length + analysis.clientOnlyTags.length;
        if (totalTags > 0) {
            score += (analysis.tagsToMigrate.length / totalTags) * 40;
        }

        // Bonus for having GA4
        if (analysis.hasGA4) score += 20;

        // Bonus for having proper event structure
        if (analysis.triggersToMigrate.some(t => t.type === 'CUSTOM_EVENT')) {
            score += 15;
        }

        // Bonus for having clean variable structure
        if (analysis.variablesToMigrate.length > 0) {
            score += 10;
        }

        // Small bonus for having Google Ads
        if (analysis.hasGoogleAds) score += 10;

        // Deduction for too many client-only tags
        if (analysis.clientOnlyTags.length > 10) {
            score -= Math.min(analysis.clientOnlyTags.length, 20);
        }

        return Math.max(0, Math.min(100, Math.round(score)));
    }

    /**
     * Get readiness grade
     */
    getReadinessGrade(score) {
        if (score >= 80) return 'A';
        if (score >= 60) return 'B';
        if (score >= 40) return 'C';
        if (score >= 20) return 'D';
        return 'F';
    }

    /**
     * Get readiness assessment
     */
    getReadinessAssessment(score) {
        if (score >= 80) {
            return 'Der Container ist hervorragend für eine Migration zu Server-Side GTM vorbereitet.';
        } else if (score >= 60) {
            return 'Der Container ist gut für eine Migration vorbereitet. Einige Anpassungen sind erforderlich.';
        } else if (score >= 40) {
            return 'Der Container benötigt einige Vorbereitungen vor der Migration zu SSG.';
        } else {
            return 'Der Container ist nicht gut für SSG vorbereitet. Es sind umfangreiche Anpassungen erforderlich.';
        }
    }

    /**
     * Get migration steps
     */
    getMigrationSteps(analysis) {
        return [
            {
                step: 1,
                title: 'Server-Side GTM Container erstellen',
                description: 'Erstelle einen neuen SSG-Container in Google Tag Manager',
                duration: '15 Minuten',
                tasks: [
                    'Öffne Google Tag Manager',
                    'Klicke auf "Container erstellen"',
                    'Wähle "Server" als Container-Typ',
                    'Gib einen Namen ein (z.B. "Example.com - Server")',
                    'Klicke auf "Erstellen"'
                ]
            },
            {
                step: 2,
                title: 'Google Cloud Projekt einrichten',
                description: 'Richte ein GCP-Projekt mit App Engine oder Cloud Run ein',
                duration: '30-60 Minuten',
                tasks: [
                    'Erstelle ein neues GCP-Projekt',
                    'Aktiviere die Google Tag Manager API',
                    'Erstelle eine App Engine oder Cloud Run Instanz',
                    'Konfiguriere das SSG-Container-Skript',
                    'Notiere die Server-URL'
                ]
            },
            {
                step: 3,
                title: 'Client-Side Container anpassen',
                description: 'Konfiguriere den Client-Container für die Datenübertragung',
                duration: '1-2 Stunden',
                tasks: [
                    'GA4 Configuration Tag: Füge Transport URL Parameter hinzu',
                    'Entferne oder deaktiviere Tags die zu SSG migriert werden',
                    'Teste die Datenübertragung mit Preview-Modus'
                ]
            },
            {
                step: 4,
                title: 'Server-Side Clients einrichten',
                description: `Erstelle ${this.getRequiredClients(analysis).filter(c => c.required).length} benötigte Clients im SSG-Container`,
                duration: '30-60 Minuten',
                tasks: analysis.hasGA4 ? [
                    'Erstelle GA4 Client mit Measurement ID',
                    'Konfiguriere Google Ads Client (falls benötigt)',
                    'Erstelle HTTP Client für andere Tags'
                ] : [
                    'Erstelle benötigte Clients',
                    'Konfiguriere Client-Parameter'
                ]
            },
            {
                step: 5,
                title: 'Tags zum Server-Side migrieren',
                description: `Migriere ${analysis.tagsToMigrate.length} Tags zum SSG-Container`,
                duration: `${Math.ceil(analysis.tagsToMigrate.length / 5)} Stunden`,
                tasks: [
                    'Erstelle entsprechende Tags im SSG-Container',
                    'Verbinde Tags mit den richtigen Clients',
                    'Konfiguriere Event-Parameter'
                ]
            },
            {
                step: 6,
                title: 'Testing & Validierung',
                description: 'Teste alle Tracking-Flüsse',
                duration: '2-4 Stunden',
                tasks: [
                    'Nutze den SSG Preview-Modus',
                    'Prüfe ob Events am Server ankommen',
                    'Verifiziere Daten in GA4 und anderen Tools',
                    'Teste mit DebugView'
                ]
            },
            {
                step: 7,
                title: 'Client-Tags entfernen',
                description: 'Entferne migrierte Tags aus dem Client-Container',
                duration: '30 Minuten',
                tasks: [
                    'Deaktiviere oder entferne migrierte Tags',
                    'Publiziere den Client-Container',
                    'Überwache die Daten in den folgenden Tagen'
                ]
            }
        ];
    }

    /**
     * Get client-side changes
     */
    getClientSideChanges(analysis) {
        const changes = [];

        // GA4 Configuration Tag changes
        if (analysis.hasGA4) {
            changes.push({
                tag: 'GA4 Configuration',
                changes: [
                    {
                        parameter: 'transport_url',
                        value: 'https://sgtm.example.com/collect',
                        description: 'Füge die Transport URL deines SSG-Servers hinzu'
                    },
                    {
                        parameter: 'send_page_view',
                        value: 'true',
                        description: 'Pageviews werden an SSG gesendet'
                    }
                ],
                codeExample: {
                    html: '<!-- Configure GA4 to send to SSG -->\n<script>\n  // In GTM: Add transport_url parameter\n  // Value: https://sgtm.example.com/collect\n</script>'
                }
            });
        }

        // Tags to modify
        for (const tag of analysis.tagsToMigrate) {
            changes.push({
                tag: tag.name,
                action: 'wird zu SSG migriert',
                currentStatus: 'Client-seitig',
                futureStatus: 'Server-seitig',
                note: 'Wird aus Client-Container entfernt oder deaktiviert'
            });
        }

        return changes;
    }

    /**
     * Get server-side structure
     */
    getServerSideStructure(analysis) {
        return {
            container: {
                type: 'server',
                hosting: 'Google Cloud Platform (App Engine/Cloud Run)',
                customDomain: 'optional (empfohlen für Produktion)'
            },
            clients: this.getRequiredClients(analysis),
            tags: {
                recommended: analysis.tagsToMigrate.map(t => ({
                    name: t.name,
                    type: t.type,
                    client: this.getSuggestedClient(t, analysis)
                }))
            },
            triggers: {
                recommended: analysis.triggersToMigrate.map(t => ({
                    name: t.name,
                    type: t.type,
                    note: this.getTriggerMigrationNote(t)
                }))
            },
            variables: {
                serverBuiltIn: [
                    'Client Name',
                    'Client ID',
                    'Event Name',
                    'Event Data',
                    'Request URI',
                    'Request Path',
                    'Query Parameters',
                    'Server User Agent',
                    'Client IP (anonymisiert)'
                ],
                migrateFromClient: analysis.variablesToMigrate.map(v => v.name)
            }
        };
    }

    /**
     * Get suggested client for a tag
     */
    getSuggestedClient(tag, analysis) {
        if (tag.type === 'gaawe' || tag.type === 'gawc') {
            return 'Google Analytics 4';
        }
        if (tag.type === 'awct' || tag.type === 'adsct') {
            return 'Google Ads';
        }
        if (tag.type === 'flc' || tag.type === 'fls') {
            return 'Google Analytics 4';
        }
        return 'HTTP';
    }

    /**
     * Get trigger migration note
     */
    getTriggerMigrationNote(trigger) {
        if (trigger.type === 'CUSTOM_EVENT') {
            return 'Wird automatisch als Event-Trigger verfügbar sein';
        }
        if (trigger.type === 'PAGE_VIEW') {
            return 'Client Pageview-Trigger generiert server-seitige Pageview-Events';
        }
        if (trigger.type === 'LINK_CLICK') {
            return 'Link-Click-Events müssen vom Client gesendet werden';
        }
        if (trigger.type === 'FORM_SUBMIT') {
            return 'Form-Submit-Events müssen vom Client gesendet werden';
        }
        return 'Kann als Event-Trigger verwendet werden';
    }

    /**
     * Estimate migration effort
     */
    estimateEffort(analysis) {
        const hours = {
            setup: 2, // Container und GCP Setup
            clientChanges: 1, // Client Container anpassen
            clients: 0.5 * this.getRequiredClients(analysis).filter(c => c.required).length,
            tags: 0.25 * analysis.tagsToMigrate.length,
            triggers: 0.15 * analysis.triggersToMigrate.length,
            variables: 0.1 * analysis.variablesToMigrate.length,
            testing: 4 // Testing und Validierung
        };

        const totalHours = Object.values(hours).reduce((a, b) => a + b, 0);

        return {
            total: Math.ceil(totalHours),
            breakdown: hours,
            byRole: {
                'GTM Specialist': Math.ceil(totalHours * 0.7),
                'Developer': Math.ceil(totalHours * 0.2),
                'QA': Math.ceil(totalHours * 0.1)
            },
            timeline: {
                'minimal': `${Math.ceil(totalHours / 8)} Tage`,
                'withTesting': `${Math.ceil((totalHours + 8) / 8)} Tage`,
                'withBuffer': `${Math.ceil((totalHours + 16) / 8)} Tage`
            }
        };
    }
}
