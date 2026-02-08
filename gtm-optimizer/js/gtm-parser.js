/**
 * GTM Container Optimizer - GTM Parser
 * Parses and validates GTM container JSON exports
 */

class GTMParser {
    constructor() {
        this.container = null;
        this.parsed = false;
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Parse GTM container JSON
     * @param {string|Object} input - JSON string or object
     * @returns {boolean} Success status
     */
    parse(input) {
        this.errors = [];
        this.warnings = [];
        this.parsed = false;

        try {
            // Parse string if needed
            const data = typeof input === 'string' ? JSON.parse(input) : input;

            // Validate structure
            if (!this.validateStructure(data)) {
                return false;
            }

            this.container = data;
            this.parsed = true;
            this.analyzeContainer();
            return true;

        } catch (error) {
            this.errors.push({
                type: 'parse-error',
                message: `Ungültiges JSON: ${error.message}`
            });
            return false;
        }
    }

    /**
     * Validate GTM container structure
     * @param {Object} data - Container data
     * @returns {boolean} Valid status
     */
    validateStructure(data) {
        if (!data || typeof data !== 'object') {
            this.errors.push({
                type: 'validation-error',
                message: 'Die Daten sind kein gültiges Objekt'
            });
            return false;
        }

        // Check for required top-level properties
        const requiredProps = ['containerVersion'];
        for (const prop of requiredProps) {
            if (!(prop in data)) {
                this.errors.push({
                    type: 'validation-error',
                    message: `Erforderliche Eigenschaft fehlt: ${prop}`
                });
                return false;
            }
        }

        const version = data.containerVersion;
        if (!version || typeof version !== 'object') {
            this.errors.push({
                type: 'validation-error',
                message: 'containerVersion ist kein gültiges Objekt'
            });
            return false;
        }

        return true;
    }

    /**
     * Analyze container structure and collect metadata
     */
    analyzeContainer() {
        const version = this.container.containerVersion;

        // Extract container info
        this.containerInfo = {
            accountId: version.accountId,
            containerId: version.containerId,
            containerVersionId: version.containerVersionId,
            containerPublicId: version.containerPublicId || 'GTM-XXXXXX',
            name: version.container?.name || 'GTM Container',
            exported: version.container?.usageContext?.[0] || 'unknown',
            exportTime: new Date().toISOString(),
            tagCount: 0,
            triggerCount: 0,
            variableCount: 0,
            folderCount: 0,
            templateCount: 0
        };

        // Count entities
        if (version.tag) {
            this.containerInfo.tagCount = version.tag.filter(t => !t.liveOnly).length;
        }
        if (version.trigger) {
            this.containerInfo.triggerCount = version.trigger.filter(t => !t.liveOnly).length;
        }
        if (version.variable) {
            this.containerInfo.variableCount = version.variable.filter(v => !v.liveOnly).length;
        }
        if (version.folder) {
            this.containerInfo.folderCount = version.folder.length;
        }
        if (version.customTemplate) {
            this.containerInfo.templateCount = version.customTemplate.length;
        }

        // Build indexes for quick lookups
        this.buildIndexes();
    }

    /**
     * Build indexes for quick entity lookups
     */
    buildIndexes() {
        const version = this.container.containerVersion;

        // Tag index by path
        this.tagIndex = new Map();
        if (version.tag) {
            version.tag.forEach((tag, idx) => {
                if (!tag.liveOnly) {
                    this.tagIndex.set(tag.path, { ...tag, _index: idx });
                }
            });
        }

        // Trigger index by path
        this.triggerIndex = new Map();
        if (version.trigger) {
            version.trigger.forEach((trigger, idx) => {
                if (!trigger.liveOnly) {
                    this.triggerIndex.set(trigger.path, { ...trigger, _index: idx });
                }
            });
        }

        // Variable index by path and name
        this.variableIndex = new Map();
        this.variableNameIndex = new Map();
        if (version.variable) {
            version.variable.forEach((variable, idx) => {
                if (!variable.liveOnly) {
                    this.variableIndex.set(variable.path, { ...variable, _index: idx });
                    this.variableNameIndex.set(variable.name, { ...variable, _index: idx });
                }
            });
        }

        // Folder index
        this.folderIndex = new Map();
        if (version.folder) {
            version.folder.forEach(folder => {
                this.folderIndex.set(folder.path, folder);
            });
        }

        // Template index
        this.templateIndex = new Map();
        if (version.customTemplate) {
            version.customTemplate.forEach(template => {
                this.templateIndex.set(template.templateId, template);
            });
        }

        // Build dependency maps
        this.buildDependencyMaps();
    }

    /**
     * Build dependency maps between entities
     */
    buildDependencyMaps() {
        // Tag -> Trigger dependencies
        this.tagTriggerMap = new Map();
        for (const [path, tag] of this.tagIndex) {
            const triggerIds = tag.firingTriggerId || [];
            this.tagTriggerMap.set(path, new Set(triggerIds));
        }

        // Tag -> Variable dependencies (via parameters)
        this.tagVariableMap = new Map();
        for (const [path, tag] of this.tagIndex) {
            const refs = this.findVariableReferences(tag);
            this.tagVariableMap.set(path, refs);
        }

        // Trigger -> Variable dependencies
        this.triggerVariableMap = new Map();
        for (const [path, trigger] of this.triggerIndex) {
            const refs = this.findVariableReferences(trigger);
            this.triggerVariableMap.set(path, refs);
        }

        // Variable -> Variable dependencies
        this.variableVariableMap = new Map();
        for (const [path, variable] of this.variableIndex) {
            const refs = this.findVariableReferences(variable);
            this.variableVariableMap.set(path, refs);
        }

        // Reverse lookup: what uses each entity
        this.buildReverseMaps();
    }

    /**
     * Find variable references in an entity
     * @param {Object} entity - GTM entity
     * @returns {Set<string>} Variable names referenced
     */
    findVariableReferences(entity) {
        const refs = new Set();

        // Check parameters
        if (entity.parameter) {
            for (const param of entity.parameter) {
                if (param.type === 'TEMPLATE' && typeof param.value === 'string') {
                    // Find {{variable}} patterns
                    const matches = param.value.match(/\{\{([^}]+)\}\}/g);
                    if (matches) {
                        matches.forEach(match => {
                            refs.add(match.replace(/\{\{|\}\}/g, '').trim());
                        });
                    }
                }

                // Check nested parameters in maps
                if (param.map) {
                    for (const entry of param.map) {
                        if (entry.parameter) {
                            entry.parameter.forEach(p => {
                                if (p.type === 'TEMPLATE' && typeof p.value === 'string') {
                                    const matches = p.value.match(/\{\{([^}]+)\}\}/g);
                                    if (matches) {
                                        matches.forEach(m => refs.add(m.replace(/\{\{|\}\}/g, '').trim()));
                                    }
                                }
                            });
                        }
                    }
                }

                // Check nested parameters in lists
                if (param.list) {
                    for (const item of param.list) {
                        if (item.type === 'TEMPLATE' && typeof item.value === 'string') {
                            const matches = item.value.match(/\{\{([^}]+)\}\}/g);
                            if (matches) {
                                matches.forEach(m => refs.add(m.replace(/\{\{|\}\}/g, '').trim()));
                            }
                        }
                    }
                }
            }
        }

        // Check filter conditions
        if (entity.filter) {
            for (const filter of entity.filter) {
                if (filter.parameter) {
                    for (const param of filter.parameter) {
                        if (param.type === 'TEMPLATE' && typeof param.value === 'string') {
                            const matches = param.value.match(/\{\{([^}]+)\}\}/g);
                            if (matches) {
                                matches.forEach(m => refs.add(m.replace(/\{\{|\}\}/g, '').trim()));
                            }
                        }
                    }
                }
            }
        }

        // Check conditions
        if (entity.condition) {
            for (const cond of entity.condition) {
                if (cond.parameter) {
                    for (const param of cond.parameter) {
                        if (param.type === 'TEMPLATE' && typeof param.value === 'string') {
                            const matches = param.value.match(/\{\{([^}]+)\}\}/g);
                            if (matches) {
                                matches.forEach(m => refs.add(m.replace(/\{\{|\}\}/g, '').trim()));
                            }
                        }
                    }
                }
            }
        }

        return refs;
    }

    /**
     * Build reverse dependency maps
     */
    buildReverseMaps() {
        // Which tags use each trigger
        this.triggerUsageMap = new Map();
        for (const trigger of this.triggerIndex.values()) {
            this.triggerUsageMap.set(trigger.path, new Set());
        }
        for (const [tagPath, triggerIds] of this.tagTriggerMap) {
            for (const triggerId of triggerIds) {
                const trigger = this.getTriggerByTriggerId(triggerId);
                if (trigger) {
                    if (!this.triggerUsageMap.has(trigger.path)) {
                        this.triggerUsageMap.set(trigger.path, new Set());
                    }
                    this.triggerUsageMap.get(trigger.path).add(tagPath);
                }
            }
        }

        // Which entities use each variable
        this.variableUsageMap = new Map();
        for (const variable of this.variableIndex.values()) {
            this.variableUsageMap.set(variable.name, new Set());
        }

        // Tags using variables
        for (const [tagPath, varNames] of this.tagVariableMap) {
            for (const varName of varNames) {
                if (!this.variableUsageMap.has(varName)) {
                    this.variableUsageMap.set(varName, new Set());
                }
                this.variableUsageMap.get(varName).add(`tag:${tagPath}`);
            }
        }

        // Triggers using variables
        for (const [triggerPath, varNames] of this.triggerVariableMap) {
            for (const varName of varNames) {
                if (!this.variableUsageMap.has(varName)) {
                    this.variableUsageMap.set(varName, new Set());
                }
                this.variableUsageMap.get(varName).add(`trigger:${triggerPath}`);
            }
        }

        // Variables using variables
        for (const [varPath, varNames] of this.variableVariableMap) {
            for (const varName of varNames) {
                if (!this.variableUsageMap.has(varName)) {
                    this.variableUsageMap.set(varName, new Set());
                }
                this.variableUsageMap.get(varName).add(`variable:${varPath}`);
            }
        }
    }

    /**
     * Get trigger by trigger ID
     * @param {string} triggerId - Trigger ID
     * @returns {Object|null} Trigger object
     */
    getTriggerByTriggerId(triggerId) {
        for (const trigger of this.triggerIndex.values()) {
            if (trigger.triggerId === triggerId) {
                return trigger;
            }
        }
        return null;
    }

    /**
     * Get all tags
     * @returns {Array} Array of tags
     */
    getTags() {
        return Array.from(this.tagIndex.values());
    }

    /**
     * Get all triggers
     * @returns {Array} Array of triggers
     */
    getTriggers() {
        return Array.from(this.triggerIndex.values());
    }

    /**
     * Get all variables
     * @returns {Array} Array of variables
     */
    getVariables() {
        return Array.from(this.variableIndex.values());
    }

    /**
     * Get all folders
     * @returns {Array} Array of folders
     */
    getFolders() {
        return Array.from(this.folderIndex.values());
    }

    /**
     * Get all custom templates
     * @returns {Array} Array of templates
     */
    getTemplates() {
        return Array.from(this.templateIndex.values());
    }

    /**
     * Get unused tags (tags with no references)
     * @returns {Array} Array of unused tags
     */
    getUnusedTags() {
        // A tag is "unused" if it only has the "Once" trigger (triggerId: 2147479553)
        // or if its triggering trigger is never fired
        const unused = [];
        for (const tag of this.tagIndex.values()) {
            const triggerIds = tag.firingTriggerId || [];
            if (triggerIds.length === 0) {
                unused.push(tag);
            } else {
                // Check if all triggers are the "Once" trigger or other "broken" triggers
                const hasValidTrigger = triggerIds.some(tid => {
                    const trigger = this.getTriggerByTriggerId(tid);
                    return trigger && tid !== '2147479553'; // Once trigger ID
                });
                if (!hasValidTrigger) {
                    unused.push(tag);
                }
            }
        }
        return unused;
    }

    /**
     * Get unused triggers
     * @returns {Array} Array of unused triggers
     */
    getUnusedTriggers() {
        const unused = [];
        for (const trigger of this.triggerIndex.values()) {
            const users = this.triggerUsageMap.get(trigger.path);
            if (!users || users.size === 0) {
                unused.push(trigger);
            }
        }
        return unused;
    }

    /**
     * Get unused variables
     * @returns {Array} Array of unused variables
     */
    getUnusedVariables() {
        const unused = [];
        for (const variable of this.variableIndex.values()) {
            const users = this.variableUsageMap.get(variable.name);
            if (!users || users.size === 0) {
                unused.push(variable);
            }
        }
        return unused;
    }

    /**
     * Get container info
     * @returns {Object} Container metadata
     */
    getContainerInfo() {
        return this.containerInfo;
    }

    /**
     * Check if parser has valid data
     * @returns {boolean}
     */
    isValid() {
        return this.parsed;
    }

    /**
     * Get all errors
     * @returns {Array} Array of errors
     */
    getErrors() {
        return this.errors;
    }

    /**
     * Get all warnings
     * @returns {Array} Array of warnings
     */
    getWarnings() {
        return this.warnings;
    }

    /**
     * Get the raw container
     * @returns {Object} Container object
     */
    getContainer() {
        return this.container;
    }

    /**
     * Get variable by name
     * @param {string} name - Variable name
     * @returns {Object|null} Variable object
     */
    getVariableByName(name) {
        return this.variableNameIndex.get(name) || null;
    }

    /**
     * Find duplicate entities
     * @returns {Object} Object with arrays of duplicates
     */
    findDuplicates() {
        const duplicates = {
            tags: [],
            triggers: [],
            variables: []
        };

        // Check for duplicate tags (same type and parameters)
        const tagSignatures = new Map();
        for (const tag of this.tagIndex.values()) {
            const signature = this.getTagSignature(tag);
            if (!tagSignatures.has(signature)) {
                tagSignatures.set(signature, []);
            }
            tagSignatures.get(signature).push(tag);
        }

        for (const [signature, tags] of tagSignatures) {
            if (tags.length > 1) {
                duplicates.tags.push({ signature, items: tags });
            }
        }

        // Check for duplicate triggers
        const triggerSignatures = new Map();
        for (const trigger of this.triggerIndex.values()) {
            const signature = this.getTriggerSignature(trigger);
            if (!triggerSignatures.has(signature)) {
                triggerSignatures.set(signature, []);
            }
            triggerSignatures.get(signature).push(trigger);
        }

        for (const [signature, triggers] of triggerSignatures) {
            if (triggers.length > 1) {
                duplicates.triggers.push({ signature, items: triggers });
            }
        }

        // Check for duplicate variables
        const variableSignatures = new Map();
        for (const variable of this.variableIndex.values()) {
            const signature = this.getVariableSignature(variable);
            if (!variableSignatures.has(signature)) {
                variableSignatures.set(signature, []);
            }
            variableSignatures.get(signature).push(variable);
        }

        for (const [signature, variables] of variableSignatures) {
            if (variables.length > 1) {
                duplicates.variables.push({ signature, items: variables });
            }
        }

        return duplicates;
    }

    /**
     * Get signature of a tag for comparison
     * @param {Object} tag - Tag object
     * @returns {string} Signature string
     */
    getTagSignature(tag) {
        const parts = [
            tag.type,
            JSON.stringify(tag.parameter || []),
            JSON.stringify(tag.firingTriggerId || []),
            JSON.stringify(tag.blockingTriggerId || [])
        ];
        return parts.join('|');
    }

    /**
     * Get signature of a trigger for comparison
     * @param {Object} trigger - Trigger object
     * @returns {string} Signature string
     */
    getTriggerSignature(trigger) {
        const parts = [
            trigger.type,
            JSON.stringify(trigger.parameter || []),
            JSON.stringify(trigger.filter || []),
            JSON.stringify(trigger.condition || [])
        ];
        return parts.join('|');
    }

    /**
     * Get signature of a variable for comparison
     * @param {Object} variable - Variable object
     * @returns {string} Signature string
     */
    getVariableSignature(variable) {
        const parts = [
            variable.type,
            JSON.stringify(variable.parameter || []),
            JSON.stringify(variable.enforceSafeRules || false)
        ];
        return parts.join('|');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GTMParser;
}
