/**
 * GTM Container Optimizer - Server-Side GTM Generator
 * Generates a complete Server-Side GTM container JSON from a parsed client-side container.
 *
 * Nutzt GTMParser und die Analyse von GTMServerSidePrep (analyzeContainerForSSG),
 * um einen importfaehigen SSG-Container mit Clients, Triggers, Tags, Variablen
 * und Ordnern zu erzeugen.
 */

class GTMServerSideGenerator {
    /**
     * @param {GTMParser} parser - Parsed client-side container
     * @param {Object} analysis - Result of GTMServerSidePrep.analyzeContainerForSSG()
     */
    constructor(parser, analysis) {
        this.parser = parser;
        this.analysis = analysis;
        this.selectedVendors = new Set(Array.isArray(analysis.selectedVendors) ? analysis.selectedVendors : []);

        // Sequential ID counters (start at 1)
        this._idCounters = {
            tag: 0,
            trigger: 0,
            variable: 0,
            client: 0,
            folder: 0,
            template: 0
        };

        // Mapping: original hardcoded value -> constant variable name
        this.valueToConstantMap = new Map();

        // Mapping: event name -> generated trigger ID
        this.eventToTriggerMap = new Map();

        // Generated entities (collected during generation for summary)
        this.generatedConstants = [];
        this.generatedEventDataVars = [];
        this.generatedTags = [];
        this.generatedTriggers = [];
        this.generatedClients = [];
        this.generatedFolders = [];
        this.generatedCustomTemplates = [];

        // Tag mapping for summary (original -> server-side)
        this.tagMapping = [];

        // Fingerprint value for all generated entities
        this.timestamp = Date.now().toString();
    }

    // ---------------------------------------------------------------
    // Helper methods
    // ---------------------------------------------------------------

    /**
     * Returns the next sequential ID string for a given entity type.
     * @param {string} type - One of: tag, trigger, variable, client, folder
     * @returns {string} Next ID as string
     */
    nextId(type) {
        this._idCounters[type] = (this._idCounters[type] || 0) + 1;
        return this._idCounters[type].toString();
    }

    /**
     * Returns timestamp string used as fingerprint for generated entities.
     * @returns {string}
     */
    createFingerprint() {
        return this.timestamp;
    }

    /**
     * Extracts the event name from a client-side trigger.
     * - PAGE_VIEW -> "page_view"
     * - CUSTOM_EVENT -> value from customEventFilter arg1
     * - Others -> derived from trigger name (lowercase, spaces to underscores)
     * @param {Object} trigger - Client-side trigger object
     * @returns {string} Event name
     */
    getEventNameFromTrigger(trigger) {
        if (!trigger) return 'unknown_event';

        if (trigger.type === 'PAGE_VIEW') {
            return 'page_view';
        }

        if (trigger.type === 'CUSTOM_EVENT') {
            // Extract from customEventFilter -> parameter with key "arg1"
            if (trigger.customEventFilter && trigger.customEventFilter.length > 0) {
                for (const filter of trigger.customEventFilter) {
                    if (filter.parameter) {
                        const arg1 = filter.parameter.find(p => p.key === 'arg1');
                        if (arg1 && arg1.value) {
                            return arg1.value;
                        }
                    }
                }
            }
            // Fallback: derive from trigger name
            return this._deriveEventNameFromTriggerName(trigger.name);
        }

        if (trigger.type === 'LINK_CLICK' || trigger.type === 'CLICK') {
            return 'click';
        }

        if (trigger.type === 'FORM_SUBMIT' || trigger.type === 'SUBMIT') {
            return 'form_submit';
        }

        if (trigger.type === 'SCROLL') {
            return 'scroll';
        }

        if (trigger.type === 'TIMER') {
            return 'timer';
        }

        // Fallback: derive from trigger name
        return this._deriveEventNameFromTriggerName(trigger.name);
    }

    /**
     * Derives a snake_case event name from a trigger name.
     * @param {string} name - Trigger name
     * @returns {string}
     */
    _deriveEventNameFromTriggerName(name) {
        if (!name) return 'unknown_event';
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s_]/g, '')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    /**
     * Maps a client-side tag type to its server-side equivalent.
     * @param {string} clientType - Client-side tag type
     * @returns {string} Server-side tag type
     */
    mapTagType(clientType) {
        if (clientType === 'fbq') {
            const tpl = this._getStapeTemplate('facebook');
            return tpl ? tpl.typeId : 'sgtmgaaw';
        }
        if (clientType === 'lnq') {
            const tpl = this._getStapeTemplate('linkedin');
            return tpl ? tpl.typeId : 'sgtmgaaw';
        }
        if (clientType === 'ms') {
            const tpl = this._getStapeTemplate('microsoft_ads');
            return tpl ? tpl.typeId : 'sgtmgaaw';
        }

        const mapping = {
            'gaawe': 'sgtmgaaw',
            'gawc': 'sgtmgaaw',
            'awct': 'sgtmadsct',
            'adsct': 'sgtmadsremarket',
            'flc': 'sgtmgaaw',   // Floodlight via GA4 pipeline
            'fls': 'sgtmgaaw',   // Floodlight via GA4 pipeline
            'img': 'sgtmgaaw'    // Image tag via GA4 pipeline
        };
        return mapping[clientType] || 'sgtmgaaw';
    }

    /**
     * Returns the client name string based on tag type.
     * @param {Object} tag - Client-side tag
     * @returns {string} "GA4" or "Google Ads"
     */
    getClientNameForTag(tag) {
        if (tag.type === 'awct' || tag.type === 'adsct') {
            return 'Google Ads';
        }
        return 'GA4';
    }

    /**
     * Extracts a parameter value from a tag's parameter array.
     * @param {Object} tag - Tag object
     * @param {string} key - Parameter key
     * @returns {string|null} Parameter value or null
     */
    _getTagParam(tag, key) {
        if (!tag.parameter) return null;
        const param = tag.parameter.find(p => p.key === key);
        return param ? param.value : null;
    }

    /**
     * Resolves the firing trigger of a client-side tag to the actual trigger object.
     * Returns the first firing trigger found.
     * @param {Object} tag - Client-side tag
     * @returns {Object|null} Trigger object or null
     */
    _resolveFiringTrigger(tag) {
        const firingIds = tag.firingTriggerId || [];
        for (const triggerId of firingIds) {
            const trigger = this.parser.getTriggerByTriggerId(triggerId);
            if (trigger) {
                return trigger;
            }
        }
        return null;
    }

    /**
     * Creates a vendor-specific folder name.
     * @param {string} vendorKey - Vendor identifier (e.g., "ga4", "google_ads")
     * @returns {string} Folder name
     */
    _getVendorFolderName(vendorKey) {
        const names = {
            'ga4': 'GA4',
            'google_ads': 'Google Ads',
            'facebook': 'Facebook',
            'floodlight': 'Floodlight'
        };
        return names[vendorKey] || vendorKey;
    }

    // ---------------------------------------------------------------
    // Main generation method
    // ---------------------------------------------------------------

    /**
     * Generates the complete SSG container JSON object.
     * @returns {Object} Complete server-side GTM container JSON
     */
    generate() {
        const containerInfo = this.parser.getContainerInfo();
        const containerName = '[SSG] ' + (containerInfo.name || 'GTM Container');

        this._applyVendorSelection();
        // Keep 1:1 mapping by default (no deduplication)

        // 1. Create folders
        const folders = this.generateFolders();

        // 2. Generate constant variables (must come before tags for value mapping)
        const constantVariables = this.generateConstantVariables();

        // 3. Generate event data variables
        const eventDataVariables = this.generateEventDataVariables();

        // 3b. Generate custom templates (Stape)
        const customTemplates = this.generateCustomTemplates();

        // 4. Generate clients
        const clients = this.generateClients();

        // 5. Generate triggers (must come before tags for trigger mapping)
        const triggers = this.generateTriggers();

        // 6. Generate tags
        const tags = this.generateTags();

        // 7. Built-in variables
        const builtInVariables = [
            {
                accountId: '0',
                containerId: '0',
                type: 'EVENT_NAME',
                name: 'Event Name'
            },
            {
                accountId: '0',
                containerId: '0',
                type: 'CLIENT_NAME',
                name: 'Client Name'
            }
        ];

        // Combine all variables
        const allVariables = [...constantVariables, ...eventDataVariables];

        // Assemble the export time in the format used by real GTM exports
        const now = new Date();
        const exportTime = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + ' ' +
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');

        // Build the complete container JSON
        // Must match the exact structure of a real GTM Server-Side container export
        const ssgContainer = {
            exportFormatVersion: 2,
            exportTime: exportTime,
            containerVersion: {
                path: 'accounts/0/containers/0/versions/0',
                accountId: '0',
                containerId: '0',
                containerVersionId: '0',
                fingerprint: this.createFingerprint(),
                tagManagerUrl: 'https://tagmanager.google.com/#/container/accounts/0/containers/0/workspaces?apiLink=container',
                container: {
                    path: 'accounts/0/containers/0',
                    accountId: '0',
                    containerId: '0',
                    name: containerName,
                    publicId: 'GTM-XXXXXX',
                    usageContext: ['SERVER'],
                    fingerprint: this.createFingerprint(),
                    tagManagerUrl: 'https://tagmanager.google.com/#/container/accounts/0/containers/0/workspaces?apiLink=container',
                    features: {
                        supportUserPermissions: true,
                        supportEnvironments: true,
                        supportWorkspaces: true,
                        supportGtagConfigs: false,
                        supportBuiltInVariables: true,
                        supportClients: true,
                        supportFolders: true,
                        supportTags: true,
                        supportTemplates: true,
                        supportTriggers: true,
                        supportVariables: true,
                        supportVersions: true,
                        supportZones: true,
                        supportTransformations: true
                    },
                    tagIds: ['GTM-XXXXXX']
                },
                tag: tags,
                trigger: triggers,
                variable: allVariables,
                folder: folders,
                client: clients,
                builtInVariable: builtInVariables,
                customTemplate: customTemplates
            }
        };

        return ssgContainer;
    }

    /**
     * Apply vendor selection to analysis
     */
    _applyVendorSelection() {
        if (this.selectedVendors.size === 0) {
            return;
        }

        this.analysis.tagsToMigrate = this.analysis.tagsToMigrate.filter(tag => {
            const vendorKey = this._getVendorKeyForTagType(tag.type);
            if (!vendorKey) return false;
            return this.selectedVendors.has(vendorKey);
        });

        const selectedTags = this.analysis.tagsToMigrate;
        const hasMarketing = selectedTags.some(t => t.type === 'fbq' || t.type === 'lnq' || t.type === 'ms');
        const hasGA4Tags = selectedTags.some(t => t.type === 'gawc' || t.type === 'gaawe');
        this.analysis.hasGA4Tags = hasGA4Tags;
        this.analysis.needsGa4Client = selectedTags.length > 0;
        this.analysis.hasGA4 = hasGA4Tags;
        this.analysis.hasGoogleAds = selectedTags.some(t => t.type === 'awct' || t.type === 'adsct');
        this.analysis.hasFacebook = selectedTags.some(t => t.type === 'fbq');
        this.analysis.hasLinkedIn = selectedTags.some(t => t.type === 'lnq');
        this.analysis.hasMicrosoftAds = selectedTags.some(t => t.type === 'ms');
    }

    /**
     * Deduplicate migratable tags by signature
     * @param {Array} tags
     * @returns {Array}
     */
    _dedupeMigratableTags(tags) {
        const seen = new Set();
        const unique = [];
        for (const tag of tags) {
            const signature = this.parser.getTagSignature(tag);
            if (seen.has(signature)) continue;
            seen.add(signature);
            unique.push(tag);
        }
        return unique;
    }

    /**
     * Map tag type to vendor key
     * @param {string} tagType
     * @returns {string|null}
     */
    _getVendorKeyForTagType(tagType) {
        const map = {
            'gawc': 'ga4',
            'gaawe': 'ga4',
            'awct': 'google_ads',
            'adsct': 'google_ads',
            'flc': 'floodlight',
            'fls': 'floodlight',
            'fbq': 'facebook',
            'lnq': 'linkedin',
            'ms': 'microsoft_ads'
        };
        return map[tagType] || null;
    }

    // ---------------------------------------------------------------
    // Folder generation
    // ---------------------------------------------------------------

    /**
     * Creates folder objects for organizing SSG entities.
     * - "Einstellungen" for constants
     * - "Event Data" for event data variables
     * - One folder per vendor type found
     * @returns {Array} Folder objects
     */
    generateFolders() {
        this.generatedFolders = [];

        // Always create settings folder for constants
        const settingsFolder = {
            accountId: '0',
            containerId: '0',
            folderId: this.nextId('folder'),
            name: 'Einstellungen',
            fingerprint: this.createFingerprint()
        };
        this.generatedFolders.push(settingsFolder);

        // Always create Event Data folder
        const eventDataFolder = {
            accountId: '0',
            containerId: '0',
            folderId: this.nextId('folder'),
            name: 'Event Data',
            fingerprint: this.createFingerprint()
        };
        this.generatedFolders.push(eventDataFolder);

        // Vendor-specific folders based on analysis
        if (this.analysis.hasGA4) {
            const ga4Folder = {
                accountId: '0',
                containerId: '0',
                folderId: this.nextId('folder'),
                name: 'GA4',
                fingerprint: this.createFingerprint()
            };
            this.generatedFolders.push(ga4Folder);
        }

        if (this.analysis.hasGoogleAds) {
            const adsFolder = {
                accountId: '0',
                containerId: '0',
                folderId: this.nextId('folder'),
                name: 'Google Ads',
                fingerprint: this.createFingerprint()
            };
            this.generatedFolders.push(adsFolder);
        }

        if (this.analysis.hasFacebook) {
            const facebookFolder = {
                accountId: '0',
                containerId: '0',
                folderId: this.nextId('folder'),
                name: 'Facebook',
                fingerprint: this.createFingerprint()
            };
            this.generatedFolders.push(facebookFolder);
        }

        if (this.analysis.hasLinkedIn) {
            const linkedinFolder = {
                accountId: '0',
                containerId: '0',
                folderId: this.nextId('folder'),
                name: 'LinkedIn',
                fingerprint: this.createFingerprint()
            };
            this.generatedFolders.push(linkedinFolder);
        }

        if (this.analysis.hasMicrosoftAds) {
            const msFolder = {
                accountId: '0',
                containerId: '0',
                folderId: this.nextId('folder'),
                name: 'Microsoft Ads',
                fingerprint: this.createFingerprint()
            };
            this.generatedFolders.push(msFolder);
        }

        // Check for Floodlight tags among migratable tags
        const hasFloodlight = this.analysis.tagsToMigrate.some(
            t => t.type === 'flc' || t.type === 'fls'
        );
        if (hasFloodlight) {
            const floodlightFolder = {
                accountId: '0',
                containerId: '0',
                folderId: this.nextId('folder'),
                name: 'Floodlight',
                fingerprint: this.createFingerprint()
            };
            this.generatedFolders.push(floodlightFolder);
        }

        return this.generatedFolders;
    }

    /**
     * Finds a folder ID by name from the generated folders.
     * @param {string} name - Folder name
     * @returns {string|undefined} Folder ID
     */
    _getFolderIdByName(name) {
        const folder = this.generatedFolders.find(f => f.name === name);
        return folder ? folder.folderId : undefined;
    }

    // ---------------------------------------------------------------
    // Constant variable generation
    // ---------------------------------------------------------------

    /**
     * Scans migratable tags for configurable values and creates constant variables.
     * Deduplicates by value so the same ID is not stored twice.
     * @returns {Array} Constant variable objects
     */
    generateConstantVariables() {
        this.generatedConstants = [];
        const settingsFolderId = this._getFolderIdByName('Einstellungen');

        // Track created constants to avoid duplicates (value -> variable name)
        const createdValues = new Map();
        const createdNames = new Set();

        for (const tag of this.analysis.tagsToMigrate) {
            if (tag.type === 'gaawe' || tag.type === 'gawc') {
                // GA4: extract measurementId
                const measurementId = this._getTagParam(tag, 'measurementId') ||
                                      this._getTagParam(tag, 'gaSettings');
                if (measurementId && !createdValues.has(measurementId)) {
                    const constName = 'const - ga4 measurement id';
                    createdValues.set(measurementId, constName);
                    this._addConstant(
                        constName,
                        '[HIER_EINFUEGEN: GA4 Measurement ID, z.B. G-XXXXXXXXXX]',
                        settingsFolderId
                    );
                    this.valueToConstantMap.set(measurementId, constName);
                }
            }

            if (tag.type === 'awct') {
                // Google Ads Conversion: conversionId and conversionLabel
                const conversionId = this._getTagParam(tag, 'conversionId');
                if (conversionId && !createdValues.has(conversionId)) {
                    const constName = 'const - google ads conversion id';
                    createdValues.set(conversionId, constName);
                    this._addConstant(
                        constName,
                        '[HIER_EINFUEGEN: Google Ads Conversion ID, z.B. AW-123456789]',
                        settingsFolderId
                    );
                    this.valueToConstantMap.set(conversionId, constName);
                }

                const conversionLabel = this._getTagParam(tag, 'conversionLabel');
                if (conversionLabel && !createdValues.has(conversionLabel)) {
                    // Include tag name for clarity when multiple conversion labels exist
                    const safeName = (tag.name || 'conversion')
                        .toLowerCase()
                        .replace(/[^a-z0-9\s]/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    const constName = 'const - google ads ' + safeName + ' conversion label';
                    createdValues.set(conversionLabel, constName);
                    this._addConstant(
                        constName,
                        '[HIER_EINFUEGEN: Conversion Label fuer ' + (tag.name || 'Tag') + ']',
                        settingsFolderId
                    );
                    this.valueToConstantMap.set(conversionLabel, constName);
                }
            }

            if (tag.type === 'adsct') {
                // Google Ads Remarketing: conversionId
                const conversionId = this._getTagParam(tag, 'conversionId');
                if (conversionId && !createdValues.has(conversionId)) {
                    const constName = 'const - google ads conversion id';
                    createdValues.set(conversionId, constName);
                    this._addConstant(
                        constName,
                        '[HIER_EINFUEGEN: Google Ads Conversion ID, z.B. AW-123456789]',
                        settingsFolderId
                    );
                    this.valueToConstantMap.set(conversionId, constName);
                }

                const conversionLabel = this._getTagParam(tag, 'conversionLabel');
                if (conversionLabel && !createdValues.has(conversionLabel)) {
                    const safeName = (tag.name || 'remarketing')
                        .toLowerCase()
                        .replace(/[^a-z0-9\s]/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    const constName = 'const - google ads ' + safeName + ' conversion label';
                    createdValues.set(conversionLabel, constName);
                    this._addConstant(
                        constName,
                        '[HIER_EINFUEGEN: Conversion Label fuer ' + (tag.name || 'Tag') + ']',
                        settingsFolderId
                    );
                    this.valueToConstantMap.set(conversionLabel, constName);
                }
            }

            if (tag.type === 'fbq') {
                const accessName = 'const - facebook access token';
                if (!createdNames.has(accessName)) {
                    createdNames.add(accessName);
                    this._addConstant(
                        accessName,
                        '[HIER_EINFUEGEN: Facebook Access Token]',
                        settingsFolderId
                    );
                }
                const pixelName = 'const - facebook pixel id';
                if (!createdNames.has(pixelName)) {
                    createdNames.add(pixelName);
                    this._addConstant(
                        pixelName,
                        '[HIER_EINFUEGEN: Facebook Pixel ID]',
                        settingsFolderId
                    );
                }
            }

            if (tag.type === 'lnq') {
                const accessName = 'const - linkedin access token';
                if (!createdNames.has(accessName)) {
                    createdNames.add(accessName);
                    this._addConstant(
                        accessName,
                        '[HIER_EINFUEGEN: LinkedIn Access Token]',
                        settingsFolderId
                    );
                }
                const ruleName = 'const - linkedin conversion rule urn';
                if (!createdNames.has(ruleName)) {
                    createdNames.add(ruleName);
                    this._addConstant(
                        ruleName,
                        '[HIER_EINFUEGEN: LinkedIn Conversion Rule URN]',
                        settingsFolderId
                    );
                }
            }

            if (tag.type === 'ms') {
                const uetName = 'const - microsoft uet tag id';
                if (!createdNames.has(uetName)) {
                    createdNames.add(uetName);
                    this._addConstant(
                        uetName,
                        '[HIER_EINFUEGEN: Microsoft UET Tag ID]',
                        settingsFolderId
                    );
                }
            }
        }

        // Always add transport URL constant
        this._addConstant(
            'const - transport url',
            '[HIER_EINFUEGEN: Server-Side GTM URL, z.B. https://sgtm.example.com]',
            settingsFolderId
        );

        return this.generatedConstants;
    }

    /**
     * Creates a single constant variable object and adds it to the internal list.
     * @param {string} name - Variable name
     * @param {string} placeholderValue - Placeholder value
     * @param {string} [parentFolderId] - Folder ID
     */
    _addConstant(name, placeholderValue, parentFolderId) {
        const variable = {
            accountId: '0',
            containerId: '0',
            variableId: this.nextId('variable'),
            name: name,
            type: 'c',
            parameter: [
                {
                    type: 'TEMPLATE',
                    key: 'value',
                    value: placeholderValue
                }
            ],
            fingerprint: this.createFingerprint(),
            formatValue: {}
        };
        if (parentFolderId) {
            variable.parentFolderId = parentFolderId;
        }
        this.generatedConstants.push(variable);
    }

    // ---------------------------------------------------------------
    // Event Data variable generation
    // ---------------------------------------------------------------

    /**
     * Creates standard event data variables used in server-side containers.
     * @returns {Array} Event data variable objects
     */
    generateEventDataVariables() {
        this.generatedEventDataVars = [];
        const eventDataFolderId = this._getFolderIdByName('Event Data');

        // Standard set of event data variables commonly used in SSG
        const standardEventDataKeys = [
            'email_address',
            'phone_number',
            'first_name',
            'last_name',
            'user_id',
            'value',
            'currency',
            'transaction_id',
            'event_id',
            'items',
            'content_ids',
            'contents',
            'postal_code',
            'city',
            'country',
            'region'
        ];

        for (const keyPath of standardEventDataKeys) {
            const variable = {
                accountId: '0',
                containerId: '0',
                variableId: this.nextId('variable'),
                name: 'ed - ' + keyPath,
                type: 'ed',
                parameter: [
                    {
                        type: 'BOOLEAN',
                        key: 'setDefaultValue',
                        value: 'false'
                    },
                    {
                        type: 'TEMPLATE',
                        key: 'keyPath',
                        value: keyPath
                    }
                ],
                fingerprint: this.createFingerprint(),
                formatValue: {}
            };
            if (eventDataFolderId) {
                variable.parentFolderId = eventDataFolderId;
            }
            this.generatedEventDataVars.push(variable);
        }

        return this.generatedEventDataVars;
    }

    // ---------------------------------------------------------------
    // Custom template generation (Stape)
    // ---------------------------------------------------------------

    /**
     * Generates custom templates for selected vendors (Stape templates).
     * @returns {Array} Custom template objects
     */
    generateCustomTemplates() {
        this.generatedCustomTemplates = [];

        const vendorKeys = ['facebook', 'linkedin', 'microsoft_ads'];
        for (const key of vendorKeys) {
            if (this.selectedVendors.size > 0 && !this.selectedVendors.has(key)) {
                continue;
            }

            if (key === 'facebook' && !this.analysis.hasFacebook) continue;
            if (key === 'linkedin' && !this.analysis.hasLinkedIn) continue;
            if (key === 'microsoft_ads' && !this.analysis.hasMicrosoftAds) continue;

            const template = this._getStapeTemplate(key);
            if (!template) continue;

            this.generatedCustomTemplates.push({
                accountId: '0',
                containerId: '0',
                templateId: this.nextId('template'),
                name: template.displayName,
                fingerprint: this.createFingerprint(),
                templateData: template.templateData
            });
        }

        return this.generatedCustomTemplates;
    }

    /**
     * Resolve Stape template metadata
     * @param {string} key
     * @returns {{typeId: string, displayName: string, templateData: string}|null}
     */
    _getStapeTemplate(key) {
        if (typeof STAPE_TEMPLATES === 'undefined') return null;
        const entry = STAPE_TEMPLATES[key];
        if (!entry) return null;
        return {
            typeId: entry.typeId,
            displayName: entry.displayName,
            templateData: decodeTemplateData(entry.templateDataBase64)
        };
    }

    // ---------------------------------------------------------------
    // Client generation
    // ---------------------------------------------------------------

    /**
     * Creates server-side client objects.
     * Currently supports GA4 client (gaaw_client).
     * @returns {Array} Client objects
     */
    generateClients() {
        this.generatedClients = [];

        if (this.analysis.needsGa4Client) {
            const ga4Client = {
                accountId: '0',
                containerId: '0',
                clientId: this.nextId('client'),
                name: 'GA4',
                type: 'gaaw_client',
                parameter: [
                    {
                        type: 'TEMPLATE',
                        key: 'cookieDomain',
                        value: 'auto'
                    },
                    {
                        type: 'TEMPLATE',
                        key: 'cookieMaxAgeInSec',
                        value: '63072000'
                    },
                    {
                        type: 'BOOLEAN',
                        key: 'activateDefaultPaths',
                        value: 'true'
                    },
                    {
                        type: 'TEMPLATE',
                        key: 'cookiePath',
                        value: '/'
                    },
                    {
                        type: 'TEMPLATE',
                        key: 'cookieManagement',
                        value: 'server'
                    },
                    {
                        type: 'TEMPLATE',
                        key: 'cookieName',
                        value: 'FPID'
                    }
                ],
                fingerprint: this.createFingerprint()
            };
            this.generatedClients.push(ga4Client);
        }

        return this.generatedClients;
    }

    // ---------------------------------------------------------------
    // Trigger generation
    // ---------------------------------------------------------------

    /**
     * Creates server-side triggers from migratable tags.
     * All server-side triggers are CUSTOM_EVENT with a filter on Client Name.
     * Also creates a base "All Events - GA4" trigger for the GA4 base tag
     * and Conversion Linker.
     * @returns {Array} Trigger objects
     */
    generateTriggers() {
        this.generatedTriggers = [];

        // 1. Create "All Events - GA4" trigger (no customEventFilter, only Client Name filter)
        //    Used for the base GA4 tag and Conversion Linker
        if (this.analysis.needsGa4Client || this.analysis.hasGoogleAds) {
            const allEventsTriggerId = this.nextId('trigger');
            const allEventsTrigger = {
                accountId: '0',
                containerId: '0',
                triggerId: allEventsTriggerId,
                name: 'All Events - GA4',
                type: 'CUSTOM_EVENT',
                customEventFilter: [
                    {
                        type: 'MATCH_REGEX',
                        parameter: [
                            { type: 'TEMPLATE', key: 'arg0', value: '{{_event}}' },
                            { type: 'TEMPLATE', key: 'arg1', value: '.*' }
                        ]
                    }
                ],
                filter: [
                    {
                        type: 'CONTAINS',
                        parameter: [
                            { type: 'TEMPLATE', key: 'arg0', value: '{{Client Name}}' },
                            { type: 'TEMPLATE', key: 'arg1', value: 'GA4' }
                        ]
                    }
                ],
                fingerprint: this.createFingerprint()
            };
            this.generatedTriggers.push(allEventsTrigger);
            this.eventToTriggerMap.set('__all_events__', allEventsTriggerId);
        }

        // 2. Create one trigger per unique event name from migratable tags
        const processedEvents = new Set();

        for (const tag of this.analysis.tagsToMigrate) {
            const clientSideTrigger = this._resolveFiringTrigger(tag);
            const eventName = this.getEventNameFromTrigger(clientSideTrigger);

            if (processedEvents.has(eventName)) {
                // Already created a trigger for this event
                continue;
            }
            processedEvents.add(eventName);

            const clientName = this.getClientNameForTag(tag);
            const triggerId = this.nextId('trigger');

            const trigger = {
                accountId: '0',
                containerId: '0',
                triggerId: triggerId,
                name: '[' + clientName + '] ' + eventName,
                type: 'CUSTOM_EVENT',
                customEventFilter: [
                    {
                        type: 'EQUALS',
                        parameter: [
                            { type: 'TEMPLATE', key: 'arg0', value: '{{_event}}' },
                            { type: 'TEMPLATE', key: 'arg1', value: eventName }
                        ]
                    }
                ],
                filter: [
                    {
                        type: 'CONTAINS',
                        parameter: [
                            { type: 'TEMPLATE', key: 'arg0', value: '{{Client Name}}' },
                            { type: 'TEMPLATE', key: 'arg1', value: clientName }
                        ]
                    }
                ],
                fingerprint: this.createFingerprint()
            };

            this.generatedTriggers.push(trigger);
            this.eventToTriggerMap.set(eventName, triggerId);
        }

        return this.generatedTriggers;
    }

    // ---------------------------------------------------------------
    // Tag generation
    // ---------------------------------------------------------------

    /**
     * Creates server-side tags from migratable client-side tags.
     * Maps each client-side tag to its server-side equivalent and replaces
     * hardcoded values with {{const - ...}} references.
     * Also adds Conversion Linker if Google Ads tags are present,
     * and a base GA4 tag if GA4 tags are present.
     * @returns {Array} Tag objects
     */
    generateTags() {
        this.generatedTags = [];

        // Track which base tags we have already added
        let hasBaseGA4Tag = false;
        let hasConversionLinker = false;

        // Determine folder IDs for organization
        const ga4FolderId = this._getFolderIdByName('GA4');
        const adsFolderId = this._getFolderIdByName('Google Ads');
        const floodlightFolderId = this._getFolderIdByName('Floodlight');
        const facebookFolderId = this._getFolderIdByName('Facebook');
        const linkedinFolderId = this._getFolderIdByName('LinkedIn');
        const microsoftFolderId = this._getFolderIdByName('Microsoft Ads');
        const allEventsTriggerId = this.eventToTriggerMap.get('__all_events__');

        // 1. Add base GA4 tag linked to "All Events" trigger if GA4 is present
        if (this.analysis.hasGA4Tags && allEventsTriggerId) {
            const measurementIdConst = this._findConstantName('ga4 measurement id');
            const baseGA4Tag = this._createTagShell({
                name: 'SSG - GA4 - All Events',
                type: 'sgtmgaaw',
                firingTriggerId: [allEventsTriggerId],
                parentFolderId: ga4FolderId,
                parameter: [
                    {
                        type: 'TEMPLATE',
                        key: 'measurementId',
                        value: measurementIdConst
                            ? '{{' + measurementIdConst + '}}'
                            : '[HIER_EINFUEGEN: GA4 Measurement ID]'
                    },
                    { type: 'TEMPLATE', key: 'epToIncludeDropdown', value: 'all' },
                    { type: 'TEMPLATE', key: 'upToIncludeDropdown', value: 'all' },
                    { type: 'BOOLEAN', key: 'redactVisitorIp', value: 'false' }
                ]
            });
            this.generatedTags.push(baseGA4Tag);
            hasBaseGA4Tag = true;
        }

        // 2. Add Conversion Linker if Google Ads tags are present
        if (this.analysis.hasGoogleAds && allEventsTriggerId) {
            const conversionLinkerTag = this._createTagShell({
                name: 'SSG - Conversion Linker',
                type: 'sgtmadscl',
                firingTriggerId: [allEventsTriggerId],
                parentFolderId: adsFolderId,
                parameter: [
                    { type: 'BOOLEAN', key: 'enableLinkerParams', value: 'false' },
                    { type: 'BOOLEAN', key: 'enableCookieOverrides', value: 'false' }
                ]
            });
            this.generatedTags.push(conversionLinkerTag);
            hasConversionLinker = true;
        }

        // 3. Create server-side tag for each migratable client-side tag
        for (const tag of this.analysis.tagsToMigrate) {
            const clientSideTrigger = this._resolveFiringTrigger(tag);
            const eventName = this.getEventNameFromTrigger(clientSideTrigger);
            const serverType = this.mapTagType(tag.type);

            // Find trigger ID for this event
            const triggerId = this.eventToTriggerMap.get(eventName);
            if (!triggerId) continue;

            // Determine folder
            let parentFolderId;
            if (tag.type === 'gaawe' || tag.type === 'gawc') {
                parentFolderId = ga4FolderId;
            } else if (tag.type === 'awct' || tag.type === 'adsct') {
                parentFolderId = adsFolderId;
            } else if (tag.type === 'flc' || tag.type === 'fls') {
                parentFolderId = floodlightFolderId;
            } else if (tag.type === 'fbq') {
                parentFolderId = facebookFolderId;
            } else if (tag.type === 'lnq') {
                parentFolderId = linkedinFolderId;
            } else if (tag.type === 'ms') {
                parentFolderId = microsoftFolderId;
            }

            // Build tag name
            const vendorLabel = this._getVendorLabel(tag.type);
            const serverTagName = 'SSG - ' + vendorLabel + ' - ' + eventName;

            // Build parameters based on server type
            const parameters = this._buildServerTagParams(tag, serverType);

            const serverTag = this._createTagShell({
                name: serverTagName,
                type: serverType,
                firingTriggerId: [triggerId],
                parentFolderId: parentFolderId,
                parameter: parameters
            });

            this.generatedTags.push(serverTag);

            // Record mapping for summary
            this.tagMapping.push({
                original: tag.name,
                serverSide: serverTagName,
                type: serverType
            });
        }

        return this.generatedTags;
    }

    /**
     * Creates a tag object shell with standard SSG properties.
     * @param {Object} config - Tag configuration
     * @returns {Object} Tag object
     */
    _createTagShell(config) {
        const tag = {
            accountId: '0',
            containerId: '0',
            tagId: this.nextId('tag'),
            name: config.name,
            type: config.type,
            parameter: config.parameter || [],
            fingerprint: this.createFingerprint(),
            firingTriggerId: config.firingTriggerId || [],
            tagFiringOption: 'ONCE_PER_EVENT',
            consentSettings: {
                consentStatus: 'NOT_SET'
            },
            monitoringMetadata: {
                type: 'MAP'
            }
        };
        if (config.parentFolderId) {
            tag.parentFolderId = config.parentFolderId;
        }
        return tag;
    }

    /**
     * Builds server-side tag parameters from a client-side tag.
     * Replaces hardcoded values with {{const - ...}} references.
     * @param {Object} tag - Client-side tag
     * @param {string} serverType - Server-side tag type
     * @returns {Array} Parameter array
     */
    _buildServerTagParams(tag, serverType) {
        if (tag.type === 'fbq') {
            return this._buildFacebookCapiParams();
        }
        if (tag.type === 'lnq') {
            return this._buildLinkedInCapiParams();
        }
        if (tag.type === 'ms') {
            return this._buildMicrosoftCapiParams();
        }

        switch (serverType) {
            case 'sgtmgaaw':
                return this._buildGA4Params(tag);
            case 'sgtmadsct':
                return this._buildAdsConversionParams(tag);
            case 'sgtmadsremarket':
                return this._buildAdsRemarketingParams(tag);
            default:
                return this._buildGA4Params(tag);
        }
    }

    /**
     * Builds Facebook CAPI (Stape) tag parameters.
     * @returns {Array}
     */
    _buildFacebookCapiParams() {
        const access = this._findConstantName('facebook access token');
        const pixel = this._findConstantName('facebook pixel id');
        return [
            {
                type: 'TEMPLATE',
                key: 'accessToken',
                value: access ? '{{' + access + '}}' : '[HIER_EINFUEGEN: Facebook Access Token]'
            },
            {
                type: 'TEMPLATE',
                key: 'pixelId',
                value: pixel ? '{{' + pixel + '}}' : '[HIER_EINFUEGEN: Facebook Pixel ID]'
            }
        ];
    }

    /**
     * Builds LinkedIn CAPI (Stape) tag parameters.
     * @returns {Array}
     */
    _buildLinkedInCapiParams() {
        const access = this._findConstantName('linkedin access token');
        const rule = this._findConstantName('linkedin conversion rule urn');
        return [
            {
                type: 'TEMPLATE',
                key: 'accessToken',
                value: access ? '{{' + access + '}}' : '[HIER_EINFUEGEN: LinkedIn Access Token]'
            },
            {
                type: 'TEMPLATE',
                key: 'conversionRuleUrn',
                value: rule ? '{{' + rule + '}}' : '[HIER_EINFUEGEN: LinkedIn Conversion Rule URN]'
            },
            {
                type: 'TEMPLATE',
                key: 'eventDataGroup',
                value: 'conversion'
            }
        ];
    }

    /**
     * Builds Microsoft Ads CAPI (Stape) tag parameters.
     * @returns {Array}
     */
    _buildMicrosoftCapiParams() {
        const uet = this._findConstantName('microsoft uet tag id');
        return [
            {
                type: 'TEMPLATE',
                key: 'uetTagId',
                value: uet ? '{{' + uet + '}}' : '[HIER_EINFUEGEN: Microsoft UET Tag ID]'
            }
        ];
    }

    /**
     * Builds GA4 server-side tag parameters.
     * @param {Object} tag - Client-side GA4 tag
     * @returns {Array} Parameter array
     */
    _buildGA4Params(tag) {
        const measurementId = this._getTagParam(tag, 'measurementId') ||
                              this._getTagParam(tag, 'gaSettings');
        const constName = this.valueToConstantMap.get(measurementId);

        return [
            {
                type: 'TEMPLATE',
                key: 'measurementId',
                value: constName
                    ? '{{' + constName + '}}'
                    : '[HIER_EINFUEGEN: GA4 Measurement ID]'
            },
            { type: 'TEMPLATE', key: 'epToIncludeDropdown', value: 'all' },
            { type: 'TEMPLATE', key: 'upToIncludeDropdown', value: 'all' },
            { type: 'BOOLEAN', key: 'redactVisitorIp', value: 'false' }
        ];
    }

    /**
     * Builds Google Ads Conversion server-side tag parameters.
     * @param {Object} tag - Client-side awct tag
     * @returns {Array} Parameter array
     */
    _buildAdsConversionParams(tag) {
        const conversionId = this._getTagParam(tag, 'conversionId');
        const conversionLabel = this._getTagParam(tag, 'conversionLabel');
        const idConst = this.valueToConstantMap.get(conversionId);
        const labelConst = this.valueToConstantMap.get(conversionLabel);

        return [
            {
                type: 'TEMPLATE',
                key: 'conversionId',
                value: idConst
                    ? '{{' + idConst + '}}'
                    : '[HIER_EINFUEGEN: Google Ads Conversion ID]'
            },
            {
                type: 'TEMPLATE',
                key: 'conversionLabel',
                value: labelConst
                    ? '{{' + labelConst + '}}'
                    : '[HIER_EINFUEGEN: Conversion Label]'
            },
            { type: 'BOOLEAN', key: 'enableConversionLinker', value: 'true' },
            { type: 'BOOLEAN', key: 'rdp', value: 'false' }
        ];
    }

    /**
     * Builds Google Ads Remarketing server-side tag parameters.
     * @param {Object} tag - Client-side adsct tag
     * @returns {Array} Parameter array
     */
    _buildAdsRemarketingParams(tag) {
        const conversionId = this._getTagParam(tag, 'conversionId');
        const idConst = this.valueToConstantMap.get(conversionId);

        return [
            {
                type: 'TEMPLATE',
                key: 'conversionId',
                value: idConst
                    ? '{{' + idConst + '}}'
                    : '[HIER_EINFUEGEN: Google Ads Conversion ID]'
            },
            { type: 'BOOLEAN', key: 'enableConversionLinker', value: 'true' },
            { type: 'BOOLEAN', key: 'enableDynamicRemarketing', value: 'true' },
            { type: 'BOOLEAN', key: 'rdp', value: 'false' }
        ];
    }

    /**
     * Returns a vendor label for tag naming.
     * @param {string} tagType - Client-side tag type
     * @returns {string} Vendor label
     */
    _getVendorLabel(tagType) {
        const labels = {
            'gaawe': 'GA4',
            'gawc': 'GA4',
            'awct': 'ADS',
            'adsct': 'ADS',
            'flc': 'Floodlight',
            'fls': 'Floodlight',
            'img': 'Image',
            'fbq': 'Facebook',
            'lnq': 'LinkedIn',
            'ms': 'Microsoft Ads'
        };
        return labels[tagType] || 'Custom';
    }

    /**
     * Finds a constant variable name that contains the given search string.
     * @param {string} search - Partial name to search for
     * @returns {string|null} Full constant name or null
     */
    _findConstantName(search) {
        const constant = this.generatedConstants.find(
            c => c.name.includes(search)
        );
        return constant ? constant.name : null;
    }

    // ---------------------------------------------------------------
    // Modified client container generation
    // ---------------------------------------------------------------

    /**
     * Generates a modified version of the original client-side container.
     * Adds transport_url to GA4 Configuration (gawc) tags and
     * server_container_url to GA4 Event (gaawe) tags.
     * @returns {Object} Modified client-side container
     */
    generateModifiedClientContainer() {
        const container = deepClone(this.parser.getContainer());
        const version = container.containerVersion;

        if (!version.tag) return container;

        const transportUrlPlaceholder =
            '[HIER_EINFUEGEN: Server-Side GTM URL, z.B. https://sgtm.example.com]';

        // Erkennung ob ein GA4 Config Tag vorhanden ist
        let hasGA4Config = false;

        for (const tag of version.tag) {
            if (tag.type === 'gawc') {
                hasGA4Config = true;

                if (!tag.parameter) {
                    tag.parameter = [];
                }

                // Add or update transport_url
                const existingParam = tag.parameter.find(
                    p => p.key === 'transport_url'
                );
                if (existingParam) {
                    existingParam.value = transportUrlPlaceholder;
                } else {
                    tag.parameter.push({
                        type: 'TEMPLATE',
                        key: 'transport_url',
                        value: transportUrlPlaceholder
                    });
                }
            }
        }

        // If a GA4 Config tag exists, also update gaawe tags with server_container_url
        if (hasGA4Config) {
            for (const tag of version.tag) {
                if (tag.type === 'gaawe') {
                    if (!tag.parameter) {
                        tag.parameter = [];
                    }

                    const existingParam = tag.parameter.find(
                        p => p.key === 'server_container_url'
                    );
                    if (existingParam) {
                        existingParam.value = transportUrlPlaceholder;
                    } else {
                        tag.parameter.push({
                            type: 'TEMPLATE',
                            key: 'server_container_url',
                            value: transportUrlPlaceholder
                        });
                    }
                }
            }
        }

        return container;
    }

    // ---------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------

    /**
     * Returns statistics about the generated SSG container.
     * @returns {Object} Summary object
     */
    getSummary() {
        // Collect placeholders from generated constants
        const placeholders = this.generatedConstants.map(c => ({
            name: c.name,
            placeholder: c.parameter[0].value
        }));

        // Add transport URL placeholder if not already in constants
        // (it is always added, but this ensures consistency)
        const hasTransport = placeholders.some(p => p.name === 'const - transport url');
        if (!hasTransport) {
            placeholders.push({
                name: 'const - transport url',
                placeholder: '[HIER_EINFUEGEN: Server-Side GTM URL, z.B. https://sgtm.example.com]'
            });
        }

        return {
            tagsCreated: this.generatedTags.length,
            triggersCreated: this.generatedTriggers.length,
            constantsCreated: this.generatedConstants.length,
            eventDataVarsCreated: this.generatedEventDataVars.length,
            clientsCreated: this.generatedClients.length,
            templatesCreated: this.generatedCustomTemplates?.length || 0,
            placeholders: placeholders,
            tagMapping: this.tagMapping
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GTMServerSideGenerator;
}
